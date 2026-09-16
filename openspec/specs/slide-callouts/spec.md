# slide-callouts

## Purpose

Lets a `default`-layout slide annotate anything on it -- a spot on an image, a piece of content, or a bare point -- through its own `callouts` frontmatter: anchors that survive the slide being re-laid out, a single rule that yields connected callouts, bare arrows and labels, click steps, auto-placement, and creating, dragging and deleting callouts from the layout editor.

## Requirements

### Requirement: Slide frontmatter declares callouts
A `default`-layout slide's frontmatter SHALL accept a `callouts` list. Each entry SHALL have an `at` anchor, and MAY have `text` (the callout's comment), `box` (`{x, y}` in slide-canvas pixels, pinning the box instead of auto-placing it) and `step` (a positive integer click step). An entry that is not an object, or whose anchor is invalid, SHALL be ignored with a console warning naming the slide and the entry, leaving the slide's other callouts unaffected.

#### Scenario: A callout is declared and rendered
- **WHEN** a slide declares `callouts: [{at: {x: 480, y: 210}, text: "Mira aquí"}]`
- **THEN** a callout box reading "Mira aquí" renders on that slide, connected to the point (480, 210)

#### Scenario: One invalid entry doesn't affect the others
- **WHEN** a slide declares two callouts and the first has no `at`
- **THEN** the first is skipped with a console warning, and the second renders normally

### Requirement: Anchors are declared as an image fraction, a slide point, or content text
The `at` anchor SHALL accept three forms:
- `{image: N, x, y}` — a position within the Nth image of the slide, with `x` and `y` as fractions between 0 and 1 of the image's **rendered** box (the area the image actually occupies after being scaled to fit, not its declared geometry box);
- `{x, y}` — a point in slide-canvas pixels, the same space as `geometry`;
- `{text: "…"}` — the first element in the slide's content whose text contains that string.

An anchor naming an image index that the slide doesn't have, or text that no element contains, SHALL be skipped with a console warning.

#### Scenario: Image anchor follows the image
- **WHEN** a callout anchors at `{image: 0, x: 0.45, y: 0.51}` and that image's `geometry` box is later resized
- **THEN** the anchor stays at the same point of the picture, moving with it

#### Scenario: Letterboxed image resolves against the rendered area
- **WHEN** an image with a 2:1 aspect ratio is placed in a square `geometry.images` box, so it renders letterboxed
- **THEN** an anchor at `{image: 0, x: 0.5, y: 0.5}` resolves to the centre of the visible picture, not the centre of the declared box

#### Scenario: Content anchor survives reflow
- **WHEN** a callout anchors at `{text: "Verificar"}` and the slide's content is re-scaled by autofit
- **THEN** the callout still points at the element containing "Verificar"

#### Scenario: Unresolvable anchor is skipped
- **WHEN** a callout anchors at `{text: "Cobertura"}` and no element on the slide contains that text
- **THEN** no callout is rendered for that entry, and a console warning names the slide and the missing text

### Requirement: A connector is drawn only when the box does not contain the anchor
A callout's connector SHALL be drawn from its box to its anchor only when the box's rectangle does not contain the anchor point. When the box contains its own anchor, the callout SHALL render as a plain label with no connector.

#### Scenario: Box beside its anchor is connected
- **WHEN** a callout's box sits to the right of its anchor
- **THEN** a connector is drawn between them

#### Scenario: Box over its anchor renders as a label
- **WHEN** a callout's `box` position places it over its own anchor point, as for a label written on top of an image
- **THEN** the callout renders with no connector

### Requirement: A callout with no text renders as a bare arrow
A callout whose `text` is absent or empty SHALL render its connector, with its arrowhead, and no box.

#### Scenario: Empty text gives an arrow only
- **WHEN** a slide declares `callouts: [{at: {image: 0, x: 0.5, y: 0.32}}]`
- **THEN** an arrow points at that spot on the image and no callout box is rendered

### Requirement: Connectors end in an arrowhead at their anchor
Every slide-callout connector SHALL end in an arrowhead at the anchor, pointing at the anchor rather than at the box.

#### Scenario: Arrowhead points at the target
- **WHEN** a callout box is placed above its anchor and connected to it
- **THEN** the connector's arrowhead is rendered at the anchor end, oriented towards the anchor

### Requirement: Callouts without a box position are auto-placed
A callout with no `box` SHALL be positioned by the theme's existing callout placement: beside its anchor, avoiding the element the anchor belongs to, the callouts already placed on that slide, and the slide's edges. A callout with a `box` SHALL render exactly there.

#### Scenario: Two callouts on one image don't overlap
- **WHEN** a slide declares two callouts anchored on the same image, neither with a `box`
- **THEN** both boxes render outside the image and do not overlap each other

### Requirement: Callouts can be revealed by click step
A callout with `step: N` SHALL stay hidden — box, connector and arrowhead — until the slide reaches click N, then stay visible, exactly as a code highlight's `{N}` suffix behaves. The steps SHALL count toward the slide's total clicks, and `slidev export --with-clicks` SHALL export one page per step.

#### Scenario: Stepped callout appears on its click
- **WHEN** a slide has one unstepped callout and one with `step: 1`, and the presenter advances one click
- **THEN** the first is visible from click 0 and the second appears at click 1

### Requirement: Callouts apply to default-layout slides only
Callouts declared on a slide using any layout other than `default` SHALL be ignored, with a console warning naming the slide and its layout.

#### Scenario: Cover slide ignores callouts
- **WHEN** a slide with `layout: cover` declares a `callouts` list
- **THEN** no callouts render on it and a console warning reports that callouts are only supported on the default layout

### Requirement: Callouts can be created by pointing at the slide in editor mode
In layout-editor mode, an author SHALL be able to create a callout by arming a callout tool and clicking a target on the slide. Clicking an image SHALL produce an image-fraction anchor, clicking a content element SHALL produce a content-text anchor, and clicking empty canvas SHALL produce a slide-point anchor. The new callout SHALL open with its text ready to be typed, and committing empty text SHALL leave a bare arrow.

#### Scenario: Clicking an image creates an image-anchored callout
- **WHEN** the callout tool is armed and the author clicks the middle of a slide image and types "Nombre de la app"
- **THEN** the slide's frontmatter gains a callout anchored at that fraction of that image with that text, and the callout renders connected to the clicked point

#### Scenario: Committing empty text leaves a bare arrow
- **WHEN** the author creates a callout and commits without typing any text
- **THEN** the frontmatter entry has no `text` and the slide renders an arrow with no box

### Requirement: Callout box and anchor are draggable, and callouts can be deleted
In editor mode a callout's box SHALL be draggable, and its anchor SHALL be draggable by a handle at the arrow's tip. A callout SHALL be deletable from the editor. Each of these SHALL be written back into that slide's `callouts` frontmatter once the gesture settles, and SHALL be undoable like other editor changes.

#### Scenario: Dragging the anchor moves the arrow's tip
- **WHEN** an author drags a callout's anchor handle to another part of the image
- **THEN** the arrow points at the new spot and the entry's `at` fractions are updated in the slide's frontmatter

#### Scenario: Deleting a callout removes its entry
- **WHEN** an author deletes a callout in editor mode
- **THEN** it disappears from the slide and its entry is removed from the frontmatter, leaving the other entries unchanged

#### Scenario: Editing never writes a layout file
- **WHEN** an author creates, drags or deletes callouts on a slide
- **THEN** only that slide's frontmatter changes, and no file under `layouts/` is created or modified

### Requirement: Text anchors reach into rendered diagrams
A `{text: "…"}` anchor SHALL also match text inside open shadow roots within the slide's content, which is where Slidev renders mermaid diagrams. Matches outside shadow roots SHALL be preferred, in document order, over matches inside them. When the matched text is a mermaid node's label, the anchor SHALL resolve to that node's shape, which is also the obstacle placement avoids. Callouts SHALL be re-placed when the content of such a shadow root changes (for example when a diagram finishes rendering), so a callout anchored into a diagram appears without a reload.

#### Scenario: Callout on a mermaid node
- **WHEN** a slide contains a `mermaid` flowchart with the node "Requisitos" and a callout anchors at `{text: Requisitos}`
- **THEN** once the diagram has rendered, the callout's connector points at the "Requisitos" node's box and the callout box doesn't overlap that node

#### Scenario: Plain content wins over diagram text
- **WHEN** a callout anchors at `{text: Cascada}`, a paragraph contains "Cascada" and a mermaid node is also labelled "Cascada"
- **THEN** the callout points at the paragraph

#### Scenario: Diagram renders after the slide mounts
- **WHEN** a slide with a callout anchored to a mermaid node is opened and the diagram renders after the first placement pass
- **THEN** the callout appears at the node without reloading the page, and no missing-text warning remains
