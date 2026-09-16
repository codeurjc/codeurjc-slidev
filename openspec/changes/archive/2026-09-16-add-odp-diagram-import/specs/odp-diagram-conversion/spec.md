## ADDED Requirements

### Requirement: Diagram groups are formed from a slide's remaining drawing
After code annotations have claimed their highlight boxes, labels and connectors, the importer SHALL gather a content slide's remaining drawing into **groups**. Group members are images, bordered or filled shapes (with or without text), non-rectangular geometric shapes (e.g. a hexagon or trapezoid), lines, connectors and arrow shapes, and positioned text boxes outside the title, body, code, link boxes and tables. A line, connector or arrow SHALL join any member within the connector distance of it, measured along its whole length. Other shapes SHALL join only when they overlap or touch, except plain (unbordered, unfilled) text, which SHALL join a shape only when its centre lies on it, so a caption or heading merely placed next to a screenshot doesn't pull it into a diagram. In a group containing a line or arrow, a short plain text (up to three lines) within 1 cm of one of its other shapes SHALL also join, as that shape's label (a node's name beside its icon). Joining is transitive. A group containing or touching a code shape or a table SHALL NOT be a diagram.

A group without images SHALL go to the mermaid tier when it's a clear graph. Any other group SHALL be an **SVG candidate** when both of these hold:
- converting it the ordinary way (callouts, flattened paragraphs, emitted images) would lose something: at least one member would be reported as a loss, or a rotated text box would become a callout and lose its rotation. Losing only side labels flattened into paragraphs, or an empty frame drawn around a whole image, doesn't count;
- it contains an image or at least two box-like shapes (bordered or filled shapes, or non-rectangular geometric shapes).

A group that converts without losses SHALL keep its ordinary conversion, so screenshots whose arrows and labels all become callouts stay as they are.

#### Scenario: Pipeline of boxes and block arrows
- **WHEN** a slide has three filled rectangles "Requisitos", "Análisis / Diseño" and "Implementación" in a row, joined by two right-arrow shapes, besides its title and body
- **THEN** those five shapes form one group, which goes to the mermaid tier

#### Scenario: Screenshot callouts that convert fully stay callouts
- **WHEN** an arrow from a text box points into a screenshot, and both become a slide callout with nothing else left over
- **THEN** no SVG candidate is formed, and the slide keeps the image and its callout

#### Scenario: Image with a lossy overlay is a candidate
- **WHEN** an image has two hexagons and four rotated text-bearing trapezoids drawn on top of it
- **THEN** the image and all those shapes form one SVG candidate

#### Scenario: Arrow from code is not a diagram
- **WHEN** an arrow runs from a code shape to a bordered explanation box
- **THEN** that box and arrow don't form a diagram, and code annotations handle them

### Requirement: Clear graphs become mermaid flowcharts
A group SHALL become a fenced `mermaid` `flowchart` when it's a **clear graph**:
- it has no images, and at least two boxes;
- every box-like member is a rectangle with text, with no line or other shape drawn inside it, and doesn't overlap another box;
- every line, connector or arrow joins two distinct boxes, with its ends within the connector distance of each, except arrows that become node callouts;
- every box is joined to at least one other box;
- all edges run horizontally, or all run vertically (angle within 20° of the axis);
- the only other members are the labels of node callouts.

Direction SHALL be `LR` for horizontal edges and `TB` for vertical ones. Each box SHALL become a node with its text as the label, declared in reading order along that direction. An edge SHALL be directed (`-->`) from tail to tip when its shape tells its direction (an arrow custom shape's pointing direction after rotation, or a line's arrowhead markers), and undirected (`---`) otherwise. The flowchart SHALL NOT set colours, styles or a theme, so it renders with mermaid's defaults. A group that isn't a clear graph SHALL be considered for the SVG tier.

#### Scenario: Pipeline becomes a left-to-right flowchart
- **WHEN** the pipeline "Requisitos" → "Análisis / Diseño" → "Implementación" is converted
- **THEN** the slide contains a `mermaid` fence declaring `flowchart LR` with three nodes labelled "Requisitos", "Análisis / Diseño" and "Implementación" and the edges Requisitos → Análisis / Diseño and Análisis / Diseño → Implementación, and none of those shapes is reported as a loss

#### Scenario: Compartmented box is not a clear graph
- **WHEN** a group's box has a line drawn across it separating a class name from its methods
- **THEN** no mermaid fence is emitted for it

#### Scenario: Mixed directions are not a clear graph
- **WHEN** a group's boxes are joined by one horizontal and one vertical arrow
- **THEN** no mermaid fence is emitted for it

#### Scenario: Label text with markdown-sensitive characters
- **WHEN** a node's text is `Chat "demo"`
- **THEN** the node's label renders as `Chat "demo"` in the diagram, with the quotes escaped in the mermaid source

### Requirement: A mermaid diagram sits where the drawing sat in the content
A mermaid diagram SHALL be placed among the slide's content blocks by position. When the diagram lies vertically within the body text box and the body has a run of empty paragraphs, the diagram SHALL be inserted at the run whose estimated vertical position is closest to the diagram's top, splitting the body there. Otherwise it SHALL be ordered with the slide's other blocks by its top edge.

#### Scenario: Diagram between an intro line and bullets
- **WHEN** the body reads "Desarrollo con Pruebas al Final", "TLD (Test Last Development)", four empty paragraphs, then three bullets, and the pipeline diagram overlaps the body where the empty paragraphs are
- **THEN** the converted slide shows the two intro lines, then the mermaid diagram, then the three bullets

#### Scenario: Diagram below the body
- **WHEN** a clear graph lies entirely below the body text box
- **THEN** the mermaid diagram follows the body's content

### Requirement: A labelled arrow pointing at a diagram node becomes a callout on that node
In the mermaid tier, an arrow in the group that has exactly one end on a node of the diagram and a text box without border at its other end SHALL become a slide callout anchored at the node's label text (`{text: <label>}`), carrying the text box's text, with no `box` so it's auto-placed (mermaid's layout differs from the drawing's, so the label's original position means nothing next to the rendered node). The arrow and the text box SHALL be claimed so they aren't reported as losses. When the node's label text also occurs in the slide's other content, a text anchor would be ambiguous: the group SHALL NOT be converted to mermaid and SHALL be considered for the SVG tier instead.

#### Scenario: "Pruebas" arrow under a pipeline step
- **WHEN** a red arrow rotated to point up has its tip on "Requisitos" and its tail on the unbordered text "Pruebas"
- **THEN** the converted slide has a callout anchored at `{text: Requisitos}` with the text "Pruebas", and neither the arrow nor "Pruebas" is reported as a loss

#### Scenario: Node label repeated in the bullets
- **WHEN** a labelled arrow points at the node "Implementación" and a bullet on the same slide also contains "Implementación"
- **THEN** no mermaid fence is emitted for that group

### Requirement: Other diagrams are embedded as SVG cropped from LibreOffice's export
An SVG candidate SHALL become an SVG image built from LibreOffice's SVG export of the deck when LibreOffice ≥ 7.4 is available and the slide is not hidden. The image replaces the candidate's own images, callouts and paragraphs. The image SHALL contain only the candidate's members, including its images, with its view box set to the union of those members' bounding boxes plus a small margin. It SHALL NOT include the master page, the background, or the slide's title, body, code, tables, links or other converted content, even where they overlap the diagram's area. Each member SHALL be matched to its shape in the export by bounding box. Other shapes without a role (not title, body, code, table or link) lying fully inside the diagram's bounding box SHALL be included too when the export has them; this covers decorations the importer can't classify, such as a curved arrow drawn as a path.

The image SHALL be written under `public/images/` and referenced from the slide after the slide's other images, so the image indexes of the slide's remaining callout anchors don't change. It SHALL get a `geometry.images` entry at the candidate's mapped bounding box.

#### Scenario: UML class diagram embedded as an image
- **WHEN** a slide has "Chat", "User" and "WebSocketUser" class boxes with compartment lines, an association line with a "*" label and an inheritance line ending in a triangle shape, and LibreOffice 25.8 is available
- **THEN** the converted slide references an SVG image under `public/images/` positioned by `geometry.images` where the diagram was, the image shows those boxes, lines, triangle and "*", and it doesn't show the slide's "Ejercicio 8" bullet even though that bullet overlaps the diagram's area

#### Scenario: Hexagonal architecture embedded as an image
- **WHEN** a slide has a diagram image with two hexagons, four rotated trapezoids labelled as ports and text labels drawn on top of it, and LibreOffice 25.8 is available
- **THEN** the converted slide references one SVG image containing the picture and all those shapes, has no callouts for those labels, and none of those shapes is reported as a loss

#### Scenario: Diagram image comes after existing images
- **WHEN** a slide has a screenshot with a callout anchored at `{image: 0, …}` and, elsewhere on the slide, an SVG-tier diagram
- **THEN** the screenshot is still the slide's first image and the diagram image is the second

### Requirement: Diagrams that can't be embedded keep their ordinary conversion
When LibreOffice ≥ 7.4 isn't available, or the slide is hidden (LibreOffice doesn't export hidden slides), an SVG candidate SHALL be converted exactly as it would be without diagram conversion: images emitted, arrows and labels turned into callouts where possible, and everything else reported as a loss with the usual descriptions. When the export fails or a member can't be matched in it, the diagram SHALL be omitted and reported as a single loss, `diagram omitted (not found in LibreOffice's SVG export)`.

When this happens because LibreOffice is unavailable, the console SHALL say once that diagrams were kept as losses because LibreOffice ≥ 7.4 wasn't found.

#### Scenario: No LibreOffice
- **WHEN** a deck with the UML class diagram is imported on a machine without `soffice`
- **THEN** the class diagram's boxes and lines are reported as losses for that slide, no diagram image is written, and the console notes that diagrams were kept as losses because LibreOffice ≥ 7.4 wasn't found

#### Scenario: Hidden slide
- **WHEN** a hidden ODP slide holds an SVG candidate
- **THEN** its shapes get their ordinary conversion and losses, and no diagram image is written for it

### Requirement: Converted diagrams are reported as info
Each diagram converted to mermaid SHALL add the note `diagram converted to a mermaid flowchart` to its slide's info notes, and each diagram embedded as an SVG SHALL add the note `diagram embedded as an SVG image (not editable)`. These notes SHALL NOT be losses.

#### Scenario: Notes for converted diagrams
- **WHEN** a deck with the pipeline diagram and the UML class diagram is imported with LibreOffice available
- **THEN** the console lists the mermaid note for the pipeline's slide and the SVG note for the class diagram's slide under the info section, and neither slide is listed as having losses on account of its diagram

### Requirement: Build-ups keep diagrams intact
Slides in a build-up run SHALL only be merged if every slide in the run has the same diagrams: the same mermaid source, or the same members for an SVG-tier diagram. A diagram that is added or changes across the run SHALL keep the slides separate, with the existing build-up warning.

#### Scenario: Same diagram, added bullet
- **WHEN** two consecutive slides with the same title show the same pipeline diagram and the second adds a trailing bullet
- **THEN** they merge into one slide with the diagram and the bullet revealed on click

#### Scenario: Diagram changes across slides
- **WHEN** two consecutive slides with the same title show the pipeline diagram and the second adds a fourth box
- **THEN** the slides stay separate and the console warns that the build-up couldn't be converted

#### Scenario: Caption beside a screenshot
- **WHEN** a slide has a screenshot and, 0.3 cm below it, an unconnected positioned text box that gets flattened into a paragraph
- **THEN** no SVG candidate is formed, and the screenshot and paragraph are emitted as today

#### Scenario: Labels beside a network diagram's icons
- **WHEN** five computer images are joined by arrowed lines, and "Nodo #1 IE en Windows 7" is written 0.8 cm to the right of one of them
- **THEN** that text is part of the diagram's group, so it appears in the embedded image rather than as a paragraph

#### Scenario: Callouts on a framed code screenshot stay callouts
- **WHEN** a code screenshot has an empty frame around it, a caption beside it, and three arrows from boxes to its lines that all become callouts
- **THEN** no SVG candidate is formed
