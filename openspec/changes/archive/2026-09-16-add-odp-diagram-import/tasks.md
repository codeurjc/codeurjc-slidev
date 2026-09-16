## 1. Shape geometry: transforms and arrowheads

- [x] 1.1 Parse `draw:transform` (`rotate`, `translate`, and `scale`/`skewX` when present) in `parse.ts`, storing the transformed corners' axis-aligned bounding box as `rect` and the angle as `OdpShape.rotation`
- [x] 1.2 Derive `endpoints` for line-like custom shapes (`mso-spt32`, line geometries, zero-width or zero-height boxes) from the transformed `(0,0)`/`(w,h)`, honouring `draw:mirror-horizontal`/`draw:mirror-vertical`
- [x] 1.3 Resolve `draw:marker-start`/`draw:marker-end` through the graphic style chain in `styles.ts` into `OdpShape.markers`, and add a helper giving an arrow's tail and tip (markers for lines; geometry type plus rotation for `right/left/up/down-arrow`; undirected otherwise)
- [x] 1.4 Unit tests with synthetic ODPs: the rotated right-arrow from Tema 1.1 #84 (x 4.4–5.225, y 9.557–10.8, points up), a rotated trapezoid's bounding box, a vertical `mso-spt32` line's endpoints, and marker-end direction
- [x] 1.5 Run the corpus tests and record how the rotated arrows on Tema 1.2 #62/#65, Selenium #31 and Docker #10/#14/#15 now convert, updating corpus assertions for the new callouts or losses

## 2. Diagram grouping and the clear-graph test

- [x] 2.1 Create `diagrams.ts`: members from `ClassifiedSlide` after code annotations (images, unclaimed connectors and texts, empty-shape decorations), union-find linking (connectors by `CONNECTOR_DISTANCE_CM` along their whole length, other members only when touching within `DIAGRAM_TOUCH_CM`), groups near code or tables discarded, and extras (role-less slide shapes fully inside a group's box); add `titleShape` to `ClassifiedSlide` so roles can be excluded
- [x] 2.2 Clear-graph test for image-less groups: plain rectangles with text, no overlapping boxes, nothing drawn inside a box, every edge between two distinct boxes (block arrows via their tail/tip), connected, all edges within `DIAGRAM_AXIS_TOLERANCE_DEG` of one axis, no other members; add the thresholds to `constants.ts`
- [x] 2.3 Mermaid emission: `flowchart LR|TB`, nodes in reading order as `nN["label"]` with `"` → `#quot;` and paragraph breaks → `<br>`, directed/undirected edges, no styling
- [x] 2.4 Node callouts: a labelled arrow with one end on a node becomes a `{text: <node label>}` callout with the label's text and mapped box; skip mermaid for the group when the label text also occurs in the slide's other content
- [x] 2.5 SVG candidacy: given pass 1's per-shape losses and callout-consumed texts, a non-mermaid group with an image or at least two box-like members is a candidate when a member would be lost or a rotated text was used as a callout
- [x] 2.6 Unit tests: pipeline → `flowchart LR` with the expected nodes and edges; vertical chain → `TB`; compartment line, mixed directions, overlapping boxes and a dangling arrow each rejected; the "Pruebas" callout; the ambiguous-label case; a caption beside a screenshot doesn't join; a group near code is discarded; candidacy for a lossy image overlay versus fully converted callouts

## 3. Drafting: two passes, placement and candidates

- [x] 3.1 Record `bodyGaps` (index and estimated y of each removed empty-paragraph run) in `classify.ts`
- [x] 3.2 Refactor the tail of `draftSlide` into a pure `convertOverlay(excluded)` returning images to emit (unregistered), callouts, flattened-text blocks, consumed texts and a per-shape loss map; register image files only for the final pass; keep output identical (corpus dump unchanged)
- [x] 3.3 Wire the pipeline: groups → mermaid (claim shapes, emit the diagram block and node callouts) → pass 1 → candidates when `ctx.canEmbedDiagrams` and the slide is visible → pass 2 excluding candidate members (and extras) → record `diagramCandidates`
- [x] 3.4 Insert the mermaid block: split the body at the gap nearest the diagram's top when the diagram overlaps the body, otherwise order by the diagram's top; render the `mermaid` fence in `renderDraftBody`
- [x] 3.5 Add `info: string[]` to `SlideDraft`, with the mermaid note added at draft time
- [x] 3.6 Build-ups: keep diagram blocks, node callouts and candidates from the run's first draft when merging, and check that an added or changed diagram shape blocks the merge
- [x] 3.7 Unit tests: the body split for the 81–84 body layout, placement below the body, pass 2 excluding a lossy image overlay (no callouts, no image, no losses for its members) while a fully converted screenshot keeps its callouts, `canEmbedDiagrams: false` giving pass 1, a hidden slide giving pass 1, and both build-up cases

## 4. SVG cropping and conversion flow

- [x] 4.1 Create `svgCrop.ts`: `parseSvgExport` once, `cropDiagram(doc, pageName, members, extras)` finding the page by `ooo:name`, collecting `com.sun.star.*` shape groups with their `BoundingBox`, matching rects (cm → 1/100 mm) within `SVG_MATCH_TOLERANCE`, and building a standalone SVG with shared defs, matched groups only, a member-union `viewBox` plus margin and no width/height; `undefined` when a member is unmatched, unmatched extras skipped
- [x] 4.2 Reorder `convertOdp`: detect LibreOffice up front (unless `office: false`) and pass `canEmbedDiagrams`; after drafts and build-ups, export once when any draft has candidates or any slide has losses; resolve candidates; then render slides, reports and the comparison deck from the same export
- [x] 4.3 On a successful crop, append the diagram image after the slide's other images (`public/images/diagram-<page>[-n].svg`, `geometry.images` at the mapped member union) and add the SVG info note; otherwise add the `diagram omitted (not found in LibreOffice's SVG export)` loss; add the one-time "diagrams kept as losses" notice when LibreOffice is unavailable and some group would have been a candidate
- [x] 4.4 Add `info` to `SlideReport`, print the "Converted with notes" section in `formatReport`, and keep `slidesWithLosses` and the comparison filter on losses only
- [x] 4.5 Unit tests: `cropDiagram` on a trimmed export sample (keeps only matched groups, excludes an overlapping bullet, unions the view box, fails closed on an unmatched member, skips unmatched extras); `convertOdp` with an injected office runner covering export-once, export without losses, crop-failure loss and no-LibreOffice notice; `formatReport` info section
- [x] 4.6 Extend the real-LibreOffice integration test with a synthetic non-clear diagram, asserting a cropped SVG image is written (skips with a warning without `soffice`)

## 5. Theme: text anchors inside diagrams

- [x] 5.1 Extend `findAnchorElement` in `layouts/default.vue` to search open shadow roots under the content after the light DOM, resolving a match inside a mermaid `g.node` to that node's rect for both point and obstacle
- [x] 5.2 Observe open shadow roots under the content for mutations (re-scanned when the content observer fires, disconnected on unmount) and re-run `computeCallouts`; defer the missing-text warning while a mermaid host hasn't rendered yet
- [x] 5.3 E2e (isolated project): a slide with a `mermaid` flowchart and a callout at `{text: Requisitos}` renders the connector ending on the node's box once the diagram renders, with no lingering missing-text warning; plain content wins over a same-text node

## 6. Corpus and smoke verification

- [x] 6.1 Add a temporary dry-run listing every diagram candidate per corpus deck and its tier, review it for false positives, and adjust thresholds if needed (the dry-run isn't committed)
- [x] 6.2 Corpus assertions: Tema 1.1 #81–84 each have a `flowchart LR` with the three steps and a "Pruebas" callout at the right node; Tema 1.2 #123 and 2.2 #153/#156/#157 have diagram SVG images when LibreOffice is available (today's output otherwise); Tema 1.1 #56 and the Azure/2.5 screenshot callouts are unchanged
- [x] 6.3 Smoke-build Tema 1.1 and Tema 1.2 with `slidev build` using the local theme, and check slides 81–84 (mermaid plus callout) and 123 (SVG image) visually

## 7. Documentation

- [x] 7.1 `AGENTS.md`: ODP import pipeline (transforms, `diagrams.ts`, `svgCrop.ts`, the tier order, info notes, shared export) and the slide-callouts note on text anchors inside shadow roots
- [x] 7.2 `packages/create-codeurjc-slidev/README.md`: what happens to diagrams (mermaid, SVG, loss), the info section, and LibreOffice now also being used for diagram images
- [x] 7.3 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` pass
