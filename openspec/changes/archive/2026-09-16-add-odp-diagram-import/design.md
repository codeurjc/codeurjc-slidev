## Context

The ODP importer converts text, code, images, tables and (since `add-slide-callouts`) arrows and labels over images, but every other drawn shape is reported as a loss. The 11-deck corpus (694 slides) was surveyed during exploration:

- **No structural wiring.** 0 `draw:connector` elements (so no `draw:start-shape`/`draw:end-shape` glue) and 0 `draw:g` groups. 100 `draw:line`s, plus lines drawn as `mso-spt32` custom shapes. Graph structure has to be inferred from geometry.
- **Three real diagrams**, each needing a different treatment:
  - Tema 1.1 slides 81–84 (TLD / TFD / TDD / BDD): three filled `rectangle`s joined by two `right-arrow` shapes, and a red `right-arrow` rotated 90° with a `mso-spt202` text "Pruebas" under a different box on each slide. The body frame reads intro line, intro line, **four empty paragraphs**, three bullets, and the diagram sits over the empty paragraphs. These are four distinct slides, not a build-up.
  - Tema 1.2 slide 123: UML classes drawn as `ooxml-rect`s. The name/method compartments are separate `mso-spt32` lines across the box, the inheritance head is a separate `ooxml-non-primitive` triangle, and "*" is a separate text box. The slide's "Ejercicio 8" body overlaps the whole drawing.
  - 2.2 slide 156: two nested `hexagon`s, four `trapezoid` ports placed only through `draw:transform`, and text frames on top.
  - Tema 1.1 slide 56 (Given/When/Then) looks like a diagram but is boxes pointing at code, which code annotations already claim.
- **Rotation is invisible today.** `parse.ts` reads only `svg:x/y/width/height`. Shapes positioned by `draw:transform` get `rect: undefined`, and every stage skips them silently. That affects 18 shapes on 9 slides, including arrowed callout lines on 1.2 #62/#65, Selenium #31 and Docker #10/#14/#15.
- **LibreOffice's SVG export keeps shapes separate.** Each shape is a `<g class="com.sun.star.drawing.*">` holding a `<rect class="BoundingBox" x y width height>` in 1/100 mm, and the groups appear in the page's document order. For 1.2 #123, all 11 boxes matched the ODP geometry within stroke width.
- **Slidev renders mermaid into an open shadow root** (`@slidev/client/builtin/Mermaid.vue` → `internals/ShadowRoot.vue`, `attachShadow({ mode: 'open' })`), asynchronously. The theme's `findAnchorElement` uses `container.querySelectorAll(...)`, and its placement triggers are a `MutationObserver` on the content plus a `ResizeObserver` on the root. Neither `querySelectorAll` nor the `MutationObserver` sees inside a shadow root.
- Reporting today: `SlideReport.losses` only. `formatReport` prints losses, and the comparison deck and its LibreOffice export run only when losses exist, at the end of `convertOdp`.

## Goals / Non-Goals

**Goals:**
- Convert the corpus's diagrams with the best available fidelity: editable mermaid when the drawing is plainly a graph, an exact SVG crop when it isn't, and a loss only when neither is possible.
- Read `draw:transform` and line markers, so rotated shapes stop disappearing.
- Keep diagram conversion out of the loss channel (info notes) and out of the comparison deck.
- Let the "Pruebas" callouts anchor to mermaid nodes.

**Non-Goals:**
- Mermaid `classDiagram`, `sequenceDiagram` or other diagram types. UML stays an SVG.
- Preserving colours, fonts, sizes or positions inside a mermaid diagram (mermaid's own layout and default theme).
- Reading `draw:connector` glue. The corpus has none; geometric endpoint matching covers connectors too.
- Edge labels (text at an edge's midpoint). The corpus has none, so such a group isn't a clear graph and goes to SVG.
- Positioning a mermaid diagram with `geometry` (it stays in content flow).
- Rasterizing (PNG) or inlining the SVG into markdown.

## Decisions

### 1. Pipeline order: annotations → mermaid → ordinary conversion (trial) → SVG candidates → final conversion

`draftSlide` today runs code annotations, then image emission, then `slideCalloutsFor`, then flattening and losses. The part after annotations becomes a pure function, `convertOverlay(excluded)`, that returns the images to emit, the callouts, the flattened-text blocks, and a **per-shape** loss map. It doesn't touch `ctx.images` yet; the chosen result registers its image files. The pipeline is:

```
annotateCodes ─▶ groups (diagrams.ts) ─▶ mermaid for clear graphs (claims their shapes)
                         │
                         ▼
               pass 1: convertOverlay(excluded = mermaid shapes)
                         │   if LibreOffice usable && slide visible:
                         ▼
               SVG candidates = groups where pass 1 loses something
                         │   (a member in the loss map, or a rotated text used as a callout)
                         ▼
               pass 2: convertOverlay(excluded += candidate members)  ─▶ final draft
```

- **Mermaid runs before callouts.** Otherwise `slideCalloutsFor` pairs a block arrow's tail with the next box's text and emits "Análisis / Diseño" as a point callout.
- **SVG candidates are judged by a trial of the ordinary conversion.** This is the user's "SVG when lossy" rule: a screenshot whose arrows and labels all become callouts keeps them, and an image whose overlay would still lose something (2.2 #153/#156/#157) becomes one picture with it. Running the real conversion as the trial avoids re-deriving `slideCalloutsFor`'s pairing rules.
- **LibreOffice availability is known before drafting.** `convertOdp` runs `detectLibreOffice` up front, unless `office: false`. It passes `canEmbedDiagrams` in `DraftContext`, so without LibreOffice pass 1 is final: exactly today's output. Hidden slides skip pass 2 too.

*Alternative considered:* decide SVG candidates after drafting, in `convert.ts`, and re-draft on fallback. Rejected: fallback would have to undo callouts and image indexes, and a `soffice --version` probe up front is cheap.

### 2. Geometry: transform applied at parse time into `rect`, plus `rotation` and `endpoints`

`parse.ts` parses `draw:transform` (a sequence of `rotate(a)`, `translate(x y)`, and rarely `skewX`/`scale`, applied in order to the untransformed `0,0,w,h` box). It then stores:
- `rect`: the axis-aligned bounding box of the transformed corners, which is what LibreOffice's `BoundingBox` reports;
- `rotation`: the angle in radians, for arrow direction;
- for line-like custom shapes (`mso-spt32`, `line`, `ooxml-line` geometries, or a `rect` with w or h ≈ 0): `endpoints`, from transforming `(0,0)` and `(w,h)`, honouring `draw:mirror-horizontal`/`draw:mirror-vertical`.

ODF's `rotate(a)` turns counter-clockwise on screen. In y-down page coordinates a point maps as `(x, y) → (x·cos a + y·sin a, −x·sin a + y·cos a)`. Checked against 1.1 #84: the 1.243 × 0.825 cm arrow at `rotate(π/2) translate(4.4cm 10.8cm)` gives x 4.4–5.225 and y 9.557–10.8. Its tip (local +x) points up into "Requisitos" (bottom edge y 9.8), and its tail sits on "Pruebas" (y 10.6), which matches the render.

Markers: `styles.ts` resolves `draw:marker-start`/`draw:marker-end` through the graphic style chain into `OdpShape.markers: { start: boolean, end: boolean }`. Arrow custom shapes get a direction from geometry type plus rotation (`right-arrow` local +x, `left-arrow` −x, `up-arrow` −y, `down-arrow` +y). `ooxml-non-primitive` and `mso-spt*` shapes have no known direction and count as undirected.

*Alternative considered:* compute transforms lazily where needed. Rejected: every stage already relies on `rect`, and the six callout slides with rotated arrows would stay broken.

### 3. Grouping and the clear-graph test live in a new `diagrams.ts`

- **Members** come from `ClassifiedSlide` after code annotations: `images`, `connectors` and `texts` not consumed by annotations, and `decorations` (empty shapes; not groups/OLE objects). Title, body, code, tables, links and labels are never members.
- **Linking rules.** Groups are a union-find over two rules. A connector (line, connector or arrow shape) links to any member within `CONNECTOR_DISTANCE_CM` of its whole length: its segment, or its rect for block arrows. Other members link only when they overlap or touch, within `DIAGRAM_TOUCH_CM = 0.1`. Plain text links only when its centre lies on the other shape. The touch rule keeps a caption or explanation box next to a screenshot from pulling the screenshot into a diagram, and arrows still connect things across gaps. In a group with a connector, a singleton plain text of up to `DIAGRAM_LABEL_MAX_LINES = 3` lines within `DIAGRAM_LABEL_DISTANCE_CM = 1` of a shape joins as a *label*. Selenium #41 writes node names 0.6–1 cm beside the computer icons.
- **Code and tables.** A group within `CONNECTOR_DISTANCE_CM` of a code shape or a table is discarded: code annotations own those.
- **Extras.** After grouping, any other slide shape without a role (not title, body, code, table, link or label) whose rect lies fully inside a group's bounding box joins that group as an *extra*. 2.2 #153's curved arrow is a `draw:path` with no resolvable stroke, which classification ignores silently. Extras are cropped when the export has them, but never required to match.
- **Clear-graph test** (mermaid tier, groups without images), in order, with the first failure leaving the group to the ordinary conversion and SVG candidacy:
  1. Box-like members are `rectangle`/`ooxml-rect`/`rect` shapes with text.
  2. No two boxes overlap.
  3. No non-box, non-edge member lies inside a box (compartment lines, triangles).
  4. Every edge's two ends resolve to two distinct boxes (block arrows use their tail/tip points), except node-callout arrows.
  5. The graph is connected.
  6. Every edge angle is within `DIAGRAM_AXIS_TOLERANCE_DEG = 20` of the same axis.
  7. No other members remain.
- **SVG candidacy** (after pass 1): a group that isn't mermaid is a candidate when it has an image or at least two box-like members, and any member is in pass 1's loss map or is a text with `|rotation| > 0.02` that pass 1 consumed as a callout. Two kinds of loss don't count:
  - flattened *labels*: otherwise Tema 1.1 #56's caption would turn its three working callouts into a picture;
  - an empty rectangle framing a whole image of the group.
- **Corpus dry run** (task 6.1): 4 mermaid slides (Tema 1.1 #81–84) and 15 SVG slides:
  - 2.2 #149/#153/#156/#157
  - Docker #14/#15
  - GitHub Actions #8
  - Tema 1.2 #83/#123
  - Selenium #30/#41

  Every one of these was checked against LibreOffice renders: they're drawings or annotated screenshots whose overlay would otherwise partly vanish.

**Emission.** Nodes are declared in reading order (x then y for `LR`, y then x for `TB`), with ids `n1..nN` and labels as `n1["…"]`. The label is `oneLine(text)`, with `"` escaped as `#quot;` and paragraph breaks as `<br>`. Edges are `n1 --> n2`, reversed when the tip is at the first node, or `---` when undirected. The fence is ```` ```mermaid ```` with no options, so it uses mermaid's defaults.

*Alternative considered:* also accept shapes like diamonds or ellipses as flowchart nodes (`{}`, `(())`). Deferred, because the corpus has none and each extra shape weakens "clear".

### 4. Placement: split the body at the nearest empty-paragraph run

`classify.ts` drops empty body paragraphs (`bodyParagraphs`). It will also record `bodyGaps: { index, y }[]`. `index` is the position in `bodyParagraphs` where a run of empty paragraphs was removed. `y` is an estimate of the run's top: body `rect.y + paddingTop + Σ line heights of the preceding paragraphs`, using `fontSizePt × LINE_HEIGHT_FACTOR` and ignoring wrapping, which errs early for long wrapped lines.

When the diagram's top lies between the body's top and bottom and gaps exist, `draft.ts` splits the `body` block at the gap nearest the diagram's top, giving two body blocks. The mermaid block goes between them, with y ordering preserved. Otherwise the mermaid block gets `y = diagram top` and sorts with the other blocks.

A split body stays one logical body for build-up signatures: steps are indexed over the concatenation.

*Alternative considered:* always place the diagram after the body. Rejected: on 81–84 that pushes it under the bullets, away from the intro line it illustrates.

### 5. Node callouts in the mermaid tier

For each unclaimed arrow with one end on a node of a clear graph, and an unbordered, unclaimed text within `CONNECTOR_DISTANCE_CM` of the other end, the importer emits a `SlideCallout`:
- `anchor: {kind: 'text', text: oneLine(node)}`, `text: oneLine(label)`;
- `box: null` (auto-placed: mermaid's layout differs from the drawing's), `step: null`.

The arrow and label are claimed so `slideCalloutsFor` ignores them.

Ambiguity check: if `oneLine(node)` occurs (case-sensitive, same as `String.includes` in the theme) in the body paragraphs or any other emitted text block of the slide, the candidate is demoted to SVG. The arrow and label then join the group, so the SVG shows them. On 1.1 #84, "Los requisitos …" doesn't contain "Requisitos", so there is no collision.

### 6. SVG candidates are cropped after drafting, in `convert.ts`

`SlideDraft` gains `diagramCandidates: { members: OdpShape[], extras: OdpShape[], rect: Rect }[]`. Their shapes are already excluded from the draft's images, callouts, paragraphs and losses (pass 2). After drafts and build-ups, `convertOdp` resolves them:

```
exportNeeded = any draft with candidates || any lossy slide (comparison)
svgText = exportNeeded && LibreOffice ok ? exportSvg(...) (once) : undefined
for each candidate:
  cropDiagram(svg, pageName, members, extras) ok → append image + info note
  otherwise                                     → loss "diagram omitted (not found in LibreOffice's SVG export)"
```

- Crop failure is reported as one loss for the diagram rather than restoring the ordinary conversion. Undoing pass 2 after build-ups would mean re-drafting, and a failed match against LibreOffice's own export of the same file shouldn't happen.
- Resolving candidates happens **before** reports are finalized and before the comparison deck picks lossy slides, since a failure adds a loss. Slide markdown rendering moves after it, which only reorders `convertOdp`.
- The diagram `DraftImage` is appended to `draft.images` **after** existing images, so `{image: N}` anchors of the remaining callouts keep their indexes.

`svgCrop.ts`:
- **Parse once.** `parseSvgExport(svgText)` parses the export once per import (Tema 1.2's is 4.3 MB), and `cropDiagram(doc, pageName, members, extras)` reuses the parsed document.
- **Find and match shapes.** It finds the page by `ooo:name` and collects the shape groups under it (`class` starting `com.sun.star.`) with their `BoundingBox`. Each ODP rect (cm → 1/100 mm) is matched to the closest unused box within `SVG_MATCH_TOLERANCE = 50` (0.5 mm) on every edge.
- **Output.** The root `<svg>` attributes and shared `<defs>` (as `splitSvgSlides` does), the matched groups only (no master `<use>`), and `viewBox` = union of the members' boxes + `DIAGRAM_SVG_MARGIN = 20` on each side. `width`/`height` are removed, so `object-fit: contain` in `geometry.images` scales it.
- **Fail closed.** It returns `undefined` when any member is unmatched. Unmatched extras are skipped.

The file is written to `public/images/diagram-<pageName>[-n].svg` through the existing `ctx.images` map, and its `geometry.images` entry is `mapRect(member union, region)`.

*Alternative considered:* generate the SVG ourselves from the model. Rejected: custom-shape geometry (hexagons, trapezoids, arrows), text layout and fonts would all need reimplementing, while LibreOffice already draws them exactly.

*Alternative considered:* build a temporary one-slide ODP with only the diagram shapes and export that. Rejected: it costs a second LibreOffice run per diagram, with no gain over cropping.

### 7. Reports gain `info`

- `SlideDraft.info: string[]` and `SlideReport.info: string[]`.
- `formatReport` prints `Converted with notes (N slides):` after the code line and notices, and before the losses section, with the same `Slide X (ODP slide Y)` prefix.
- `stats.slidesWithLosses` and the comparison filter keep looking at `losses` only.
- A console notice (in `notices`) is added once when candidates fell back because LibreOffice was missing or too old.

### 8. Build-ups compare diagrams

`analyzePair` already builds shape multisets and only accepts additions that are code callouts, trailing bullets or images. Diagram shapes are compared in the multiset like any shape, so an added or changed box or arrow counts as a non-convertible addition. What's needed is making sure a mermaid block or diagram candidate is carried from the first draft when a run merges: the diagram's shapes are identical across the run, so the merged draft keeps the first slide's diagram block, callouts and candidates.

### 9. Theme: shadow-root-aware text anchors

In `layouts/default.vue`:
- `findAnchorElement(container, text)` first runs the current light-DOM search. With no match, it walks elements under the container that have an open `shadowRoot` and repeats the search inside each, extending the selector with `span.nodeLabel, text, tspan`.
- A match inside a mermaid node (`closest('g.node')`) resolves to that `g.node`'s bounding rect, for both the point and the obstacle.
- The re-measure trigger: the existing `MutationObserver` setup also observes each open shadow root found under the content, re-scanned when the content observer fires. It schedules `computeCallouts()` the same way, and the shadow-root observers are disconnected on unmount.
- The existing once-per-anchor missing-text warning must not fire for a text that later resolves. It is deferred until after the first `nextTick` following a shadow-root render. In practice, warning only when no mermaid host is still empty is enough.

## Risks / Trade-offs

- **[Heuristic swallows a non-diagram into an SVG]** → Candidates must lose something under the ordinary conversion, need an image or at least two box-like shapes, never touch code or tables, and non-connector members only join by overlapping. A corpus dry-run task lists every candidate per deck and its tier, and corpus assertions pin the expected set (1.1 #81–84 mermaid, 1.2 #123 and 2.2 #156 SVG), so a regression shows up as a test diff.
- **[Mermaid layout differs from the drawing]** (box sizes, spacing, wider than the content box) → This is accepted and reported as an info note. Content autofit already scales overflowing content. The smoke build of Tema 1.1 is checked visually.
- **[Paragraph y estimate is off for wrapped lines]** → The gap choice only matters with several empty runs. On 81–84 there is exactly one run, and the fallback is ordering by y.
- **[LibreOffice export differs across versions]** (group classes, `BoundingBox`) → The crop fails closed: an unmatched shape means a loss, never a wrong picture. The real-LibreOffice integration test covers the crop and skips with a warning when `soffice` is absent.
- **[SVG text depends on the viewer's fonts]** → The export references font families rather than embedding glyph outlines, so rendering may differ slightly on machines without the deck's fonts. This is accepted, like the comparison deck's originals.
- **[Text anchors inside shadow roots are slower to resolve]** → The shadow search only runs when the light-DOM search finds nothing, and slides with mermaid are rare.
- **[Callout warning noise while mermaid renders]** → The warning is deferred as described in decision 9, and an e2e test asserts no lingering warning.
- **[Import time]** → The export now also runs for decks with diagrams but no losses. It still runs at most once, as before.

## Migration Plan

No data migration: the importer only creates new projects. Re-importing a deck changes its output as follows:
- the 81–84 slides gain mermaid blocks and callouts;
- 123 and 156 gain SVG images;
- slides with rotated arrows may gain callouts;
- losses shrink, and a new info section appears.

Rollback is reverting the change. Theme changes are additive: text anchors that already resolve in the light DOM behave identically.

## Open Questions

- Does the theme's `{text}` match inside mermaid need `span.nodeLabel`, or does mermaid 11's `htmlLabels` output put the label in a `<p>` that the current selector already matches? This affects only the selector list; it will be confirmed in the e2e test.
- Tema 1.2 #62/#65, Selenium #31 and Docker #10/#14/#15 gain real arrow geometry. Whether that yields new code or slide callouts, or new losses where there were silent drops, will be seen in the corpus run and pinned in the assertions.
