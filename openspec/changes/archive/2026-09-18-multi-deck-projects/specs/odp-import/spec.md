## MODIFIED Requirements

### Requirement: Images are extracted and positioned with slide geometry
Each image frame SHALL be written to the deck's images directory — `public/images/` for a lone default deck (per the `multi-deck-projects` capability's flat-vs-namespaced rule), otherwise `public/images/<slug>/` — and referenced from the slide as an image using that same path. When a frame holds both an SVG and a raster fallback, the SVG SHALL be used. Each referenced image SHALL get a `geometry.images` entry keyed by its `src` (with `#N` when the same picture appears more than once on the slide), except an image placed in a side-by-side grid (see "Side-by-side code becomes grid columns"). When the body box differs from the template's default body box beyond tolerance, the slide SHALL also get `geometry.content`, unless the body text is a column of such a grid. Positions SHALL be mapped from the ODP's default body region to the theme's default content box, scaling each axis independently, and clamped to the slide canvas. An image in a format browsers can't display SHALL be omitted and reported as a loss.

#### Scenario: List narrowed beside an image
- **WHEN** a slide's body box is narrowed to 14.5 cm and an image sits to its right
- **THEN** the slide's frontmatter has a `geometry.content` narrower than the default, and a `geometry.images` entry keyed by the image's `src` to the right of it, and the image file exists under the deck's images directory

#### Scenario: SVG preferred over raster fallback
- **WHEN** an image frame contains an SVG image and a PNG fallback with the same geometry
- **THEN** only the SVG is copied and referenced

#### Scenario: Same picture twice on a slide
- **WHEN** a slide shows the same embedded picture in two frames
- **THEN** its `geometry.images` entries reference `/images/<name>#1` and `/images/<name>#2` (or `/images/<slug>/<name>#1`/`#2` for a namespaced deck)

#### Scenario: A namespaced deck's images land under its own subfolder
- **WHEN** an ODP is imported as deck `tema1` into a project that already has another deck
- **THEN** its images are written under `public/images/tema1/`, and referenced from its slides as `/images/tema1/<name>`
