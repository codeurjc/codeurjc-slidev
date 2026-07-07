## Why

The `content` box's size is fixed by the layout editor (drag/resize), but text inside it is always rendered at a hardcoded size. Slide authors currently either overflow the box silently (text spills past the slide with no warning) or manually tune wording to fit — there's no mechanism that keeps text within its box automatically, across both static content and Slidev's `v-click` progressive reveals.

## What Changes

- Content text gets a default/ceiling font size of 24px (up from the current smaller default).
- When content's rendered height would overflow the bottom edge of the fixed `content` box, its font size shrinks (real font-size reduction, causing reflow/rewrap — not a visual `transform: scale()`) until it fits, down to a 12px floor.
- When there is slack (less content, or fewer `v-click` steps revealed), font size grows back up toward the 24px default/ceiling — it never grows past 24px.
- Recomputation is live across `v-click` step changes: as the presenter clicks through progressive reveals, the visible content's height is re-measured against the box and font size adjusts accordingly (grow when clicking back/less revealed, shrink when more is revealed).
- The content box itself is never resized by this feature — box geometry is entirely the layout editor's responsibility. This feature only ever adjusts font size.
- Horizontal overflow (e.g. long code lines) is explicitly out of scope for shrinking — it is handled by wrapping, not font-size reduction.
- At the 12px floor, if content still overflows vertically, that overflow is left visible (not clipped, not shrunk further) as a deliberate signal to the author that the box is too small for its content.

## Capabilities

### New Capabilities
- `content-text-autofit`: defines the default/ceiling font size (24px), the 12px floor, the shrink/grow-to-fit behavior against the fixed content box's bottom edge, live recomputation across `v-click` state changes, and the explicit exclusion of horizontal-overflow handling (left to wrapping).

### Modified Capabilities
- none — `content-layout-alignment` and `layout-editor-resize` govern box geometry, which this feature treats as an immutable input rather than modifying.

## Impact

- `layouts/default.vue`: `.content`'s CSS changes from a `min-height` (which currently allows silent overflow) to a real bounding constraint the fit logic measures against; the hardcoded `font-size: 1.5rem` on `h1:first-child` and implicit content text size are replaced by a computed, bounded font size.
- `composables/useEditor.ts`: box geometry/persistence logic is unaffected (font size is computed live at render time, not persisted like x/y/w/h).
- New logic needed to measure rendered content height against the box and to react to Slidev's `v-click` step changes (each step change is a DOM/visibility mutation, not a route change).
- Test impact: this behavior needs real layout/text measurement, which `vitest`+`jsdom` cannot provide reliably (jsdom doesn't perform text layout). Primary coverage shifts to Playwright e2e (`tests/`), unlike the largely arithmetic, unit-testable drag/resize/undo logic already in `composables/__tests__/`.
- Explicitly deferred: the layout-config roadmap item (per-slide/global layout config, e.g. image-beside-vs-below-text regions) will likely require reworking this feature to fit per-region rather than against a single whole-slide `content` box. That rework is accepted as a known future cost, not a blocker for shipping this now.
