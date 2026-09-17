## Why

Per-slide `geometry` can only position the content box and images. Code blocks, mermaid diagrams and tables always flow inside the content box, so a slide can't put two code blocks side by side, or a diagram beside its explanation, without hand-written HTML. The ODP importer has the same problem in its own way: on the 7 corpus slides where code sits beside other code, text or an image, it stacks everything into one column without reporting it.

## What Changes

- **`geometry.elements`.** A list of positioned elements, each with `x, y, w, h` in slide-canvas pixels, an optional `fit`, and exactly one key:
  - `image: <src>`: an image, as `geometry.images` does (`#N` for a repeated picture);
  - `code: <file>`: a `<<<` import, by the file path as written (`@/code/...`);
  - `code: <title>`: a fenced code block, by its `[title]`;
  - `id: <name>`: a fenced code block or mermaid diagram with `{id: 'name'}` in its fence options, or a `<div id="name">` wrapping exactly one table or `<<<` import.
- **No positional keys.** An element that has no stable key (a mermaid diagram or table without an id, the same import or title twice on the slide) can't be positioned. A key that matches nothing, several elements, or an element of another kind is ignored with a console warning suggesting an id, and the element stays in normal flow.
- **Fit.** Code blocks and tables are scaled down uniformly to fit inside their box, and never scaled up. Mermaid diagrams scale their SVG. Everything is centred in its box, like images. `fit: none` keeps the element's natural size at the box's top-left corner.
- **`geometry.images` stays.** It keeps working as today, and theme writers (layout editor drags, paste presets) keep writing images there. `image:` entries in `elements` are read too.
- **Layout editor.** Keyed elements get draggable and resizable overlays ("Code GestorNotas.java", "Element flow"), written back into the slide's `geometry.elements`. The element list shows a hint for code blocks, diagrams and tables that can't be positioned until they get an id. The editor never edits markdown to add ids.
- **ODP importer.** It uses native layout rather than geometry: when a slide's code sits beside other code, body text or an image, those blocks are written as a UnoCSS grid (`<div class="grid grid-cols-[3fr_2fr] gap-6">`) in normal flow, with column widths following the ODP. An image placed in the grid is plain markdown with no `geometry.images` entry. The importer writes no `geometry.elements`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `slide-geometry`: adds keyed `geometry.elements` for code blocks, mermaid diagrams and tables (and images), their fit and warnings, and their editing in the Layout tab.
- `odp-import`: side-by-side code, text and images become grid columns in normal flow; images in those grids are not positioned with geometry.

## Impact

- **Theme** (`packages/codeurjc-slidev-theme/`):
  - `composables/useSlideGeometry.ts`: parsing `elements` entries and their keys, a pure key resolver, and the rect write-back for elements.
  - `setup/transformers.ts`: `<<<` imports carry their file path on the rendered code block, so an import key can find it.
  - `layouts/default.vue`: resolving entries against the rendered content, positioning and scaling, warnings, editor overlays and write-back, and the unkeyed hint.
  - `_override/SideEditor.vue`: element list entries and the hint.
- **Importer** (`packages/create-codeurjc-slidev/src/odp/`): side-by-side detection in a new `grid.ts`, grid rendering in `draft.ts`, frontmatter in `convert.ts`.
- **Tests:**
  - unit tests for entry parsing, key resolution and the importer grid;
  - e2e tests for positioning each kind, fit, warnings, editor drags writing `elements`, and the unkeyed hint;
  - corpus expectations for the side-by-side slides.
- **Docs:** `AGENTS.md` (Slide geometry, ODP import) and the tutorial.
