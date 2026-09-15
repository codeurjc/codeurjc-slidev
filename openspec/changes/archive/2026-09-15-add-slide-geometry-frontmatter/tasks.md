## 1. Groundwork

- [x] 1.1 Determine the containing block `.tracked-image` actually positions against in `layouts/default.vue` (slide root vs `.content`/`.content-inner`), and record the offset (if any) that frontmatter image rects must be translated by to match editor readouts
- [x] 1.2 Add `composables/useSlideGeometry.ts`: types (`Rect`, `SlideGeometry`), plus `parseSlideGeometry(frontmatter)` returning `{ content?, images[], warnings[] }`. It validates numeric, non-negative `x/y` and positive `w/h`, drops invalid entries with warnings naming the field, and exports `serializeSlideGeometry` for writers such as the editor and the ODP importer
- [x] 1.3 Unit tests in `composables/__tests__/useSlideGeometry.spec.ts`: valid content only, images only, both; missing or invalid fields; non-array `images`; extra unknown keys ignored

## 2. Rendering

- [x] 2.1 In `layouts/default.vue`, read the slide's frontmatter (`$frontmatter` / `useSlideContext`), and merge the per-slide `--ed-content-*` overrides from `geometry.content` into the root `:style` binding together with the existing editor style (editor state wins while dragging)
- [x] 2.2 Confirm the content autofit logic measures against the overridden box, and adjust if it reads the layout's static `data-styles` directly
- [x] 2.3 Add `updateGeometryImages()`: with `geometry.images`, mark the first N `.content-inner img` elements with `.geometry-image` and set inline `left/top/width/height` (translated per 1.1); without it, run the existing `updateTrackedImage()` unchanged
- [x] 2.4 Hook `updateGeometryImages()` into the same mount, MutationObserver and re-render paths that call `updateTrackedImage()`, and make the layout-level `image` element stay hidden when `geometry.images` is present
- [x] 2.5 CSS: `.geometry-image` shares the absolute positioning, `object-fit: contain` and z-index rules of `.tracked-image`; invalid-geometry warnings go to the console once per slide render

## 3. Editor integration

- [x] 3.1 In `composables/useEditor.ts`, support dynamic keys `geometry:content` and `geometry:image:<n>` (`ensurePosition`/`pruneDynamicKeys`, like `callout:<id>`), with image keys defaulting to aspect-locked
- [x] 3.2 Render overlays for frontmatter-positioned elements in the Layout tab. On slides with `geometry.content`, show its overlay instead of the layout-level content overlay, labeled as per-slide (e.g. "Content (this slide)", "Image 1 (this slide)")
- [x] 3.3 At drag/resize end on a `geometry:*` key, persist through Slidev's slide `update({ frontmatter })` (as `_override/SideEditor.vue` already does for `layout:`), replacing only the changed rect with `serializeSlideGeometry`, and never calling `/api/save-layout`
- [x] 3.4 Make sure "Save layout" / "Save as new layout" ignore `geometry:*` keys, so per-slide geometry never leaks into layout files

## 4. Tests and docs

- [x] 4.1 E2e: a slide with `geometry.content` renders its content box at the declared rect while a neighbouring slide keeps the layout default
- [x] 4.2 E2e: a slide with two images and two `geometry.images` entries positions both. A slide with three images and one entry positions only the first. Neither extracts a layout-level tracked image
- [x] 4.3 E2e: the editor readout round-trips (an element placed via frontmatter matches the editor's reported rect)
- [x] 4.4 E2e: dragging a frontmatter-positioned image updates the slide's frontmatter and creates or modifies no file under `layouts/`; restore fixtures in `afterAll`
- [x] 4.5 Update the existing image-position e2e expectations only where the modified requirement applies (slides with `geometry.images`)
- [x] 4.6 Document the `geometry` frontmatter in `CLAUDE.md` (schema, coordinate space, precedence over layout positions, editor persistence)

## 5. Verification

- [x] 5.1 `pnpm lint && pnpm typecheck`
- [x] 5.2 `pnpm test`
- [x] 5.3 `pnpm test:e2e`
