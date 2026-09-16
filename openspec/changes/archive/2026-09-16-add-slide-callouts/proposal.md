## Why

Callouts today can only point at code: a highlight comes from a marker inside a fenced block, so anything else on a slide — a screenshot, a bullet, a diagram region, an empty spot — can't carry one. Authors work around it by drawing arrows in another tool, and the ODP importer simply drops them.

The corpus measures the gap. Across 226 slides that contain an image: 49 arrows point into an image (18 with a text box, 31 bare), and 41 text boxes sit on top of an image as labels. Another 14 labelled arrows point at body content. All of it is reported as `arrow or line omitted` or `positioned text box flattened into a paragraph` today.

The theme is closer to supporting this than it looks: placement, elbow routing, shelf-stacking, drag-to-position and click steps are already anchor-agnostic — `PlacementInput.codeRect` is just "the rectangle to avoid". What's missing is a way to declare an anchor that isn't a code span, and a home to persist it.

## What Changes

- A `default`-layout slide's frontmatter MAY declare a `callouts` list. Each entry has an anchor (`at`), optional `text`, an optional `box` position and an optional `step`.
- Three anchor kinds: a fraction of a slide image (`{image: N, x, y}`), a point in slide pixels (`{x, y}`), and a content anchor matched by text (`{text: "…"}`). Clicking on something in the editor picks the stable kind; free points stay available as the escape hatch.
- A connector is drawn only when the callout's box does not contain its anchor. That single rule yields all three shapes the corpus needs: a box connected by an arrow, a bare arrow (empty text, no box), and a label pinned on an image (box over its own anchor, no arrow).
- **Arrowheads are added to every callout connector, including the existing code callouts.** Previously connectors were plain elbows; they now point at what they mark.
- The layout editor gains a way to create a callout by pointing at the slide: arm the tool, click a target, type into the callout, with drag for both the box and the anchor, deletion, and undo. Positions and text persist to that slide's frontmatter, the same write path `geometry` uses.
- The ODP importer emits these callouts instead of losing them: arrows into images with or without a label, labels drawn over images, and labelled arrows pointing at slide content.
- Scope is `default`-layout slides only for now.

## Capabilities

### New Capabilities

- `slide-callouts`: callouts declared in a slide's frontmatter — anchor kinds, the connector rule, bare arrows and labels, click steps, auto-placement, and the editor's create/drag/delete authoring flow.

### Modified Capabilities

- `code-highlight-callouts`: the connector requirement gains an arrowhead at the anchor end, so code callouts and slide callouts read the same way.
- `odp-import`: arrows and labels over images become slide callouts rather than losses, and the loss list no longer names them.

## Impact

- `packages/codeurjc-slidev-theme/composables/useSlideCallouts.ts` (new): parsing, validation and serialization of the `callouts` frontmatter, mirroring `useSlideGeometry.ts`.
- `packages/codeurjc-slidev-theme/layouts/default.vue`: resolve anchors to rects, feed them through the existing callout pipeline, add the `<marker>` arrowhead to the connector SVG, render bare arrows and labels, host the creation tool and the anchor drag handles, and persist to frontmatter.
- `packages/codeurjc-slidev-theme/composables/useHighlightLayout.ts`: the obstacle becomes the anchor's own element (or none), rather than always a `<pre>`.
- `packages/codeurjc-slidev-theme/composables/useEditor.ts`: dynamic keys for callout anchors alongside the existing `callout:` box keys.
- `packages/create-codeurjc-slidev/src/odp/`: pair arrows and labels against image rects (`annotations.ts` already does this for code), map points with `geometry.ts`, and emit `callouts` frontmatter from `draft.ts`.
- Docs: `AGENTS.md`, `tutorial.md`, `packages/create-codeurjc-slidev/README.md`.
- Tests: theme unit tests for parsing/anchor resolution/the connector rule, e2e for creating and dragging a callout, importer unit and corpus tests for the four shapes.
