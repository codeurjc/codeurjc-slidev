## Context

`layouts/default.vue`'s `computeCallouts` places every callout of a slide in one pass:
- **Code callouts** (grouped highlight spans per `<pre>`) and **slide callouts** (from `callouts` frontmatter) share one `placed: PlacedRect[]` list.
- **Placement:** `placeCallout` (in `useHighlightLayout.ts`) tries right → left → below → above, with shelf candidates past already-placed boxes on the same side, and skips boxes whose step range can't overlap.
- **Connectors:** each item gets `elbowPath(highlightRect, rect, side)` = `[anchor, bend, boxEdge]` as an SVG path. The small `#callout-arrowhead` marker goes on `marker-start` (the anchor end).
- **Other cases:** bare arrows (no text) get a two-point stub `[point, box corner]`. A box containing its anchor gets no path.
- **Remeasure:** `remeasureCallouts` recomputes paths after render against the boxes' real sizes, from `item.highlightRect` and `item.side`.

Geometry and callouts are read from the slide-info ref (`liveFrontmatter`), which is Slidev's raw slide frontmatter. Slidev merges the headmatter's `defaults:` only into the compiled per-slide frontmatter module (`getFrontmatter` in `@slidev/cli`), which is what `$frontmatter` reflects.

## Goals / Non-Goals

**Goals:**
- An `arrow` connector: straight, from the anchor to the box border, with a larger head into the box. It is the default.
- `calloutStyle: elbow` per slide, or deck-wide through `defaults:`, reproducing today's connectors and placement exactly.
- On `arrow` slides, boxes on one side of one obstacle stacked in their anchors' order, so the lines don't cross in the common case.
- Pure, unit-tested geometry for both the arrow path and the stacking.

**Non-Goals:**
- A per-callout style.
- A marker at the anchor end of `arrow` connectors.
- Reordering on `elbow` slides.
- Guaranteeing zero crossings (diagonals from anchors at very different x can still cross).
- Changes to the ODP importer or the VS Code extension.

## Decisions

### 1. The style comes from `$frontmatter`

`calloutStyle` is read as `$frontmatter.calloutStyle`, which includes the headmatter's `defaults:` merged under the slide's own keys.
- `'elbow'` → elbow.
- Absent or `'arrow'` → arrow.
- Anything else → arrow, with a one-time console warning naming the slide.

The editor never writes `calloutStyle`, so the frontmatter-only-patch staleness that made geometry and callouts read from the slide-info ref doesn't apply: a hand edit re-renders the slide. An e2e test covers `defaults:` so the assumption about Slidev's merge is pinned.

*Alternative considered:* reading `data.headmatter.defaults` through the slide-info ref. Rejected: it isn't exposed there, and `$frontmatter` already has the merged value.

### 2. `arrowPath(anchor, box)` in `useHighlightLayout.ts`

`arrowPath(anchor: Point, box: Rect): Point[]` returns `[anchor, borderPoint]`, where `borderPoint` is the point on the ray from the box's centre towards `anchor` where it leaves the box. It uses the smaller of the x and y scale factors to reach the border (`t = min(hw / |dx|, hh / |dy|)`).
- **Anchor on the centre:** returns `[]` (no connector).
- **Anchor for code callouts:** the same highlight edge `elbowPath` uses, facing `side`. It moves into a small `anchorPoint(highlightRect, side)` helper that both paths share.
- **Anchor for slide callouts:** the anchor point itself.

The path keeps starting at the anchor, so existing e2e helpers that read a connector's start keep working.

### 3. Two markers

- **Elbow:** the existing `#callout-arrowhead` (7 × stroke width) stays on `marker-start` for `elbow` connectors and for bare arrows in both styles.
- **Arrow:** a new `#callout-arrowhead-box` (10 × stroke width, `orient="auto"`, `refX` at the tip) goes on `marker-end` for `arrow` connectors.

The slide's style (a computed `calloutStyle`) and each item's `boxless` flag decide the marker attribute (`headOnBox`) and the path (`connectorPath`, shared by `computeCallouts` and `remeasureCallouts`).

### 4. Anchor-ordered stacking: `stackCallouts`

`stackCallouts(entries, slideRect)` in `useHighlightLayout.ts` is pure. Each entry has:
- `rect` (the result of `placeCallout`);
- `side`;
- `group` (a key identifying the obstacle: the code block's `<pre>` for code callouts, the anchor's element for slide callouts, a unique key for bare points);
- `anchor` (the anchor's coordinate along the side: y for right/left, x for above/below);
- `range` (step range);
- `fixed` (a position override or `box:`).

It returns the adjusted rects. For each group and side:

1. **Order.** Sort the non-fixed entries by `anchor`.
2. **Forward pass.** Each entry's main-axis coordinate starts at its level position: the anchor aligned with the box's top, clamped to the slide, as `candidateRect` computes it. It is then raised to just past (`GAP`) any earlier entry in the group whose range overlaps it. It is also pushed past any fixed or other-group box on the same column that it would overlap with an overlapping range.
3. **Backward pass.** If the last entry runs past the slide's far edge, walk back from the end, pulling each entry before the next one (again only against range-overlapping entries) and clamping to the slide. A stack that doesn't fit at all degrades to clamped overlap, like `placeCallout`'s fallback.

The cross-axis coordinate (x for right/left) is left as placed, so a column stays a column.

In `computeCallouts`, placement is split into gathering (greedy placement plus metadata for every item) and finishing (stacking on `arrow` slides, then `editor.ensurePosition`, paths and `items`). Code and slide callouts are stacked together, because they share `placed`. On `elbow` slides the stacking step is skipped, so the result is identical to today.

*Alternative considered:* re-running `placeCallout` in anchor order. Rejected: greedy side choice with shelf candidates can still invert neighbours, and it would change which side boxes land on.

### 5. What stays the same

- **No connector when needed:** `boxContainsAnchor` (label) and boxless callouts keep their current behaviour, with the bare-arrow stub and small head at the anchor.
- **Dragging:** a dragged box is `fixed`. Its connector follows it in the new style as the box moves.
- **Printing and export:** they render the same SVG, so no change is needed.

## Risks / Trade-offs

- **[Existing decks change look]** Every deck without `calloutStyle` switches to arrows, and some boxes move to follow their anchors' order. → A release note, plus `defaults: { calloutStyle: elbow }` restores the old look deck-wide in one line.
- **[Diagonals crossing code text]** A box stacked far from its highlight draws a long diagonal over other lines. → Stacking keeps boxes as close to level with their anchors as possible, and `elbow` exists for dense code.
- **[Stacking pushes a box into another group's space]** → The forward pass also avoids overlapping boxes from other groups (with range overlap). Genuine overcrowding degrades to clamped overlap, as today's fallback does.
- **[Existing e2e expectations of the L shape]** → Specs that assert elbow geometry get `calloutStyle: elbow` in their fixture; specs that only read a connector's start are unaffected.

## Open Questions

None.
