## Context

Callouts exist today only for code. `setup/transformers.ts` emits `[data-highlight-id]` spans from markers inside a fence; `layouts/default.vue`'s `computeCallouts` groups those spans, unions their rects, and hands the result to `useHighlightLayout`'s `placeCallout`/`elbowPath`; drags are written back into the marker by `serializeMarkerOverride` through the `/api/save-code-highlight-position` middleware.

Three facts make a general version cheap:

- **Placement is already anchor-agnostic.** `PlacementInput` takes `codeRect` (the obstacle), `highlightRect` (what to point at), `calloutSize`, `slideRect` and `placed`. Only the field's name is code-specific.
- **The DOM scan is one line.** `computeCallouts` collects `[data-highlight-id]` inside `.content-inner`. Anything that produces an anchor rect can join the same pipeline, including click steps (`isStepHidden`) and the drag machinery.
- **Frontmatter write-back already exists.** `persistGeometry` debounces, refuses to write while `isInteracting`, validates rects, and calls Slidev's `update({ frontmatter })`. A `callouts` list can reuse that pattern verbatim.

The one place that assumes code is the obstacle lookup: `first.closest('pre') ?? slideRect`. An obstacle equal to the whole slide makes every placement candidate overlap, collapsing callouts into the stacked fallback — so this must become "the anchor's own element, or nothing".

Corpus evidence (11 decks, 226 slides with images): 49 arrows point into an image (18 with a text box, 31 bare), 41 text boxes sit on top of an image, and 14 labelled arrows point at body content. All are losses today.

## Goals / Non-Goals

**Goals:**

- Let a callout point at anything on a `default`-layout slide: a spot on an image, a piece of content, or a bare point.
- Cover the three shapes the corpus actually contains — connected box, bare arrow, label — without three mechanisms.
- Let the importer emit them, and let authors create them by pointing at the slide.
- Keep code callouts working exactly as they do, other than gaining arrowheads.

**Non-Goals:**

- Importing diagrams. The flowcharts and UML boxes drawn in Impress (slides 81–84, 123 of the corpus) are a Mermaid conversion problem, tracked separately.
- Callouts on non-`default` layouts.
- Moving code highlights out of markers. Annotations of code stay next to the code.
- Freehand drawing, shapes, or arrows between two callouts.

## Decisions

### D1: Callouts live in slide frontmatter, next to `geometry`

An annotation of *code* belongs next to the code, which is why markers live in the fence. An annotation of *the slide* has no such home, and the canvas already has one: `geometry`. Putting `callouts` beside it means the same file, the same `update({ frontmatter })` write path, the same debounce-and-validate discipline, and the same "editor writes it, author can hand-edit it" property.

The alternative — declaration lines after the content, like `[!mark:...]` after a `<<<` import — was rejected for this case: there is no content line to attach to for a free point, and an image's `![](…)` line is not where a reader looks for a position.

### D2: Three anchor kinds, chosen by what was clicked

```
click lands on…          anchor stored              stability
──────────────────────────────────────────────────────────────────
<img>            ──▶  {image: N, x, y} fractions    moves with the image
content element  ──▶  {text: "…"}                   survives reflow/autofit
empty canvas     ──▶  {x, y} slide pixels           drifts if content reflows
```

Free points are the escape hatch that makes "any part of the slide" true, and the only kind that can silently point at the wrong place later. Making the editor prefer a stable kind whenever the click lands on something keeps that hazard opt-in rather than default.

Image fractions resolve against the image's **rendered** rect, not its `geometry.images` box: an image is drawn with `object-fit: contain`, so a 2:1 picture in a square box is letterboxed and the box's centre is not the picture's centre.

### D3: One geometric rule produces all three shapes

A connector is drawn only when the callout's box does not contain its anchor.

```
box beside anchor        empty text              box over anchor
 ●──────┐ ┌──────┐        ●◄─────                ┌─ ● label ─┐
        └─┤ text │         (no box)              └───────────┘
          └──────┘                                (no connector)
```

This avoids a `kind:` discriminator and makes the importer's job trivial: a label over an image is emitted by setting `box` to the anchor's own position. It also means an author who drags a box onto its anchor gets a label, which is a reasonable reading of the gesture.

### D4: Arrowheads on every connector, drawn at the anchor end

`elbowPath` returns `[anchor, bend, boxEdge]`, so the arrowhead belongs at the **start** of the path. `marker-end` would put it against the box, and a plain `marker-start` points backwards along the path; `orient="auto-start-reverse"` is what aims it at the target. The `<marker>` needs its own `fill`, because `.code-callout-connector` sets `fill: none` and a marker child would inherit it and render invisible. One `<defs>` in the existing `.code-callout-svg` serves every connector on the slide.

This changes the appearance of existing code callouts, which is intended: a connector with no head reads as a tether, and the same visual language should apply whether the target is a line of code or a spot on a screenshot.

### D5: The obstacle comes from the anchor, not from `<pre>`

`computeCallouts` resolves the obstacle as `first.closest('pre') ?? slideRect`. It becomes: the anchor's owning element (the `<pre>` for a code span, the `<img>` for an image anchor, the matched node for a content anchor) and, for a free point, no obstacle at all — placement then only avoids other callouts and the slide edges.

### D6: Creation is one armed click, then typing

```
Layout tab ──▶ [＋ Callout] ──▶ crosshair ──▶ click target
                                                 │
                            auto-placed box with focused input
                                                 │
                              type ──▶ Enter commits │ Esc cancels
                                       (empty ⇒ bare arrow)
```

One click rather than two (anchor, then box), because `placeCallout` already chooses a good side and shelf-stacks; dragging afterwards is the correction path, exactly as for code callouts. `Alt`+click anywhere is the same action without arming the tool — `global-top.vue` already establishes that a global listener plus transient UI is acceptable here, since that's how image paste works.

The armed tool has to swallow the first `mousedown` above `.content-overlay`, which in editor mode covers the whole content area to drag the content box. Without that, "click on a bullet" starts a content drag instead.

Inline text editing inside the box is new UI for this theme. The fallback, if it proves awkward, is to create the entry empty and let the author type in the SideEditor's markdown pane.

### D7: The importer reuses its existing pairing code

`annotations.ts` already pairs connector endpoints with text boxes for code, and `classify.ts` already separates images, connectors and loose texts. Pointing the same pairing at image rects yields the four shapes directly; `geometry.ts` maps ODP centimetres to canvas pixels, and image anchors divide through by the image rect to get fractions.

### D8: `step: N` mirrors the marker suffix

The same semantics and the same click counter as `{N}` on code markers, including one exported page per step with `--with-clicks`. This also lets the importer's build-up merging collapse numbered tutorial slides (the Azure portal walkthrough) into one slide with steps.

## Risks / Trade-offs

- **Free-point anchors drift** when content reflows or autofit rescales → the editor prefers image and content anchors whenever the click lands on something, and the popover shows which was chosen.
- **Content-text anchors break when the text is edited** → treated like an unresolved snippet anchor: skip and warn, never fail the render.
- **Arrowheads change existing decks' appearance** → intended and called out in the proposal; the e2e suite asserts connector counts rather than geometry, so it should stay green.
- **The creation tool fights the content overlay** → the tool takes precedence while armed; without that the feature is unusable on content anchors.
- **Two homes for callouts** (markers for code, frontmatter for slides) could confuse → they're distinguished by what they annotate, and the docs state the rule in one line.
- **Inline text editing is new UI** → scoped to its own task group so the rest of the feature can land without it.

## Migration Plan

Purely additive: a deck with no `callouts` frontmatter behaves exactly as before, apart from arrowheads appearing on existing code-callout connectors. No importer output changes for decks whose images carry no annotations. Rollback is a revert; decks that had adopted `callouts` would render without them, and the frontmatter would be ignored as an unknown key.

### D9: Callouts are read from Slidev's slide-info ref, not `$frontmatter`

When the editor patches only a slide's frontmatter, Slidev's server applies the
patch to its in-memory slide *before* writing the file. Its file watcher then
compares that already-updated slide with the file, finds nothing changed, and
sends no HMR update, so a mounted slide's `$frontmatter` keeps the old value for
the rest of the session. The slide-info ref from `useDynamicSlideInfo` doesn't
have that problem: `update()` stores the server's response in it, and a hand
edit reaches it through `slidev:update-slide`. So the layout parses callouts
from that ref, falling back to `$frontmatter` until its first fetch lands and in
a static build, and writes go through the same `update()`.

`persistGeometry` has the same staleness but never shows it, because dragged
geometry lives in the editor's own position state rather than being re-read
from `$frontmatter`.

A new callout is held locally until it's committed, then written once with its
text, so a cancelled one never touches the file.

## Open Questions

- Should a content anchor pin to the *element* or to the matched text run? Element is simpler and matches how code highlights union their spans; text runs would allow pointing at one word in a bullet.
- Should the editor offer converting an existing free-point anchor into an image or content anchor once the author drags it onto something? Cheap to add later, and easy to get wrong if it re-anchors accidentally.
- Do bare arrows need a length/direction convention when auto-placed? With no box there is nothing to route to, so the current plan is that a bare arrow requires either a `box` (giving it a direction) or a default stub pointing from outside the anchor's element.
