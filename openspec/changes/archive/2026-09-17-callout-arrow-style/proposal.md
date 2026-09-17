## Why

A callout's connector is an L-shaped elbow with a small head at the highlighted code. On a slide with several callouts beside the same code, the L-shapes and shelf-stacked boxes can cross each other, and the small head is easy to miss. A straight arrow from the highlight into its box reads more directly, and stacking boxes in the same order as their highlights keeps the lines from crossing.

## What Changes

- **New default connector, `arrow`.** A straight line from the anchor into the callout box: from the highlight's edge that faces the box (or the slide callout's exact point), ending where the line from the box's centre towards the anchor meets the box's border. It ends in a larger arrowhead that points into the box. The anchor end has no marker.
- **`elbow` keeps today's look.** `calloutStyle: elbow` in a slide's frontmatter restores the L-shaped connector with its head at the code, and today's placement, exactly. A deck-wide choice goes in the headmatter's `defaults:` (`defaults: { calloutStyle: elbow }`).
- **Ordered placement on `arrow` slides.** Callouts still pick a side (right → left → below → above). Then, on each side of each obstacle (a code block, or a slide callout's image or element), the auto-placed boxes are stacked in the order of their anchors: top to bottom beside it, left to right above or below it. A box goes level with its anchor, or just past the previous box when they'd overlap, and the stack moves back inside the slide if it runs past an edge.
  - Callouts never visible at the same click don't constrain each other.
  - Pinned boxes (`@x,y`, a slide callout's `box:`) stay put and are avoided.
- **Bare arrows and labels are unchanged** in both styles: a slide callout without text keeps its short arrow with the head on the anchor, and a box covering its own anchor keeps no connector.
- **BREAKING (visual):** existing decks get arrows and ordered placement by default. Box positions on `arrow` slides can change where the greedy placement had put boxes out of order; `calloutStyle: elbow` restores the old look.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `code-highlight-callouts`: connectors follow the slide's callout style (`arrow` by default, `elbow` opt-in); the elbow routing requirement applies to `elbow` slides; placement on `arrow` slides stacks boxes in their highlights' order.
- `slide-callouts`: the connector's arrowhead follows the slide's style (into the box for `arrow`, at the anchor for `elbow` and bare arrows); auto-placement on `arrow` slides stacks boxes in their anchors' order.

## Impact

- **Theme** (`packages/codeurjc-slidev-theme/`):
  - `composables/useHighlightLayout.ts`: a pure arrow path (anchor → clipped box border) and the per-side anchor-ordered stacking.
  - `layouts/default.vue`: reading `calloutStyle`, choosing path, arrowhead and placement per style; a second, larger arrowhead marker for `marker-end`.
- **Tests:**
  - unit tests for the arrow path and stacking;
  - e2e tests: an `arrow` connector ends at the box border with the head there; boxes follow their highlights' order; `calloutStyle: elbow` keeps the L; the headmatter `defaults:` applies.

  Existing e2e tests only read where a connector starts, and they may need an `elbow` fixture where they check the L.
- **Docs:** `AGENTS.md` (code-highlight callouts, slide callouts), the tutorial (both styles), and a release note for the visual change.
- **Not affected:** the ODP importer and the VS Code extension.
