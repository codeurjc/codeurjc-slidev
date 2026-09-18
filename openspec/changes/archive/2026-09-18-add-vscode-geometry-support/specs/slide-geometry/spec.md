## MODIFIED Requirements

### Requirement: Frontmatter geometry is editable from the Layout tab and persisted to frontmatter
In editor mode, each element positioned by the current slide's `geometry` (the content box and each positioned image) SHALL appear as a draggable and resizable overlay. Finishing a drag or resize SHALL write the updated rect back into that slide's `geometry` frontmatter, unless an external controller is attached and has claimed geometry writes, in which case the theme SHALL emit the drag to that controller and SHALL NOT patch the frontmatter itself. The write SHALL key every image entry of that slide by a src reference, including entries that were positional, so a slide migrates to src keys the first time it is edited. Entries whose image has no `src` stay positional. It SHALL NOT create or modify any layout file.

#### Scenario: Dragging a positioned image updates frontmatter
- **WHEN** a slide shows `/images/a.png` and declares `geometry.images: [{ src: /images/a.png, x: 100, y: 120, w: 300, h: 200 }]`, and the user drags that image's overlay 50px right in the Layout tab
- **THEN** the slide's markdown frontmatter now reads `{ src: /images/a.png, x: 150, y: 120, w: 300, h: 200 }`, and no new or modified file appears under `layouts/`

#### Scenario: Resizing the content box on a slide with content geometry updates frontmatter
- **WHEN** a slide declares `geometry.content` and the user resizes the content overlay in the Layout tab
- **THEN** the new rect is written to that slide's `geometry.content`, and other slides sharing the same layout keep their content box unchanged

#### Scenario: Positioned images default to aspect-locked in the editor
- **WHEN** a frontmatter-positioned image's overlay is resized from a corner
- **THEN** the resize keeps the box's aspect ratio unless the user unlocks it

#### Scenario: Editing a positional entry migrates the slide to src keys
- **WHEN** a slide shows `/images/a.png` and `/images/b.png` and declares two positional `geometry.images` entries, and the user resizes the second image
- **THEN** the frontmatter's entries become `{ src: /images/a.png, … }` and `{ src: /images/b.png, … }` with the second one resized, and both images stay where they were otherwise

#### Scenario: A drag while a controller holds geometry writes
- **WHEN** an external controller is attached and has claimed geometry writes, and the user drags a positioned image's overlay in the Layout tab
- **THEN** the drag is emitted to that controller and the slide's `geometry` frontmatter is not patched by the theme
