## 1. Preset geometry

- [x] 1.1 `useImagePosition.ts`: new `computeBelowPreset(content, canvas, ratio, textHeight)` (content height = text height clamped to 30–60% of the height below the content's top, image fitted into the rest at most 80% of the canvas width, centred, 24 px gap, always inside the canvas); `computeRightPreset` unchanged apart from receiving the effective content rect
- [x] 1.2 `useSlideGeometry.ts`: pure `withPositionedImage(rawGeometry, content, ref, rect, srcs)` that sets `content`, replaces the entry resolving to the pasted image or appends a `src`-keyed one, and keeps (migrating) the other entries
- [x] 1.3 Unit tests: "Below" with the default 400 px content box and short text stays on the canvas; long text caps content at 60%; portrait and panoramic images fit; `withPositionedImage` appends, replaces the same image's entry, keeps other entries, and handles no prior geometry

## 2. Paste flow

- [x] 2.1 `global-top.vue`: find the pasted image by `authoredSrc(img) === path` in the current slide (bounded poll), anchor the popover to it, and keep it open until dismissed (re-anchoring after each choice)
- [x] 2.2 `choosePreset`: compute from the effective content rect (`geometry.content`, else `editor.positions.content`), the canvas size and the measured content height; write `withPositionedImage(...)` via `useDynamicSlideInfo(currentSlideNo).update({ frontmatter: { geometry } })`; delete `saveAsPerSlideLayoutFork` and the reload
- [x] 2.3 Only offer the popover on `default`-layout slides

## 3. Retire the layout-level image element

- [x] 3.1 `layouts/default.vue`: remove tracked-image extraction, `imageEverSaved`, the live "Below" default and `.tracked-image` CSS; keep `updateGeometryImages` as the only image positioning
- [x] 3.2 `composables/useEditor.ts`: remove the `image` fixed element and its hidden/aspect-lock defaults; ignore an `image` key in old snapshots
- [x] 3.3 `_override/SideEditor.vue` and `vite.config.ts`: remove the "Image" row and `image` from the save-layout variable map
- [x] 3.4 Unit tests: `useEditor` fixed elements are the four; no `image` defaults

## 4. E2e

- [x] 4.1 Rewrite `tests/image-position.spec.ts`: "Right" writes `geometry.content` + a `src` entry without creating a `layouts/` file or changing `layout:`; "Below" in the same popover replaces the entry and keeps the image inside the canvas; pasting on a slide that already has geometry adds a second entry; two pasted images each get an entry; pasting with the side editor open keeps `geometry` after its autosave
- [x] 4.2 Update `tests/slide-geometry.spec.ts` (no tracked-image case: images without geometry stay in flow) and any layout-editor expectations of an "Image" element

## 5. Docs and checks

- [x] 5.1 `tutorial.md`: give slides whose images relied on automatic placement explicit `geometry.images` entries
- [x] 5.2 `AGENTS.md` (architecture list, Slide geometry) and the theme README: presets write geometry, the layout-level image element is gone, images stay in flow unless positioned, old forks are unaffected
- [x] 5.3 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` pass
