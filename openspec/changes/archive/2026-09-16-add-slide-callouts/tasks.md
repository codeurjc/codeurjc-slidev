## 1. Frontmatter model

- [x] 1.1 Create `composables/useSlideCallouts.ts` mirroring `useSlideGeometry.ts`: parse a slide's `callouts` list into entries of `{ at, text?, box?, step? }`, validating each anchor form (`{image,x,y}` fractions in 0..1, `{x,y}` pixels, `{text}` non-empty) and collecting warnings per entry
- [x] 1.2 Serialize entries back to frontmatter, rounding pixel values and preserving entries the editor didn't touch
- [x] 1.3 Add the per-slide editor keys for a callout's box and anchor (e.g. `callout:<slideNo>:<index>` and `:anchor`), alongside the existing `callout:` dynamic keys
- [x] 1.4 Unit tests: each anchor form, invalid entries skipped with warnings while siblings survive, round-trip through serialize, and out-of-range image fractions

## 2. Rendering and anchors

- [x] 2.1 Add an arrowhead `<marker>` to the callout SVG `<defs>` and reference it as `marker-start` with `orient="auto-start-reverse"`, giving the marker its own fill (the connector path sets `fill: none`)
- [x] 2.2 Verify the arrowhead lands at the anchor end for all four elbow sides, and that existing code callouts keep their routing
- [x] 2.3 Resolve anchors to rects in `layouts/default.vue`: image fractions against the image's rendered (letterbox-corrected) rect, content text against the first matching element, points against the slide canvas
- [x] 2.4 Replace the obstacle lookup `first.closest('pre') ?? slideRect` with the anchor's owning element, and no obstacle for free points
- [x] 2.5 Feed slide callouts through the existing callout item pipeline so placement, shelf-stacking, `step-hidden` and drag all apply unchanged
- [x] 2.6 Draw the connector only when the box doesn't contain the anchor; render a callout with empty text as connector-only
- [x] 2.7 Ignore callouts on non-`default` layouts with a console warning
- [x] 2.8 Unit tests for anchor resolution and the connector rule; e2e for a declared callout rendering connected, a bare arrow, and a label with no connector

## 3. ODP importer

- [x] 3.1 Pair connector endpoints against image rects in the importer (reusing the code-callout pairing), classifying each as arrow+text, bare arrow, in-image label, or content-anchored arrow
- [x] 3.2 Emit `callouts` frontmatter from `draft.ts`, with image anchors as fractions and box positions mapped through `geometry.ts`
- [x] 3.3 Stop reporting the converted arrows and labels as losses, keeping losses for everything still unconvertible
- [x] 3.4 Unit tests for the four shapes from synthetic ODPs
- [x] 3.5 Corpus check: the Azure deck's portal-tutorial slides emit connected callouts, `2.5 Análisis estático` emits bare arrows, `2.2 Código de calidad` emits in-image labels, and the corresponding losses disappear

## 4. Interactive authoring

- [x] 4.1 Add a callout tool to the Layout tab that arms a crosshair and takes precedence over `.content-overlay`'s drag handler for the next click
- [x] 4.2 On click, pick the anchor kind from what was hit (image → fraction, content element → text, empty canvas → point) and create the entry, auto-placed
- [x] 4.3 Inline text input inside the new callout: Enter commits, Esc cancels, empty text commits a bare arrow
- [x] 4.4 Drag handle at the arrow tip to move the anchor, reusing the editor's drag machinery, writing back the anchor in its own form
- [x] 4.5 Delete a callout from editor mode, removing its frontmatter entry and leaving siblings untouched
- [x] 4.6 Persist box, anchor, text and deletions with the debounced, `isInteracting`-guarded frontmatter write used by `persistGeometry`, never touching `layouts/`
- [x] 4.7 `Alt`+click anywhere in editor mode as the no-arming shortcut
- [x] 4.8 E2e: create a callout on an image by pointing, type text, assert the frontmatter entry; drag the anchor and assert the fractions change; delete it and assert the entry is gone

## 5. Documentation

- [x] 5.1 `AGENTS.md`: a "Slide callouts" section (frontmatter shape, the three anchor kinds, the connector rule, bare arrows and labels, steps, default-layout-only) plus the arrowhead change to code callouts
- [x] 5.2 `tutorial.md`: a slide explaining slide callouts with a live example on an image, and a note that creating them is a click in the Layout tab
- [x] 5.3 `packages/create-codeurjc-slidev/README.md`: arrows and labels over screenshots now convert instead of being reported as losses

## 6. Verification

- [x] 6.1 `pnpm lint && pnpm typecheck`
- [x] 6.2 `pnpm test`
- [x] 6.3 `pnpm test:e2e`
- [x] 6.4 Local corpus run: the 11 decks emit 96 callouts (84 image-anchored, 12 point-anchored; 36 bare arrows), `arrow or line omitted` losses fall from 38 to 15 and `positioned text box flattened into a paragraph` from 151 to 134, and decks without image annotations are unchanged
