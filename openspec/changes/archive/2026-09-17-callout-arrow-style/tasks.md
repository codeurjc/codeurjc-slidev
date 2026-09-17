## 1. Geometry

- [x] 1.1 `useHighlightLayout.ts`: `anchorPoint(highlightRect, side)` shared by `elbowPath`, and `arrowPath(anchor, box)` returning `[anchor, borderPoint]` (ray from the box centre clipped at the border, `[]` when the anchor is the centre)
- [x] 1.2 `useHighlightLayout.ts`: `stackCallouts(entries, slideRect)` — per group and side, sort unfixed entries by anchor, forward pass (level position, past earlier range-overlapping entries and overlapping fixed/other boxes), backward pass when past the slide edge
- [x] 1.3 Unit tests: `arrowPath` for a box on each side and diagonals (end point on the border, on the centre→anchor line); `stackCallouts` ordering, overlap push, slide-edge backward pass, disjoint ranges not constraining, fixed boxes kept and avoided, above/below ordered by x

## 2. Layout

- [x] 2.1 `layouts/default.vue`: read `calloutStyle` from `$frontmatter` (`elbow`, else `arrow`, warning once on an unknown value); `CalloutItem.style`
- [x] 2.2 `computeCallouts`: gather greedy placements for code and slide callouts with group/anchor/range/fixed metadata, stack on `arrow` slides, then write positions, paths and items; `elbow` slides unchanged
- [x] 2.3 Paths and markers: `arrowPath` for `arrow` connectors (code and slide callouts), `elbowPath` for `elbow`, the bare stub for boxless; new `#callout-arrowhead-box` marker on `marker-end` for `arrow`; `remeasureCallouts` uses the item's style

## 3. E2e

- [x] 3.1 New isolated spec `tests/callout-arrow-style.spec.ts`: default slide draws a two-point connector ending on the box border with `marker-end`; boxes of three highlights on one side follow line order where greedy placement would invert them; a slide with `calloutStyle: elbow` draws the three-point elbow with `marker-start`; slide callouts on one image follow their anchors' order; a bare arrow keeps its head at the anchor; headmatter `defaults: { calloutStyle: elbow }` applies and a slide's own `calloutStyle: arrow` overrides it
- [x] 3.2 Review existing e2e specs that assert connector geometry (`slide-callouts`, `slide-callouts-diagrams`, `slide-image-references`, `code-highlight-callouts`, `callout-click-steps`, `callout-step-ranges`): keep start-point checks, give elbow-specific checks `calloutStyle: elbow`, and update anything that relied on greedy box order

## 4. Docs and checks

- [x] 4.1 `AGENTS.md` (code-highlight callouts placement and connectors, slide callouts "What gets drawn") and `tutorial.md` (a slide per style, `calloutStyle` and `defaults:`); README release note line about the new default
- [x] 4.2 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` pass
