## ADDED Requirements

### Requirement: Rotated shapes keep their position and direction
The importer SHALL apply a shape's `draw:transform` (rotation and translation) when reading its geometry, so a rotated or transformed shape gets the bounding box it actually covers on the slide, a rotated line or arrow shape gets its real endpoints, and an arrow custom shape knows the direction it points after rotation. A line's arrowhead markers (`draw:marker-start`, `draw:marker-end`) SHALL determine which of its ends is the tip. Rotated shapes SHALL take part in code callouts, slide callouts, diagrams and loss reporting like any other shape.

#### Scenario: Right-arrow rotated to point up
- **WHEN** a 1.243 cm × 0.825 cm `right-arrow` shape has `draw:transform="rotate (1.5707963267949) translate (4.4cm 10.8cm)"`
- **THEN** its bounding box spans x 4.4–5.225 cm and y 9.557–10.8 cm, and it points up, with its tip at the top edge

#### Scenario: Arrowed line points from start to end
- **WHEN** a line's style has `draw:marker-end` and no `draw:marker-start`
- **THEN** its tip is its end point and its tail is its start point

### Requirement: Conversion notes are reported as info, separately from losses
A slide MAY carry info notes: things the importer converted in a way the author may want to review, but that lost nothing. Info notes SHALL be recorded per slide with the same ODP and Slidev slide numbers as losses, and printed to the console in their own section, after the counts and before the losses. A slide with info notes and no losses SHALL NOT be counted as a slide with losses. `slides.md` SHALL NOT contain info notes.

#### Scenario: Info section in the console
- **WHEN** Tema 1.1 slide 81 becomes a mermaid diagram and nothing else on it is lost
- **THEN** the console shows that slide with the note `diagram converted to a mermaid flowchart` in the info section, and that slide doesn't appear in the losses section

#### Scenario: No info section when there are no notes
- **WHEN** no slide has info notes
- **THEN** the console shows no info section

## MODIFIED Requirements

### Requirement: Losses are reported, never written into slides.md
Every ODP element the importer omits, or can't convert faithfully, SHALL be recorded as a loss with its ODP slide number, the corresponding Slidev slide number, and a short description. This covers arrows, lines and connectors not used for code callouts, slide callouts or converted diagrams; decorative or diagram shapes that weren't converted to a mermaid diagram or embedded as a diagram image; groups; OLE objects and charts; highlight boxes not matched to code lines; unsupported images; and positioned text boxes flattened into paragraphs. Each loss SHALL be printed to the console. `slides.md` SHALL NOT contain warnings, loss notices, or comparison material.

#### Scenario: Unconvertible diagram shapes reported
- **WHEN** a slide contains three flowchart rectangles and two arrows besides its title, they form a diagram that isn't a clear graph, and LibreOffice isn't available
- **THEN** the console lists those shapes as losses for that slide, and the slide in `slides.md` contains only its title and any convertible content

#### Scenario: Converted diagram shapes are not losses
- **WHEN** a slide's three flowchart rectangles and two arrows become a mermaid diagram
- **THEN** no loss is recorded for that slide on their account

#### Scenario: Slidev slide number accounts for hidden slides
- **WHEN** ODP slide 1 is hidden and ODP slide 16 has a loss
- **THEN** the loss is reported with ODP slide 16 and the Slidev slide number that slide gets when presented, which doesn't count hidden slides

#### Scenario: Arrows converted to callouts are not losses
- **WHEN** a slide's only unconverted-looking elements are an arrow into an image and its connected text box, both of which become a slide callout
- **THEN** no loss is recorded for that slide on their account

### Requirement: Arrows and labels over images become slide callouts
The importer SHALL convert annotations drawn over an image into `callouts` frontmatter entries on the slide, as follows:
- an arrow whose tip lands on an image, connected to a text box, SHALL become a callout anchored at that point of the image, with the text box's text and its mapped position as the callout's `box`;
- an arrow whose tip lands on an image with no text box connected to it SHALL become a callout with no text, so it renders as a bare arrow;
- a text box drawn on top of an image SHALL become a callout whose anchor and `box` are that text's position, so it renders as a label with no connector;
- a labelled arrow pointing at slide content rather than at an image SHALL become a callout with a slide-point anchor.

Anchors on images SHALL be expressed as fractions of the image, so they survive the image being repositioned or resized.

The exception is an image whose overlay can't be converted entirely this way: some shape, arrow or text on it would still be lost, or a rotated label would lose its rotation. When that image can be embedded as a diagram SVG, the image and its whole overlay SHALL become that SVG instead, with no callouts (see odp-diagram-conversion).

#### Scenario: Screenshot callout
- **WHEN** an ODP slide has an arrow from the text box "Le damos un nombre a nuestro grupo" to a point inside a screenshot
- **THEN** the converted slide has a callout anchored at that fraction of that image, carrying that text, and the arrow is not reported as a loss

#### Scenario: Bare pointer over a screenshot
- **WHEN** an arrow points into a screenshot and no text box is connected to it
- **THEN** the converted slide has a callout with no text at that point, rendering as an arrow with no box

#### Scenario: Label drawn on a diagram image
- **WHEN** the text "<<interface>> PuertoA" sits on top of an image
- **THEN** the converted slide has a callout whose box is pinned at that position with no connector, and the text is not flattened into a paragraph

#### Scenario: Lossy overlay becomes a diagram instead
- **WHEN** a diagram image has label text boxes drawn on it that would become callouts, but also a hexagon shape that callouts can't express, and LibreOffice is available
- **THEN** the image, labels and hexagon become one diagram SVG, and the slide has no callouts for those labels
