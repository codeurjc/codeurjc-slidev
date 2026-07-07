## 1. Content box measurement groundwork

- [x] 1.1 Establish a firm bottom-edge constraint for `.content` (derived from its configured `y`/`h`) that the fit logic can measure against, without changing how the layout editor persists or drags/resizes box geometry
- [x] 1.2 Replace the hardcoded `font-size: 1.5rem` / implicit body text sizing in `layouts/default.vue` with a `--content-font-size` CSS custom property (default `24px`), consumed by `.content` and inherited by its children

## 2. Fit algorithm

- [x] 2.1 Implement a pure, unit-testable binary-search step function over `[12, 24]` (px) that, given a "does this size overflow?" measurement function, converges on the largest non-overflowing size (or 12 if none fits)
- [x] 2.2 Wire the step function to real measurement: apply a candidate `--content-font-size`, read `.content`'s `scrollHeight` vs. the box's bottom-edge constraint, iterate to convergence
- [x] 2.3 Cap iteration count defensively in case of non-monotonic measurement (nested flex/grid, images with intrinsic ratios), accepting the closest fit found within budget

## 3. Live recomputation across v-click

- [x] 3.1 Attach a `MutationObserver` to the content slot's subtree to detect `v-click` reveal/hide changes
- [x] 3.2 Batch observer callbacks within a single `requestAnimationFrame` so multiple mutations in one tick trigger only one fit pass
- [x] 3.3 Run the fit pass on mount, and on every batched mutation (covers both advancing and reversing `v-click` steps)

## 4. Floor behavior

- [x] 4.1 Ensure `.content` is not clipped (no `overflow: hidden`) so that content still overflowing at the 12px floor remains visible rather than being cut off

## 5. Tests

- [x] 5.1 Unit test (`composables/__tests__/`) the pure binary-search step function against mocked overflow/no-overflow responses, including the "nothing fits, falls back to 12px" case
- [x] 5.2 E2e test (`tests/`): content that fits at 24px renders at 24px
- [x] 5.3 E2e test: content that overflows at 24px shrinks to a smaller size that fits
- [x] 5.4 E2e test: content too large even at 12px stops shrinking and overflows visibly (not clipped)
- [x] 5.5 E2e test: advancing a `v-click` step that adds overflowing content shrinks the font size live
- [x] 5.6 E2e test: reversing a `v-click` step back to less content grows the font size back up (not exceeding 24px)
- [x] 5.7 E2e test: a long unwrapped line wraps rather than shrinking the font (horizontal overflow is not treated as vertical overflow)
- [x] 5.8 Confirm box geometry (`--ed-content-x/y/w/h`) is unchanged before/after any shrink or grow pass

## 6. Verification

- [x] 6.1 `pnpm test && pnpm test:e2e` passes
- [x] 6.2 Manual check in `pnpm dev`: author a slide with intentionally too much content, confirm shrink-then-visible-overflow behavior, then confirm `pnpm build`/`pnpm export` render the same way
