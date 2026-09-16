## Why

Diagrams drawn with Impress shapes are the last big block of ODP content the importer throws away: boxes are reported as `shape with text omitted`, arrows as `arrows or lines omitted`, and the slide in `slides.md` shows only its title and bullets. The corpus is small but representative — a 3-step methodology pipeline repeated over Tema 1.1 slides 81–84, a UML class diagram (Tema 1.2 slide 123) and a hexagonal architecture drawing (2.2 slide 156) — and each case wants a different treatment: the pipeline is trivially a mermaid flowchart, the other two are not a clean graph at all but still render perfectly well as pictures.

Two gaps block even the easy case today. The parser ignores `draw:transform`, so every rotated shape (the pipeline's red "Pruebas" arrow, the hexagon's port trapezoids, and arrowed lines on six other slides) has no position and silently drops out. And the theme's `{text}` callout anchors cannot see inside a mermaid diagram, because Slidev renders mermaid into a shadow root.

## What Changes

- The importer converts diagrams in three tiers, trying each in order:
  1. **Mermaid**: a group of plain text boxes joined by arrows that all run in one direction becomes a fenced `mermaid` `flowchart` (`LR` or `TB`), placed in the slide content where the diagram sat. A labelled arrow pointing at one of its boxes becomes a slide callout anchored to that box's text.
  2. **SVG image**: any other group of connected, unclaimed shapes becomes an SVG image cropped from LibreOffice's export (only that group's shapes, framed by their combined bounding box), positioned with `geometry.images` where the diagram was.
  3. **Loss**: without LibreOffice (or on a hidden slide, which LibreOffice doesn't export), tier-2 candidates are reported as losses, exactly as today.
- Tiers 1 and 2 are reported as **info**, not losses: a new per-slide note list printed in its own console section, which does not put the slide in the comparison deck.
- The parser reads `draw:transform` (rotation and translation), so rotated shapes get their real bounding box and rotated lines/arrows their real endpoints; line arrowheads (`draw:marker-start`/`draw:marker-end`) give arrow direction. Existing callout pairing benefits too.
- LibreOffice's SVG export runs at most once per import and is shared by diagram embedding and the comparison deck; it now also runs when a slide has diagrams to embed but no losses.
- **Theme**: `{text}` callout anchors also match text inside open shadow roots in the slide content (mermaid diagrams), and callouts are re-placed when such a diagram finishes rendering.

## Capabilities

### New Capabilities

- `odp-diagram-conversion`: detection of diagram shape groups, the strict "clear graph" test for mermaid, flowchart emission and placement, callouts to diagram nodes, SVG cropping and positioning, and the tier fallback.

### Modified Capabilities

- `odp-import`: rotated shapes keep their geometry; losses no longer include converted diagrams; conversion notes are reported as info separately from losses.
- `odp-comparison-deck`: the SVG export is shared with diagram embedding and runs once; slides with only info notes don't appear in the comparison deck.
- `slide-callouts`: text anchors resolve inside rendered diagrams (open shadow roots), and placement re-runs when such content renders.

## Impact

- `packages/create-codeurjc-slidev/src/odp/`: `parse.ts`/`model.ts` (transform, rotation, markers), new `diagrams.ts` (grouping, mermaid test/emission, SVG candidates), new `svgCrop.ts` (per-shape crop of the export), `draft.ts` (diagram blocks, pipeline order: code annotations → mermaid → slide callouts → SVG candidates → losses), `buildups.ts` (diagrams must match across a run), `convert.ts` (shared export, resolving candidates, info notes), `index.ts` (console section), `constants.ts`.
- `packages/codeurjc-slidev-theme/layouts/default.vue`: shadow-root-aware text anchor lookup and a re-measure trigger for shadow content.
- Tests: synthetic ODP unit tests per tier and for transforms; corpus assertions on Tema 1.1 slides 81–84, Tema 1.2 slide 123 and 2.2 slide 156 (decks stay uncommitted, tests skip with a warning when absent); an e2e test for a callout anchored to a mermaid node; the real-LibreOffice integration test extended to a cropped diagram.
- Docs: `AGENTS.md` (ODP import pipeline, slide callouts), `packages/create-codeurjc-slidev/README.md`.
