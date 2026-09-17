## ADDED Requirements

### Requirement: Side-by-side code becomes grid columns
When a slide's code block sits beside another code block, the body text or an image — the two don't overlap horizontally and share at least 30% of the shorter one's height — the importer SHALL write those blocks as the columns of a grid in normal content flow (`<div class="grid grid-cols-[…] gap-6">`, one `<div>` per column), ordered left to right, with column widths proportional to the ODP frames' widths. The importer SHALL NOT use `geometry.elements` for them. An image placed in such a grid SHALL be written as a markdown image without a `geometry.images` entry.

#### Scenario: Two code blocks side by side
- **WHEN** a slide shows two code boxes next to each other, 12 cm and 8 cm wide
- **THEN** the slide contains a grid with two columns in a 3:2 ratio, the left code block in the first and the right one in the second

#### Scenario: Code beside a screenshot
- **WHEN** a slide shows a code box on the left and a screenshot on the right at the same height
- **THEN** the slide contains a grid whose columns hold the code block and the image, and its frontmatter has no `geometry.images` entry for that image

#### Scenario: Body text beside code
- **WHEN** a slide shows its bullet list on the left and a code box on the right
- **THEN** the slide contains a grid with the list in the first column and the code block in the second, and its frontmatter has no `geometry.content`

#### Scenario: Build-up adding an image beside code
- **WHEN** a build-up's first slide shows a code box and the next one adds a screenshot to its right
- **THEN** the merged slide contains a grid whose second column holds the image revealed on click 1

#### Scenario: Code above text stays in one column
- **WHEN** a slide shows a code box above its body text
- **THEN** the slide contains the code block and the text one after the other, without a grid

## MODIFIED Requirements

### Requirement: Images are extracted and positioned with slide geometry
Each image frame SHALL be written to the project's `public/images/` directory and referenced from the slide as an image. When a frame holds both an SVG and a raster fallback, the SVG SHALL be used. Each referenced image SHALL get a `geometry.images` entry keyed by its `src` (with `#N` when the same picture appears more than once on the slide), except an image placed in a side-by-side grid (see "Side-by-side code becomes grid columns"). When the body box differs from the template's default body box beyond tolerance, the slide SHALL also get `geometry.content`, unless the body text is a column of such a grid. Positions SHALL be mapped from the ODP's default body region to the theme's default content box, scaling each axis independently, and clamped to the slide canvas. An image in a format browsers can't display SHALL be omitted and reported as a loss.

#### Scenario: List narrowed beside an image
- **WHEN** a slide's body box is narrowed to 14.5 cm and an image sits to its right
- **THEN** the slide's frontmatter has a `geometry.content` narrower than the default, and a `geometry.images` entry keyed by the image's `src` to the right of it, and the image file exists under `public/images/`

#### Scenario: SVG preferred over raster fallback
- **WHEN** an image frame contains an SVG image and a PNG fallback with the same geometry
- **THEN** only the SVG is copied and referenced

#### Scenario: Same picture twice on a slide
- **WHEN** a slide shows the same embedded picture in two frames
- **THEN** its `geometry.images` entries reference `/images/<name>#1` and `/images/<name>#2`
