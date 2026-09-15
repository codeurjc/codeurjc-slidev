## ADDED Requirements

### Requirement: Slide frontmatter can reposition the content box
A `default`-layout slide's frontmatter SHALL accept `geometry.content: { x, y, w, h }` (numbers, slide-canvas pixels). When present and valid, that slide's content box SHALL render at the declared position and size, overriding the layout's own saved content-box position for that slide only.

#### Scenario: Content geometry applies to its own slide
- **WHEN** slide 3's frontmatter declares `geometry: { content: { x: 31, y: 98, w: 560, h: 424 } }` and slide 4 declares no `geometry`
- **THEN** slide 3's content box renders 560px wide at (31, 98), and slide 4's content box renders at the layout's own saved position and size

#### Scenario: Invalid content geometry is ignored
- **WHEN** a slide's `geometry.content` is missing a field, or has a non-numeric or negative width/height
- **THEN** the slide renders its content box at the layout's own saved position, and a console warning names the slide and the invalid field

### Requirement: Slide frontmatter can position a list of images
A `default`-layout slide's frontmatter SHALL accept `geometry.images`: an ordered list of `{ x, y, w, h }` entries in slide-canvas pixels. The Nth entry SHALL position the Nth `<img>` in the slide's content, in document order. Images without a matching entry SHALL stay in normal content flow; entries without a matching image SHALL be ignored.

#### Scenario: Two images, two entries
- **WHEN** a slide's content contains two images and its frontmatter declares two `geometry.images` entries
- **THEN** the first image renders absolutely positioned in the first entry's box, and the second image in the second entry's box

#### Scenario: More images than entries
- **WHEN** a slide's content contains three images and its frontmatter declares one `geometry.images` entry
- **THEN** the first image is positioned by that entry, and the second and third images render in normal content flow

#### Scenario: More entries than images
- **WHEN** a slide's frontmatter declares two `geometry.images` entries but its content contains one image
- **THEN** that image is positioned by the first entry, the second entry has no effect, and no error is raised

### Requirement: Positioned images keep their aspect ratio
An image positioned by `geometry.images` SHALL be scaled to fit inside its declared box without distortion, centered in that box.

#### Scenario: Box wider than the image's aspect ratio
- **WHEN** a 400×400 image is positioned in a `{ w: 600, h: 300 }` box
- **THEN** the image renders 300×300, centered horizontally within the 600×300 box

### Requirement: Frontmatter image geometry replaces single tracked-image extraction
On a slide whose frontmatter declares `geometry.images`, the layout's single tracked-image extraction (last `<img>` into the layout-level `image` element) SHALL NOT apply. Images on that slide are positioned only by `geometry.images`.

#### Scenario: Last image is not extracted into the layout image element
- **WHEN** a slide declares one `geometry.images` entry and its content contains two images
- **THEN** only the first image is absolutely positioned (by the frontmatter entry), the second image stays in normal flow, and the layout-level `image` element is not shown for that slide

### Requirement: Frontmatter geometry uses the layout editor's coordinate space
`geometry` coordinates SHALL be interpreted in the same slide-canvas pixel space that the layout editor uses for the `content` and `image` elements, so a value read from the editor's position readout reproduces the same on-screen placement.

#### Scenario: Editor readout round-trips
- **WHEN** an element is dragged in the Layout tab to a readout of `x: 438, y: 80, w: 400, h: 300`, and that same rect is written by hand into a slide's `geometry.images[0]`
- **THEN** the image renders at the same on-screen position and size as it did in the editor

### Requirement: Frontmatter geometry is editable from the Layout tab and persisted to frontmatter
In editor mode, each element positioned by the current slide's `geometry` (the content box and each positioned image) SHALL appear as a draggable and resizable overlay. Finishing a drag or resize SHALL write the updated rect back into that slide's `geometry` frontmatter. It SHALL NOT create or modify any layout file.

#### Scenario: Dragging a positioned image updates frontmatter
- **WHEN** a slide declares `geometry.images: [{ x: 100, y: 120, w: 300, h: 200 }]` and the user drags that image's overlay 50px right in the Layout tab
- **THEN** the slide's markdown frontmatter now reads `geometry.images[0].x: 150`, and no new or modified file appears under `layouts/`

#### Scenario: Resizing the content box on a slide with content geometry updates frontmatter
- **WHEN** a slide declares `geometry.content` and the user resizes the content overlay in the Layout tab
- **THEN** the new rect is written to that slide's `geometry.content`, and other slides sharing the same layout keep their content box unchanged

#### Scenario: Positioned images default to aspect-locked in the editor
- **WHEN** a frontmatter-positioned image's overlay is resized from a corner
- **THEN** the resize keeps the box's aspect ratio unless the user unlocks it, matching the existing default for the layout-level `image` element
