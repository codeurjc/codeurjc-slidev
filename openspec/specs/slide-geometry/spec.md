# slide-geometry

## Purpose

Lets a `default`-layout slide position its own content box, an ordered list of content images, and keyed elements (code blocks, mermaid diagrams, tables, images) through `geometry` frontmatter, in the layout editor's slide-canvas pixel space, editable from the Layout tab and written back to that slide's frontmatter without touching any layout file.

## Requirements

### Requirement: Slide frontmatter can reposition the content box
A `default`-layout slide's frontmatter SHALL accept `geometry.content: { x, y, w, h }` (numbers, slide-canvas pixels). When present and valid, that slide's content box SHALL render at the declared position and size, overriding the layout's own saved content-box position for that slide only.

#### Scenario: Content geometry applies to its own slide
- **WHEN** slide 3's frontmatter declares `geometry: { content: { x: 31, y: 98, w: 560, h: 424 } }` and slide 4 declares no `geometry`
- **THEN** slide 3's content box renders 560px wide at (31, 98), and slide 4's content box renders at the layout's own saved position and size

#### Scenario: Invalid content geometry is ignored
- **WHEN** a slide's `geometry.content` is missing a field, or has a non-numeric or negative width/height
- **THEN** the slide renders its content box at the layout's own saved position, and a console warning names the slide and the invalid field

### Requirement: Slide frontmatter can position a list of images
A `default`-layout slide's frontmatter SHALL accept `geometry.images`: a list of `{ src?, x, y, w, h }` entries in slide-canvas pixels. An entry with a `src` SHALL position the image that `src` reference resolves to (see slide-image-references), wherever it sits in the content. An entry without a `src` SHALL position the image at its own position in the list, the Nth `<img>` in the slide's content in document order, as before. Images without a matching entry SHALL stay in normal content flow; entries without a matching image SHALL be ignored, with a console warning for an unresolvable `src`. An image SHALL also be positionable by an `image:` entry in `geometry.elements`; when both lists position the same image, the `geometry.elements` entry SHALL win, with a console warning.

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

#### Scenario: An image entry in elements
- **WHEN** a slide shows `/images/a.png` and declares `geometry.elements: [{ image: /images/a.png, x: 600, y: 120, w: 300, h: 200 }]`
- **THEN** `/images/a.png` is positioned in that box, exactly as a `geometry.images` entry would position it

### Requirement: Positioned images keep their aspect ratio
An image positioned by `geometry.images` SHALL be scaled to fit inside its declared box without distortion, centered in that box.

#### Scenario: Box wider than the image's aspect ratio
- **WHEN** a 400×400 image is positioned in a `{ w: 600, h: 300 }` box
- **THEN** the image renders 300×300, centered horizontally within the 600×300 box

### Requirement: Frontmatter geometry uses the layout editor's coordinate space
`geometry` coordinates SHALL be interpreted in the same slide-canvas pixel space that the layout editor uses for the `content` element, so a value read from the editor's position readout reproduces the same on-screen placement.

#### Scenario: Editor readout round-trips
- **WHEN** an element is dragged in the Layout tab to a readout of `x: 438, y: 80, w: 400, h: 300`, and that same rect is written by hand into a slide's `geometry.images[0]`
- **THEN** the image renders at the same on-screen position and size as it did in the editor

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
- **THEN** the resize keeps the box's aspect ratio unless the user unlocks it

#### Scenario: Editing a positional entry migrates the slide to src keys
- **WHEN** a slide shows `/images/a.png` and `/images/b.png` and declares two positional `geometry.images` entries, and the user resizes the second image
- **THEN** the frontmatter's entries become `{ src: /images/a.png, … }` and `{ src: /images/b.png, … }` with the second one resized, and both images stay where they were otherwise

### Requirement: Images without geometry stay in normal content flow
A `default`-layout slide's images SHALL only be taken out of normal content flow by `geometry.images` entries. On a slide with no `geometry.images`, every image SHALL render inline in the content, and no image SHALL be positioned by a layout-level element.

#### Scenario: Slide with images and no geometry
- **WHEN** a slide's content contains two images and its frontmatter declares no `geometry`
- **THEN** both images render in normal content flow, and neither is absolutely positioned

### Requirement: Slide frontmatter can position keyed elements
A `default`-layout slide's frontmatter SHALL accept `geometry.elements`: a list of entries, each with `x, y, w, h` in slide-canvas pixels, an optional `fit` (`contain`, the default, or `none`), and exactly one key naming the element it positions:
- `image: <reference>`: the image that src reference resolves to (see slide-image-references);
- `code: <text>`: the `<<<` import whose file path is written exactly as `<text>`, or else the fenced code block whose `[title]` is exactly `<text>`;
- `id: <name>`: the fenced code block or mermaid diagram whose fence options set `id` to `<name>` (`{id: 'name'}`), or the table or `<<<` import that is the only content of a `<div id="<name>">`.

A positioned element SHALL be taken out of normal content flow and placed in its box. Elements without a matching entry SHALL stay in normal flow. An entry that is invalid, has no key or more than one, or whose key matches no element, more than one element, or an element that isn't a code block, mermaid diagram, table or image, SHALL be ignored with a console warning naming the slide and the entry; the warning for a missing or ambiguous match SHALL suggest adding an id.

#### Scenario: Two imports side by side
- **WHEN** a slide imports `@/code/A.java` and `@/code/B.java`, and its frontmatter declares `geometry.elements` entries `{ code: "@/code/A.java", x: 31, y: 98, w: 440, h: 400 }` and `{ code: "@/code/B.java", x: 500, y: 98, w: 440, h: 400 }`
- **THEN** each code block renders inside its own box, side by side

#### Scenario: A fence positioned by its title
- **WHEN** a slide contains a fence ```` ```ts [app.ts] ```` and declares `{ code: app.ts, x: 600, y: 120, w: 340, h: 200 }`
- **THEN** that code block renders inside that box

#### Scenario: A mermaid diagram positioned by id
- **WHEN** a slide contains a fence ```` ```mermaid {id: 'flow'} ```` and declares `{ id: flow, x: 560, y: 110, w: 380, h: 300 }`
- **THEN** the diagram renders inside that box

#### Scenario: A table positioned through a wrapper
- **WHEN** a slide contains a table as the only content of `<div id="prices">` and declares `{ id: prices, x: 31, y: 300, w: 600, h: 200 }`
- **THEN** the table renders inside that box

#### Scenario: A repeated title is not positioned
- **WHEN** a slide contains two fences titled `app.ts` and declares `{ code: app.ts, … }`
- **THEN** neither code block is positioned, both stay in normal flow, and a console warning suggests adding an id

#### Scenario: An id on an element of another kind
- **WHEN** a slide declares `{ id: notes, … }` and `id="notes"` belongs to a `<div>` wrapping a list
- **THEN** the entry is ignored with a console warning, and the list stays in normal flow

### Requirement: Positioned elements fit their box
A code block or table positioned by `geometry.elements` with `fit: contain` (the default) SHALL be scaled uniformly to fit inside its box, never above its natural size, and centred in the box. A mermaid diagram SHALL be sized to fit its box, keeping its aspect ratio, centred. With `fit: none`, the element SHALL keep its natural size, placed at the box's top-left corner. An `image:` entry SHALL render exactly as a `geometry.images` entry does.

#### Scenario: A long code block scales down
- **WHEN** a code block whose natural size is 600×400 is positioned in a `{ w: 300, h: 400 }` box
- **THEN** it renders at half size, 300×200, centred vertically in the box

#### Scenario: A small code block keeps its size
- **WHEN** a code block whose natural size is 200×100 is positioned in a `{ w: 400, h: 300 }` box
- **THEN** it renders at 200×100, centred in the box

#### Scenario: Natural size with fit none
- **WHEN** a code block is positioned with `fit: none` in a box smaller than its natural size
- **THEN** it renders at its natural size, with its top-left corner at the box's top-left corner

### Requirement: Keyed elements are editable from the Layout tab
In editor mode, each element positioned by `geometry.elements` SHALL appear as a draggable and resizable overlay labelled with its kind and key. Finishing a drag or resize SHALL write the updated rect back into that entry of the slide's frontmatter, keeping its key and `fit`, and SHALL NOT modify any layout file or the slide's content. The Layout tab SHALL list the code blocks, mermaid diagrams and tables of the current slide that have no stable key, saying that an id is needed to position them.

#### Scenario: Dragging a positioned code block
- **WHEN** a slide declares `{ code: app.ts, x: 600, y: 120, w: 340, h: 200 }` and the user drags that overlay 40px left in the Layout tab
- **THEN** the entry now reads `{ code: app.ts, x: 560, y: 120, w: 340, h: 200 }`, and no layout file changes

#### Scenario: Hint for an unkeyed diagram
- **WHEN** the current slide contains a mermaid diagram without an id and the Layout tab is open
- **THEN** the element list says that diagram needs an id to be positioned, and no overlay is shown for it
