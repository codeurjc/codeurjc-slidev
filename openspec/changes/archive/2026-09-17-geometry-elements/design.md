## Context

- **Geometry today.** `composables/useSlideGeometry.ts` parses `geometry.content` and `geometry.images` (src-keyed via `useImageRefs.ts`, legacy positional).
  - **Rendering:** `layouts/default.vue`'s `updateGeometryImages` resolves entries against `.content-inner img` elements (their authored src is stamped in `data-src` by `markdownImageSrc.ts`). It positions each one absolutely (`.geometry-image`: `position: absolute`, inline `left/top/width/height`, `object-fit: contain`); `.content`/`.content-inner` are unpositioned, so boxes resolve against the layout root.
  - **Editing:** overlays use editor keys `geometry:<no>:image:<n>`, and writes go through `useDynamicSlideInfo(no).update({ frontmatter })` after the drag settles.
- **Rendered code blocks:** Slidev's `CodeBlockWrapper` renders `<div class="slidev-code-wrapper" data-title="…">`, and fence options (`{…}`) are bound with `v-bind`, so an unknown key like `id` or `data-*` lands on that root element. The theme's own `wrapCodeBlock` forwards options the same way. `<<<` imports are rewritten by the theme's `pre` transformer into fences titled with the file's basename (or untitled with `notitle`).
- **Rendered mermaid:** `<Mermaid v-bind="{…}">` renders a single `<div class="mermaid">` (a shadow-root host), so `{id: 'flow'}` lands on it.
- **Rendered tables:** markdown tables render as plain `<table>`, with no attribute syntax (MDC is off by default).
- **Importer:** `draft.ts` builds `DraftBlock`s (`body`, `code`, `diagram`, `markdown`) ordered by `y`, and appends images (with `geometry.images` entries) after them. The corpus has 7 slides where code sits beside other code (3), an image (3) or body text (1); today they're stacked into one column without a loss.

## Goals / Non-Goals

**Goals:**
- `geometry.elements` positions code blocks, mermaid diagrams and tables (and images) by stable keys only, never by position.
- Contain-scale fitting that keeps callout placement working on scaled code.
- Editor overlays and write-back for element entries, plus a hint for unkeyed elements.
- Importer: native grid columns for side-by-side code.

**Non-Goals:**
- Positioning other content (lists, paragraphs, arbitrary wrappers).
- Callout groups.
- Editor writes that add ids to markdown.
- Moving existing `geometry.images` writers (editor drags, paste presets, importer) to `elements`.
- VS Code support for `geometry.elements` keys.
- Importer use of `geometry.elements`.

## Decisions

### 1. Parsing: one `ElementEntry` per list item

`parseSlideGeometry` gains `elements: (ElementEntry | null)[]`, index-aligned like `images`, where:

```text
ElementEntry = { key: ElementKey, rect: GeometryRect, fit: 'contain' | 'none' }
ElementKey   = { kind: 'image', ref: ImageRef } | { kind: 'code', text: string } | { kind: 'id', name: string }
```

An entry with zero or several of `image`/`code`/`id`, a non-string `code`/`id`, an unknown `fit`, or an invalid rect is `null`, with a warning. `withElementRect(raw, index, rect)` replaces one entry's rect, keeping every other field as written. It is pure and unit-tested.

### 2. Stamping what isn't in the DOM yet

- **Imports:** the `pre` transformer appends `{'data-import-path': '<path as written>'}` to the fence info it generates for a `<<<` import. `wrapCodeBlock`, and Slidev's wrapper for plain fences, bind it onto `.slidev-code-wrapper`.
- **Fence titles:** already on the wrapper as `data-title`. Only wrappers without `data-import-path` match a `code:` title.
- **ids:** already on the element (fence options or the author's `<div id>`).

### 3. Resolution: a pure resolver over a small DOM summary

The layout collects the content's candidates once per update:
- **code:** `.slidev-code-wrapper`, with its `id`, `data-title`, `data-import-path`, and whether its parent is a `<div id>` wrapping only it;
- **mermaid:** `.mermaid`, with its `id`;
- **table:** `table`, with a wrapping `<div id>` whose only element child it is;
- **images:** as today.

A pure `resolveGeometryElements(entries, candidates)` in `useSlideGeometry.ts` returns, per entry, the matched candidate index or a warning:
- `code:` matches import paths first, then fence titles on non-imports.
- `id:` matches a code wrapper or mermaid host with that id, or a wrapper `<div id>` around exactly one table or import (the table or import is what gets positioned). Any other element with that id warns "not a code block, mermaid diagram or table".
- No match, or more than one, warns and suggests adding an id.
- An element claimed by two entries keeps the first; the second warns. An `image:` entry that also appears in `geometry.images` wins over the `images` entry.

The DOM-free input keeps the rules unit-testable.

### 4. Rendering: absolute box + uniform scale

For each matched non-image element:
- `position: absolute; left: x; top: y`, with `transform-origin: top left`.
- **Natural size:** measured once per update, with `width: max-content` and no transform (`offsetWidth`/`offsetHeight` ignore the slide's own transform).
- **`fit: contain`:** `s = min(w / naturalW, h / naturalH, 1)` for code and tables; mermaid (vector) is not capped at 1. Offsets centre the scaled element in the box: `left = x + (w - naturalW·s) / 2`. The element gets `transform: scale(s)`.
- **`fit: none`:** `s = 1` at `(x, y)`.
- **Class:** positioned elements get `geometry-element` (out of flow, `z-index` like images, `margin: 0`).
- **Clearing:** it undoes everything when the entry goes away.
- **Images:** `image:` entries reuse the image path (`effectiveImageRect` and `.geometry-image`).

Callout placement measures elements with `getBoundingClientRect`, which includes the transform, so highlights and code rects stay correct. The geometry watcher triggers `computeCallouts` as it does for images.

*Alternative considered:* autofitting code fonts inside the box. Rejected for now: the font would differ per block, and it interacts with Shiki's line spans. A uniform scale is simpler and keeps proportions.

### 5. Editor

- **Keys and overlays:** editor keys are `geometry:<no>:element:<n>`. Overlays show `Code <text>`, `Element <id>` or `Image <file>` over the entry's box. Code and tables are not aspect-locked; images and mermaid are.
- **Write-back:** a drag or resize writes `withElementRect` through `useDynamicSlideInfo(no).update({ frontmatter })` on the existing settle debounce.
- **Unkeyed hint:** the layout publishes the current slide's unkeyed code blocks, diagrams and tables (those no stable key or id could name) through the shared editor state. `SideEditor.vue` lists them under the elements, as "2 code blocks and 1 table need an id to be positioned".

### 6. Importer: side-by-side rows become grid columns

A pure `layoutDraft(draft)` in a new `grid.ts` computes the grids from the final draft, after build-up merging, so a merged run gets the grid its last slide has and `buildups.ts` needs no change. `renderDraftBody` renders from it, and `convert.ts` uses the same result for the frontmatter.

**Detection:** candidate items are code blocks, the body (only while it is one block; a body split by a diagram has no single frame), and images with their ODP frame (`DraftImage.odpRect`; cropped diagram images have none). Two items are side by side when their frames overlap horizontally by at most 0.3 cm and share at least 30% of the shorter one's height. Connected side-by-side items form a grid when they include a code block. Items overlapping horizontally share a column, stacked by `y`; columns are ordered by `x`, and a group that collapses to one column is no grid.

**Rendering:** at the place of the grid's first block, `<div class="grid grid-cols-[aFr_bFr] gap-6">` with one `<div class="min-w-0">` per column (so long code lines can't widen the track), and blank lines around each column's markdown so it is parsed. The ratio comes from the column widths rounded to 0.5 cm and reduced by their gcd; equal columns give `grid-cols-N`. Grid images are rendered in their column (`<img v-click>` when a build-up reveals them) and not again after the blocks.

**Frontmatter:** grid images get no `geometry.images` entry, and a slide whose body is a grid column gets no `geometry.content`. Image references (geometry entries and callout image anchors) are computed against the images in rendered order, since a grid can show an image before the others, which matters for `src#N`.

## Risks / Trade-offs

- **[Scaled code is smaller than surrounding text]** → Contain never enlarges code, and `fit: none` keeps natural size. The editor shows the box, so authors see how much space the block has.
- **[`{id: flow}` without quotes]** Vue evaluates `flow` as a variable, so the id attribute is missing. → The console warning for an unmatched `id:` entry mentions quoting fence ids.
- **[A slide's content changes after the geometry is written]** For example, the author duplicates an import. → The entry warns and the elements return to flow rather than positioning the wrong one.
- **[Grid rows in build-up runs]** A run whose slides differ in grid structure. → Only shapes that are added (images, bullets, annotations) are allowed between merged slides, and the grid is computed from the merged result, so it matches the run's last slide.
- **[UnoCSS arbitrary grid classes]** They need the class to appear in scanned content. → Slide markdown is scanned by Slidev's UnoCSS setup, as other utility classes in slides are. An e2e build of an imported deck checks it.

## Open Questions

None.
