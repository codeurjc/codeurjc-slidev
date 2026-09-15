## Why

A `default`-layout slide can position at most one image (the last `<img>` in its content). The only way to persist that position, or a narrowed content box beside it, is to fork the whole `default.vue` layout into a per-slide copy. That works for an occasional pasted image, but not for a slide with several positioned images. It is also a poor fit for generated decks: the upcoming ODP importer would need about one forked ~900-line layout per image slide, and each fork freezes a snapshot of the theme's layout that later theme updates never reach. Per-slide geometry belongs in the slide itself.

## What Changes

- A new `geometry` key in a `default`-layout slide's frontmatter:
  - `geometry.content: { x, y, w, h }` repositions or resizes that slide's content box.
  - `geometry.images: [{ x, y, w, h }, ...]` positions the slide's content images, matched to `<img>` elements in document order.
  - Values are in slide-canvas pixels, the same coordinate space the layout editor already uses for its `--ed-*` variables.
- Frontmatter geometry applies to that slide only and overrides the layout's own saved position for the same element; slides without `geometry` are unaffected.
- On a slide that declares `geometry.images`, the layout's single "last image becomes the tracked image" extraction does not apply. Every image with a matching entry is positioned, and images beyond the list stay in normal content flow.
- Positioned images keep their aspect ratio (`object-fit: contain` inside the declared box).
- In editor mode (Layout tab), frontmatter-positioned elements get their own draggable/resizable overlays. Dragging or resizing one writes the new geometry back into that slide's frontmatter, never into a layout fork.
- The existing paste flow (the "Below"/"Right" presets and their per-slide layout fork) is unchanged.

## Capabilities

### New Capabilities
- `slide-geometry`: the `geometry` frontmatter schema (content box and ordered image list), how it applies to a slide's rendering, precedence over layout-level positions, and editing and persisting it from the Layout tab.

### Modified Capabilities
- `image-position`: single-image extraction into the layout-level `image` element now applies only to slides that don't declare `geometry.images`.

## Impact

- `packages/codeurjc-slidev-theme/composables/`: new pure composable (e.g. `useSlideGeometry.ts`) that parses, validates and normalizes the `geometry` frontmatter, with unit tests.
- `packages/codeurjc-slidev-theme/layouts/default.vue`:
  - applies content-box geometry as per-slide overrides of `--ed-content-*`;
  - positions multiple images;
  - skips `updateTrackedImage()` when `geometry.images` is present;
  - keeps the content autofit measuring against the overridden box.
- `packages/codeurjc-slidev-theme/composables/useEditor.ts`: dynamic per-slide keys for frontmatter-positioned elements, following the existing callout dynamic-key pattern.
- `packages/codeurjc-slidev-theme/_override/SideEditor.vue`: persists dragged or resized frontmatter geometry through Slidev's slide `update({ frontmatter })` API, which the save-as-new-layout path already uses.
- `tests/`: new e2e coverage (rendering, multiple images, editor drag persistence).
- `CLAUDE.md`: new section documenting the `geometry` frontmatter.
- Prerequisite for `add-odp-import`.
