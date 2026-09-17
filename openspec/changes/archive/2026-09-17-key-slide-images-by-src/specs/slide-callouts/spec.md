## MODIFIED Requirements

### Requirement: Anchors are declared as an image fraction, a slide point, or content text
The `at` anchor SHALL accept three forms:
- `{image: <reference>, x, y}` — a position within one of the slide's images, with `x` and `y` as fractions between 0 and 1 of the image's **rendered** box (the area the image actually occupies after being scaled to fit, not its declared geometry box). The reference is a src reference (`/images/a.png`, or `/images/a.png#2` for a repeated picture) or, as before, a positional index (see slide-image-references);
- `{x, y}` — a point in slide-canvas pixels, the same space as `geometry`;
- `{text: "…"}` — the first element in the slide's content whose text contains that string.

An anchor whose image reference resolves to no image, or naming text that no element contains, SHALL be skipped with a console warning.

#### Scenario: Image anchor follows the image
- **WHEN** a callout anchors at `{image: /images/a.png, x: 0.45, y: 0.51}` and that image's `geometry` box is later resized
- **THEN** the anchor stays at the same point of the picture, moving with it

#### Scenario: Letterboxed image resolves against the rendered area
- **WHEN** an image with a 2:1 aspect ratio is placed in a square `geometry.images` box, so it renders letterboxed
- **THEN** an anchor at `{image: /images/a.png, x: 0.5, y: 0.5}` on that image resolves to the centre of the visible picture, not the centre of the declared box

#### Scenario: Content anchor survives reflow
- **WHEN** a callout anchors at `{text: "Verificar"}` and the slide's content is re-scaled by autofit
- **THEN** the callout still points at the element containing "Verificar"

#### Scenario: Unresolvable anchor is skipped
- **WHEN** a callout anchors at `{text: "Cobertura"}` and no element on the slide contains that text
- **THEN** no callout is rendered for that entry, and a console warning names the slide and the missing text

#### Scenario: Image anchor survives an inserted image
- **WHEN** a callout anchors at `{image: /images/b.png, x: 0.2, y: 0.3}` and the author inserts another image before `/images/b.png`
- **THEN** the callout still points at that spot of `/images/b.png`

#### Scenario: Positional image anchor still works
- **WHEN** a callout anchors at `{image: 0, x: 0.5, y: 0.5}`
- **THEN** it points at the centre of the slide's first content image

### Requirement: Callouts can be created by pointing at the slide in editor mode
In layout-editor mode, an author SHALL be able to create a callout by arming a callout tool and clicking a target on the slide. Clicking an image SHALL produce an image-fraction anchor referencing that image by src (with `#N` only when its `src` repeats on the slide), clicking a content element SHALL produce a content-text anchor, and clicking empty canvas SHALL produce a slide-point anchor. The new callout SHALL open with its text ready to be typed, and committing empty text SHALL leave a bare arrow.

#### Scenario: Clicking an image creates an image-anchored callout
- **WHEN** the callout tool is armed and the author clicks the middle of a slide image and types "Nombre de la app"
- **THEN** the slide's frontmatter gains a callout anchored at `{ image: <that image's src>, x, y }` with that text, and the callout renders connected to the clicked point

#### Scenario: Committing empty text leaves a bare arrow
- **WHEN** the author creates a callout and commits without typing any text
- **THEN** the frontmatter entry has no `text` and the slide renders an arrow with no box

### Requirement: Callout box and anchor are draggable, and callouts can be deleted
In editor mode a callout's box SHALL be draggable, and its anchor SHALL be draggable by a handle at the arrow's tip. A callout SHALL be deletable from the editor. Each of these SHALL be written back into that slide's `callouts` frontmatter once the gesture settles, and SHALL be undoable like other editor changes. The write SHALL turn every positional image anchor of that slide's callouts into a src reference to the same image, so a slide migrates to src references the first time its callouts are edited.

#### Scenario: Dragging the anchor moves the arrow's tip
- **WHEN** an author drags a callout's anchor handle to another part of the image
- **THEN** the arrow points at the new spot and the entry's `at` fractions are updated in the slide's frontmatter

#### Scenario: Deleting a callout removes its entry
- **WHEN** an author deletes a callout in editor mode
- **THEN** it disappears from the slide and its entry is removed from the frontmatter, leaving the other entries unchanged

#### Scenario: Editing never writes a layout file
- **WHEN** an author creates, drags or deletes callouts on a slide
- **THEN** only that slide's frontmatter changes, and no file under `layouts/` is created or modified

#### Scenario: Editing callouts migrates positional image anchors
- **WHEN** a slide's callouts anchor at `{image: 0, …}` and `{image: 1, …}` on `/images/a.png` and `/images/b.png`, and the author drags one callout's box
- **THEN** the frontmatter's anchors become `{image: /images/a.png, …}` and `{image: /images/b.png, …}` with the same fractions, and only the dragged box's position otherwise changes
