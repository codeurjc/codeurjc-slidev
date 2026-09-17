## MODIFIED Requirements

### Requirement: Images are extracted and positioned with slide geometry
Each image frame SHALL be written to the project's `public/images/` directory and referenced from the slide as an image. When a frame holds both an SVG and a raster fallback, the SVG SHALL be used. Each referenced image SHALL get a `geometry.images` entry keyed by its `src` (with `#N` when the same picture appears more than once on the slide). When the body box differs from the template's default body box beyond tolerance, the slide SHALL also get `geometry.content`. Positions SHALL be mapped from the ODP's default body region to the theme's default content box, scaling each axis independently, and clamped to the slide canvas. An image in a format browsers can't display SHALL be omitted and reported as a loss.

#### Scenario: List narrowed beside an image
- **WHEN** a slide's body box is narrowed to 14.5 cm and an image sits to its right
- **THEN** the slide's frontmatter has a `geometry.content` narrower than the default, and a `geometry.images` entry keyed by the image's `src` to the right of it, and the image file exists under `public/images/`

#### Scenario: SVG preferred over raster fallback
- **WHEN** an image frame contains an SVG image and a PNG fallback with the same geometry
- **THEN** only the SVG is copied and referenced

#### Scenario: Same picture twice on a slide
- **WHEN** a slide shows the same embedded picture in two frames
- **THEN** its `geometry.images` entries reference `/images/<name>#1` and `/images/<name>#2`

### Requirement: Arrows and labels over images become slide callouts
The importer SHALL convert annotations drawn over an image into `callouts` frontmatter entries on the slide, as follows:
- an arrow whose tip lands on an image, connected to a text box, SHALL become a callout anchored at that point of the image, with the text box's text and its mapped position as the callout's `box`;
- an arrow whose tip lands on an image with no text box connected to it SHALL become a callout with no text, so it renders as a bare arrow;
- a text box drawn on top of an image SHALL become a callout whose anchor and `box` are that text's position, so it renders as a label with no connector;
- a labelled arrow pointing at slide content rather than at an image SHALL become a callout with a slide-point anchor.

Anchors on images SHALL reference the image by its `src` and be expressed as fractions of the image, so they survive the image being repositioned, resized, or other images being added before it.

The exception is an image whose overlay can't be converted entirely this way: some shape, arrow or text on it would still be lost, or a rotated label would lose its rotation. When that image can be embedded as a diagram SVG, the image and its whole overlay SHALL become that SVG instead, with no callouts (see odp-diagram-conversion).

#### Scenario: Screenshot callout
- **WHEN** an ODP slide has an arrow from the text box "Le damos un nombre a nuestro grupo" to a point inside a screenshot
- **THEN** the converted slide has a callout anchored at `{ image: <the screenshot's src>, x, y }` at that fraction, carrying that text, and the arrow is not reported as a loss

#### Scenario: Bare pointer over a screenshot
- **WHEN** an arrow points into a screenshot and no text box is connected to it
- **THEN** the converted slide has a callout with no text at that point, rendering as an arrow with no box

#### Scenario: Label drawn on a diagram image
- **WHEN** the text "<<interface>> PuertoA" sits on top of an image
- **THEN** the converted slide has a callout whose box is pinned at that position with no connector, and the text is not flattened into a paragraph

#### Scenario: Lossy overlay becomes a diagram instead
- **WHEN** a diagram image has label text boxes drawn on it that would become callouts, but also a hexagon shape that callouts can't express, and LibreOffice is available
- **THEN** the image, labels and hexagon become one diagram SVG, and the slide has no callouts for those labels
