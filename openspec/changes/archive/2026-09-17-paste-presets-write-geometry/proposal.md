## Why

Choosing "Below" or "Right" after pasting an image forks the slide's layout: `/api/save-layout` writes a full copy of `default.vue` as `layouts/layout-<ts>.vue`, points the slide at it and reloads the page. The forked slide then stops receiving theme fixes (slide callouts, image references by `src`, mermaid anchors). The feature also rests on a special layout-level `image` element that only tracks the *last* `<img>` of a slide without `geometry`. So only one pasted image per slide can be positioned, and slides that already declare `geometry` (every imported deck) never even get the preset popover. Per-slide `geometry` with `src`-keyed images, added since, does all of this without a fork. "Below" is also broken as it stands: it places the image under a 400 px content box, at y ≈ 504 on a 551 px canvas.

## What Changes

- **Presets write geometry.** Choosing "Below" or "Right" writes the slide's `geometry.content` and a `src`-keyed `geometry.images` entry for the pasted image, through the slide-info ref. There is no layout fork and no page reload, and the slide's other `geometry.images` entries are kept.
- **The popover works on any `default`-layout slide,** finding the pasted image by its authored `src` (`data-src`). That includes slides that already declare `geometry`. Several pasted images on one slide can each be positioned.
- **"Below" fits the image on the slide.** The content box takes its measured text height, clamped to 30–60% of the space below its top. The image fills the rest, centred and fitted by aspect ratio, at most 80% of the canvas width.
- **BREAKING (theme):** the layout-level `image` element and the "last `<img>` is extracted" rule are removed.
  - Images stay in normal content flow unless `geometry.images` positions them.
  - The layout editor lists four fixed elements (`red-bar`, `logo`, `title`, `content`).
  - Layout saves no longer write `--ed-image-*` variables.
  - Existing forked layouts and consumer layout overrides are full copies of the layout, so they keep their current behaviour untouched.
- **Out of scope:** undo integration for presets (the editor is left as is), and migrating existing `layout-<ts>` forks back to `default`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `image-position`: presets write per-slide geometry. The popover finds the pasted image by `src` on any `default` slide, and the "Below" layout fits the slide. The layout-level extraction, its aspect-lock default, and the layout-fork save are removed.
- `layout-editor-resize`: the fixed element set drops `image`.
- `slide-geometry`: the requirement about skipping tracked-image extraction goes away, since there is no extraction left; images without an entry stay in normal flow.

## Impact

- **Theme** (`packages/codeurjc-slidev-theme/`):
  - `global-top.vue`: preset writes, pasted-image lookup by `data-src`, fork and reload removed.
  - `composables/useImagePosition.ts`: new "Below" rule, with measured content height as input.
  - `layouts/default.vue`: tracked-image extraction, `imageEverSaved`, `.tracked-image` CSS and `image` hidden/lock bookkeeping removed.
  - `composables/useEditor.ts`: `image` fixed element removed.
  - `_override/SideEditor.vue`: "Image" row removed.
  - `vite.config.ts`: `image` removed from the save-layout variable map.
- **Tests:** `useImagePosition`/`useEditor` unit tests. E2e: `image-position.spec.ts` rewritten around geometry writes, `slide-geometry.spec.ts` (tracked-image case), and layout-editor expectations that list five elements.
- **Docs:** `AGENTS.md` (architecture list, Slide geometry), `tutorial.md` (slides relying on the automatic image placement get `geometry.images` entries), and a theme README/changelog note about the behaviour change.
