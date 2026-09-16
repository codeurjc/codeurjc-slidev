## ADDED Requirements

### Requirement: Arrows and labels over images become slide callouts
The importer SHALL convert annotations drawn over an image into `callouts` frontmatter entries on the slide, as follows:
- an arrow whose tip lands on an image, connected to a text box, SHALL become a callout anchored at that point of the image, with the text box's text and its mapped position as the callout's `box`;
- an arrow whose tip lands on an image with no text box connected to it SHALL become a callout with no text, so it renders as a bare arrow;
- a text box drawn on top of an image SHALL become a callout whose anchor and `box` are that text's position, so it renders as a label with no connector;
- a labelled arrow pointing at slide content rather than at an image SHALL become a callout with a slide-point anchor.

Anchors on images SHALL be expressed as fractions of the image, so they survive the image being repositioned or resized.

#### Scenario: Screenshot callout
- **WHEN** an ODP slide has an arrow from the text box "Le damos un nombre a nuestro grupo" to a point inside a screenshot
- **THEN** the converted slide has a callout anchored at that fraction of that image, carrying that text, and the arrow is not reported as a loss

#### Scenario: Bare pointer over a screenshot
- **WHEN** an arrow points into a screenshot and no text box is connected to it
- **THEN** the converted slide has a callout with no text at that point, rendering as an arrow with no box

#### Scenario: Label drawn on a diagram image
- **WHEN** the text "<<interface>> PuertoA" sits on top of an image
- **THEN** the converted slide has a callout whose box is pinned at that position with no connector, and the text is not flattened into a paragraph

## MODIFIED Requirements

### Requirement: Losses are reported, never written into slides.md
Every ODP element the importer omits, or can't convert faithfully, SHALL be recorded as a loss with its ODP slide number, the corresponding Slidev slide number, and a short description. This covers arrows, lines and connectors not used for code callouts or slide callouts; decorative or diagram shapes; groups; OLE objects and charts; highlight boxes not matched to code lines; unsupported images; and positioned text boxes flattened into paragraphs. Each loss SHALL be printed to the console. `slides.md` SHALL NOT contain warnings, loss notices, or comparison material.

#### Scenario: Diagram shapes reported
- **WHEN** a slide contains three flowchart rectangles and two arrows besides its title
- **THEN** the console lists those shapes as losses for that slide, and the slide in `slides.md` contains only its title and any convertible content

#### Scenario: Slidev slide number accounts for hidden slides
- **WHEN** ODP slide 1 is hidden and ODP slide 16 has a loss
- **THEN** the loss is reported with ODP slide 16 and the Slidev slide number that slide gets when presented, which doesn't count hidden slides

#### Scenario: Arrows converted to callouts are not losses
- **WHEN** a slide's only unconverted-looking elements are an arrow into an image and its connected text box, both of which become a slide callout
- **THEN** no loss is recorded for that slide on their account
