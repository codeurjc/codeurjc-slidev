## ADDED Requirements

### Requirement: Each ODP slide becomes one slide, in order
Importing an ODP SHALL produce a `slides.md` with one slide per ODP slide, in the ODP's order. The only exception is slides merged by the build-up rule. A hidden ODP slide SHALL be emitted with `hide: true` in its frontmatter, so it stays in the markdown without being presented.

#### Scenario: Slide count and order preserved
- **WHEN** an ODP with 21 slides and no merged build-ups is imported
- **THEN** `slides.md` contains 21 slides whose content follows the ODP's slide order

#### Scenario: Hidden slide is kept but hidden
- **WHEN** ODP slide 1 is hidden (its drawing-page style has `presentation:visibility="hidden"`)
- **THEN** the corresponding slide in `slides.md` has `hide: true` and still contains its converted content

### Requirement: Cover and copyright slides use the theme's layouts
A cover slide (subject text, lesson and title outlines, a date shape and an authors shape) SHALL become a slide with `layout: cover`, with `subject`, `lesson`, `date` and `authors` in its frontmatter and the title as its `#` heading. A copyright slide (a "©" line with license text) SHALL become a slide with `layout: copyright`. The first slide of `slides.md` SHALL carry the deck headmatter (`theme: codeurjc-slidev-theme`, `aspectRatio: 16/9`, `colorSchema: light`).

#### Scenario: Cover fields extracted
- **WHEN** ODP slide 2 has the subject "Ampliación de Ingeniería del Software", the lesson "Bloque 1: Introducción a pruebas software", the title "Tema 1.1: Introducción a pruebas software", the date "12-2025", and the authors "Micael Gallego, …"
- **THEN** its slide has `layout: cover`, `subject`, `lesson`, `date` and `authors` set to those values, and `# Tema 1.1: Introducción a pruebas software` as content

#### Scenario: Copyright slide detected
- **WHEN** an ODP slide's text starts with "©2025" and mentions the Creative Commons license
- **THEN** its slide has `layout: copyright`

### Requirement: Titles are detected from placeholders or the top band
A content slide's title SHALL be taken from its `presentation:class="title"` frame. When there is none, it SHALL be taken from a short, non-monospace text shape of at most two lines located in the top band of the page (top edge within the top 20% of page height). A slide with neither SHALL have no title of its own.

#### Scenario: Placeholder title
- **WHEN** a slide has a title frame reading "Justificación y objetivos"
- **THEN** that text is the slide's title

#### Scenario: PPTX-style deck without placeholders
- **WHEN** a slide has no title frame but has a bold text rectangle "Introducción" at the top of the page
- **THEN** "Introducción" is the slide's title

### Requirement: Heading levels follow the ODP title structure
- A two-line title (two paragraphs, or one paragraph split by a line break) SHALL map its first line to `#` and its second line to `##`. The slide's in-content heading, if any, SHALL then map to `###`.
- A single-line title SHALL map to `#`, and the slide's in-content heading, if any, SHALL map to `##`.
- An in-content heading is either the body's leading list-header paragraph, or a first-level list item whose whole text is bold and which is the body's first item and either has sub-items or is the body's only item. A bold first item followed by sibling items SHALL NOT become a heading.
- When a lone bold first-level item becomes a heading, its sub-items SHALL be promoted one nesting level.

#### Scenario: Two-line title with an in-content heading
- **WHEN** a slide's title reads "Tipos de pruebas" then (after a line break) "Qué características prueban", and its body starts with the list-header "Pruebas No Funcionales"
- **THEN** the slide's leading headings are `# Tipos de pruebas`, `## Qué características prueban`, and `### Pruebas No Funcionales`

#### Scenario: Bold first bullet in an agenda
- **WHEN** a slide's body lists "Introducción" (bold), "Casos de Test" and "Dobles" as first-level items with no sub-items
- **THEN** no in-content heading is emitted and all three stay list items

#### Scenario: Single-line title with a lone bold first bullet
- **WHEN** a slide's title is "Casos de Test" and its body's first item is the bold "Ejercicio 1" with three sub-items
- **THEN** the slide's leading headings are `# Casos de Test` and `## Ejercicio 1`, followed by the three sub-items as a first-level list

### Requirement: Headings use title carry-over with minimal repetition
The importer SHALL write `#` and `##` headings so that the theme's title carry-over resolves each `default`-layout slide to the title and subtitle it had in the ODP, writing as few headings as possible:
- A heading SHALL be omitted when its value equals the value carried at that level.
- A bare `#` or `##` SHALL be written when the carried value must stop and the slide has none at that level.
- `resetTitle: true` SHALL be used instead when both levels must stop.

Carry-over resolution SHALL be simulated over all slides of `slides.md` in file order, including hidden ones, and skipping slides with other layouts, matching how Slidev's parser applies it.

#### Scenario: Repeated title omitted
- **WHEN** ODP slides 5 through 20 all have the title "Justificación y objetivos"
- **THEN** only the first of those slides contains `# Justificación y objetivos`, and the others contain no `#` heading

#### Scenario: Subtitle stops when the title changes without one
- **WHEN** ODP slide 73 has the title "Tipos de pruebas" / "Con qué conocimientos se diseñan", and slide 74 has only the title "Calidad de las pruebas"
- **THEN** slide 74's leading headings are `# Calidad de las pruebas` followed by a bare `##`, so the subtitle doesn't carry onto it

#### Scenario: A hidden slide's title is accounted for
- **WHEN** a hidden slide sets a new title and the next visible slide has the same title
- **THEN** the visible slide omits its `#` heading, because the carry-over chain includes the hidden slide

### Requirement: Lists keep their nesting and drop empty items
The slide body's `text:list` structure SHALL become a markdown bulleted list with the same nesting depth. List items with no text SHALL be dropped. Body paragraphs outside lists SHALL become paragraphs.

#### Scenario: Two-level list
- **WHEN** a body list has the item "Una de las actividades que se utilizan para:" with two sub-items, followed by an empty item
- **THEN** the slide contains a first-level item with two nested items, and no empty list item

### Requirement: Inline formatting is preserved
The importer SHALL preserve inline formatting within titles, list items and paragraphs:
- a text span whose effective style is bold SHALL become `**…**`;
- italic SHALL become `*…*`;
- a monospace font SHALL become inline code;
- a hyperlink SHALL become `[text](url)`, or `<url>` when the text equals the URL.

Whitespace at a formatting boundary SHALL be moved outside the markers so the markdown stays valid. Colors and underline SHALL be dropped without being reported as a loss.

#### Scenario: Bold run inside a bullet
- **WHEN** a list item consists of the bold span "Verificar" followed by the normal span " que el software funciona como fue diseñado"
- **THEN** the item reads `**Verificar** que el software funciona como fue diseñado`

#### Scenario: Monospace span inside prose
- **WHEN** a list item contains the monospace span "Complex(0,0)"
- **THEN** that span becomes `` `Complex(0,0)` ``

### Requirement: Link-only text boxes become a link below the content
A text box, outside the body, whose only content is a hyperlink SHALL become a paragraph containing that link, placed after the slide's other content.

#### Scenario: Reference link at the bottom of a slide
- **WHEN** a slide has a text box at the bottom containing only `https://martinfowler.com/bliki/UnitTest.html` as a hyperlink
- **THEN** the slide's content ends with a paragraph linking to `https://martinfowler.com/bliki/UnitTest.html`

### Requirement: Images are extracted and positioned with slide geometry
Each image frame SHALL be written to the project's `public/images/` directory and referenced from the slide as an image. When a frame holds both an SVG and a raster fallback, the SVG SHALL be used. Each referenced image SHALL get a `geometry.images` entry, in the same order as the images in the slide content. When the body box differs from the template's default body box beyond tolerance, the slide SHALL also get `geometry.content`. Positions SHALL be mapped from the ODP's default body region to the theme's default content box, scaling each axis independently, and clamped to the slide canvas. An image in a format browsers can't display SHALL be omitted and reported as a loss.

#### Scenario: List narrowed beside an image
- **WHEN** a slide's body box is narrowed to 14.5 cm and an image sits to its right
- **THEN** the slide's frontmatter has a `geometry.content` narrower than the default, and a `geometry.images` entry to the right of it, and the image file exists under `public/images/`

#### Scenario: SVG preferred over raster fallback
- **WHEN** an image frame contains an SVG image and a PNG fallback with the same geometry
- **THEN** only the SVG is copied and referenced

### Requirement: Plain tables become markdown tables
A table whose cells contain only text SHALL become a markdown table, using the first row as the header. A table overlapped by other shapes (e.g. images placed over cells) SHALL still be emitted as text, and the overlapping shapes reported as a loss.

#### Scenario: Two-column text table
- **WHEN** a slide contains a 4×2 table whose first row is "Proyecto | Descripción"
- **THEN** the slide contains a markdown table with that header row and three body rows

### Requirement: Build-ups merge into click steps when fully convertible
When consecutive ODP slides have the same title and each slide's content is the previous slide's content plus additions, the importer SHALL merge them into one slide that reveals each addition as a click step. This applies only if every addition is convertible: highlights and callouts on the same code, which become callout click steps, or trailing list items or images, which become click-revealed elements. Otherwise the slides SHALL stay separate, and a console warning SHALL name the ODP slides that couldn't be merged and why.

#### Scenario: Callouts added over the same code
- **WHEN** three consecutive ODP slides show the same YAML workflow, the second adds one labeled highlight box and the third adds two more
- **THEN** `slides.md` contains one slide with that code whose highlights carry click steps `{1}` (the second slide's) and `{2}` (the third slide's)

#### Scenario: Unconvertible overlay keeps separate slides
- **WHEN** consecutive slides show the same screenshot and each adds an arrow callout pointing into the image
- **THEN** the slides stay separate in `slides.md`, and the console warns that the build-up couldn't be converted to click steps

### Requirement: Losses are reported, never written into slides.md
Every ODP element the importer omits, or can't convert faithfully, SHALL be recorded as a loss with its ODP slide number, the corresponding Slidev slide number, and a short description. This covers arrows, lines and connectors not used for code callouts; decorative or diagram shapes; groups; OLE objects and charts; callouts over images; highlight boxes not matched to code lines; unsupported images; and positioned text boxes flattened into paragraphs. Each loss SHALL be printed to the console. `slides.md` SHALL NOT contain warnings, loss notices, or comparison material.

#### Scenario: Diagram shapes reported
- **WHEN** a slide contains three flowchart rectangles and two arrows besides its title
- **THEN** the console lists those shapes as losses for that slide, and the slide in `slides.md` contains only its title and any convertible content

#### Scenario: Slidev slide number accounts for hidden slides
- **WHEN** ODP slide 1 is hidden and ODP slide 16 has a loss
- **THEN** the loss is reported with ODP slide 16 and the Slidev slide number that slide gets when presented, which doesn't count hidden slides
