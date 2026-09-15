## Context

`layouts/default.vue` positions its fixed elements (red bar, logo, title, content, image) through `--ed-*` CSS custom properties. The layout file itself hardcodes these as a static `style`/`data-styles` attribute. `/api/save-layout` rewrites them: in place, or into a new `layout-<timestamp>.vue` fork for "Save as new layout" and for the image-paste presets.

Positions are therefore a property of a *layout file*. The only per-slide mechanism is to fork a layout and point one slide's `layout:` at the fork.

Images are handled by `updateTrackedImage()`. It marks the last `<img>` in `.content-inner` with `.tracked-image`, and CSS positions that element from the `--ed-image-*` variables. Exactly one image per slide can be positioned.

The editor's state lives in `composables/useEditor.ts`: a singleton `positions` map with fixed keys, plus *dynamic* keys for callouts (`callout:<id>`, via `ensurePosition`/`pruneDynamicKeys`). `_override/SideEditor.vue` already persists per-slide frontmatter through Slidev's slide `update({ frontmatter })`; the save-as-new-layout path uses it to set `layout:`.

The motivating consumer is the ODP importer (`add-odp-import`). Across 694 slides in 11 real decks it would emit 60 single-image slides and 31 multi-image slides, plus narrowed content boxes beside images. Each of those needs positions per slide, not per layout.

## Goals / Non-Goals

**Goals:**
- Per-slide `geometry` frontmatter for the content box and an ordered list of images, rendered without any layout fork.
- Frontmatter geometry editable from the existing Layout tab and persisted back to frontmatter.
- No behavior change for slides without `geometry`, including the paste presets and layout forks.

**Non-Goals:**
- Per-slide geometry for the title, logo or red bar. They stay layout-level; the importer maps ODP titles onto the theme's own title position.
- Migrating the paste presets from layout forks to frontmatter geometry. Possible follow-up; out of scope here.
- Positioning non-image content (text boxes, tables) through `geometry`.
- Changing aspect-lock persistence semantics for layout-level elements.

## Decisions

- **Frontmatter key `geometry` with `content` and `images` sub-keys, in slide-canvas pixels.** This reuses the coordinate space the editor and the `--ed-*` variables already use, so a geometry value, an editor readout and a layout CSS variable all mean the same thing. Alternatives:
  - Percentages or canvas fractions: resolution-independent, but they break the one-to-one match with editor readouts and saved layout variables.
  - A generic `style:` escape hatch: too loose to validate or edit from the editor.

- **Pure parsing and validation in a new `composables/useSlideGeometry.ts`.** It returns `{ content?: Rect, images: Rect[], warnings: string[] }`, and invalid entries are dropped with a warning, never thrown. This keeps the grammar unit-testable in jsdom like the other composables, and lets the ODP importer serialize geometry with the same types.

- **Content box: per-slide inline overrides of the existing `--ed-content-*` variables on the layout root.** The layout's CSS already reads those variables for `.content` and for the autofit measurement, so overriding them on the root element for this slide moves the box and keeps autofit correct with no second code path. The root's `:style` binding already exists for editor mode; it becomes a merge of the editor style and the frontmatter geometry style.
  - Alternative: a separate absolutely positioned wrapper. It would duplicate the content box's CSS and bypass autofit.

- **Images: JS-assigned classes plus inline rects, generalizing `updateTrackedImage()`.**
  - With `geometry.images`, a new `updateGeometryImages()` walks `.content-inner img` in document order, adds a `.geometry-image` class to the first N, and sets `left/top/width/height` inline. `.geometry-image` shares `.tracked-image`'s `position: absolute; object-fit: contain` rules.
  - Without `geometry.images`, the existing `updateTrackedImage()` runs unchanged.
  - Both hang off the same MutationObserver and re-render hooks that already call `updateTrackedImage()`.
  - A pure-CSS `:nth-of-type` approach was rejected for the same reason `.tracked-image` is JS-assigned: images can sit at different nesting depths.

- **Editor: dynamic keys `geometry:content` and `geometry:image:<n>` in `useEditor`.** They mirror the callout dynamic-key pattern (`ensurePosition` on render, `pruneDynamicKeys` when the slide's geometry changes). Overlays reuse the existing drag/resize handlers; image keys default to aspect-locked, like the `image` element. A slide with `geometry.content` shows the frontmatter overlay *instead of* the layout-level `content` overlay, so there is only one content handle.

- **Persistence: Slidev's slide `update({ frontmatter })` from `SideEditor.vue`, triggered at drag/resize end.** This is the same mechanism the save-as-new-layout path uses to set `layout:`, and it writes into whichever markdown file the slide came from, including `src:`-imported files. Alternatives:
  - A new Vite middleware that splices YAML: duplicates Slidev's own frontmatter serializer.
  - Saving through `/api/save-layout`: wrong target, since it rewrites layout files.
  - The write updates only the changed rect and keeps the other `geometry` entries.

- **Precedence: frontmatter geometry wins for the elements it declares; everything else falls back to the layout.** A slide can override only `content`, only `images`, or both.

## Risks / Trade-offs

- [The containing block for absolutely positioned images may be `.content`/`.content-inner` rather than the slide root, which would offset frontmatter coordinates from editor readouts] → The first implementation task checks which element `.tracked-image` actually positions against. If it isn't the slide root, the geometry rect is translated by that element's offset, so the "editor readout round-trips" scenario holds. An e2e test pins it.
- [Two sources of truth for the content box: a layout file for most slides, frontmatter for some] → The Layout tab labels frontmatter-backed overlays as per-slide (e.g. "Content (this slide)"), and only the frontmatter overlay shows on such slides, so a drag can't accidentally edit the shared layout.
- [Frontmatter writes trigger Slidev HMR, which can reset in-progress editor state] → Writes happen only at drag/resize end, never during a move, matching when the callout `@x,y` writes happen today.
- [Hand-written invalid geometry] → Invalid entries are dropped with a console warning naming the slide and field; the slide still renders with layout defaults.
