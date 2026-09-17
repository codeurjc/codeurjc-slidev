## Why

A slide refers to its images by position. `geometry.images[N]` positions the Nth `<img>` in the content, and a callout's `at: {image: N}` points into the Nth image. Inserting, removing or reordering an image silently re-targets every reference after it: the geometry lands on the wrong picture and a callout points into a different image. The ODP importer already works around this by appending diagram images last. A reference by the image's own `src` survives edits, and breaks visibly when the file itself goes away.

## What Changes

- **`geometry.images` entries** accept a `src` (`- { src: /images/a.png, x, y, w, h }`). An entry with a `src` positions the image with that authored `src` on the slide; entries without one keep positioning by document order.
- **Callout image anchors** accept a `src` in place of the index (`at: { image: /images/a.png, x, y }`). A number keeps meaning the Nth image.
- **Repeated pictures:** when the same `src` appears more than once on a slide, a reference selects one with `#N` (`/images/a.png#2`). A `src` repeated on the slide without `#N` resolves to the first occurrence, with a console warning.
- **Authored `src` at runtime:** the theme records each image's authored `src` in the rendered DOM, since Slidev turns markdown image URLs into bundled asset URLs.
- **Editor writes use `src`.** Every editor write that touches a slide's image references (dragging or resizing a positioned image, creating a callout on an image, dragging an image anchor, deleting a callout) writes `src` references. It also rewrites that slide's remaining positional entries to `src`, so existing decks migrate as they're edited. `#N` is added only when the `src` repeats.
- **ODP importer:** new imports write `src` references for `geometry.images` and image callouts, and drop the "diagram images last" ordering rule.
- **Geometry is read like callouts:** from the slide-info ref, so a frontmatter write is reflected without a reload.

## Capabilities

### New Capabilities

- `slide-image-references`: how a slide refers to one of its images: the `src` / `src#N` grammar, how it resolves against the rendered images (authored `src`), how writers generate references, and the warnings for unresolvable or ambiguous ones.

### Modified Capabilities

- `slide-geometry`: `geometry.images` entries can be keyed by `src`; editor writes migrate the slide's entries to `src`.
- `slide-callouts`: image anchors can reference an image by `src`; creating a callout on an image, dragging its anchor and any callout write use `src` references.
- `odp-import`: images and image callouts are referenced by `src`.
- `odp-diagram-conversion`: diagram images no longer need to come after the slide's other images.

## Impact

- **Theme** (`packages/codeurjc-slidev-theme/`):
  - New `composables/useImageRefs.ts`: parse, generate and resolve references.
  - `composables/useSlideGeometry.ts` and `composables/useSlideCallouts.ts`: grammar and serialization.
  - `setup/transformers.ts`: record the authored `src`.
  - `layouts/default.vue`: resolve references, write `src` references, read geometry from the slide-info ref.
  - `_override/SideEditor.vue`: image entry labels.
- **Importer** (`packages/create-codeurjc-slidev/src/odp/`): `draft.ts`, `imageCallouts.ts`, `convert.ts` (diagram image placement), `frontmatter.ts` if needed.
- **Tests:** unit tests for the helper and grammar, e2e for insertion stability and the migration on write, importer unit and corpus tests.
- **Docs:** `AGENTS.md` (Slide geometry, Slide callouts, ODP import), `tutorial.md`, the CLI README.
- **Out of scope (follow-ups):** moving image paste presets to per-slide `geometry`; VSCode diagnostics, `#N` quick fix and completion for image references. Existing imported decks aren't converted except through editor writes.
