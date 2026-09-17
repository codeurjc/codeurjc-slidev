## MODIFIED Requirements

### Requirement: Slide frontmatter can position a list of images
A `default`-layout slide's frontmatter SHALL accept `geometry.images`: a list of `{ src?, x, y, w, h }` entries in slide-canvas pixels. An entry with a `src` SHALL position the image that `src` reference resolves to (see slide-image-references), wherever it sits in the content. An entry without a `src` SHALL position the image at its own position in the list, the Nth `<img>` in the slide's content in document order, as before. Images without a matching entry SHALL stay in normal content flow; entries without a matching image SHALL be ignored, with a console warning for an unresolvable `src`.

#### Scenario: Two images, two entries
- **WHEN** a slide's content contains two images and its frontmatter declares two `geometry.images` entries
- **THEN** the first image renders absolutely positioned in the first entry's box, and the second image in the second entry's box

#### Scenario: More images than entries
- **WHEN** a slide's content contains three images and its frontmatter declares one `geometry.images` entry
- **THEN** the first image is positioned by that entry, and the second and third images render in normal content flow

#### Scenario: More entries than images
- **WHEN** a slide's frontmatter declares two `geometry.images` entries but its content contains one image
- **THEN** that image is positioned by the first entry, the second entry has no effect, and no error is raised

#### Scenario: Entries keyed by src
- **WHEN** a slide's content shows `/images/a.png` then `/images/b.png`, and its frontmatter declares `geometry.images: [{ src: /images/b.png, x: 600, y: 120, w: 300, h: 200 }]`
- **THEN** `/images/b.png` is positioned in that box and `/images/a.png` stays in normal content flow

#### Scenario: Inserting an image doesn't move src-keyed geometry
- **WHEN** a src-keyed entry positions `/images/b.png` and the author inserts another image before it in the content
- **THEN** `/images/b.png` keeps its position and the inserted image stays in normal content flow

### Requirement: Frontmatter geometry is editable from the Layout tab and persisted to frontmatter
In editor mode, each element positioned by the current slide's `geometry` (the content box and each positioned image) SHALL appear as a draggable and resizable overlay. Finishing a drag or resize SHALL write the updated rect back into that slide's `geometry` frontmatter. The write SHALL key every image entry of that slide by a src reference, including entries that were positional, so a slide migrates to src keys the first time it is edited. Entries whose image has no `src` stay positional. It SHALL NOT create or modify any layout file.

#### Scenario: Dragging a positioned image updates frontmatter
- **WHEN** a slide shows `/images/a.png` and declares `geometry.images: [{ src: /images/a.png, x: 100, y: 120, w: 300, h: 200 }]`, and the user drags that image's overlay 50px right in the Layout tab
- **THEN** the slide's markdown frontmatter now reads `{ src: /images/a.png, x: 150, y: 120, w: 300, h: 200 }`, and no new or modified file appears under `layouts/`

#### Scenario: Resizing the content box on a slide with content geometry updates frontmatter
- **WHEN** a slide declares `geometry.content` and the user resizes the content overlay in the Layout tab
- **THEN** the new rect is written to that slide's `geometry.content`, and other slides sharing the same layout keep their content box unchanged

#### Scenario: Positioned images default to aspect-locked in the editor
- **WHEN** a frontmatter-positioned image's overlay is resized from a corner
- **THEN** the resize keeps the box's aspect ratio unless the user unlocks it, matching the existing default for the layout-level `image` element

#### Scenario: Editing a positional entry migrates the slide to src keys
- **WHEN** a slide shows `/images/a.png` and `/images/b.png` and declares two positional `geometry.images` entries, and the user resizes the second image
- **THEN** the frontmatter's entries become `{ src: /images/a.png, … }` and `{ src: /images/b.png, … }` with the second one resized, and both images stay where they were otherwise
