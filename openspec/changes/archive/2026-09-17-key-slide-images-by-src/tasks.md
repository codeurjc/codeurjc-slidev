## 1. Spike: authored src in the DOM

- [x] 1.1 Try the markdown-it route: register a rule from the theme (theme `vite.config.ts` `slidev.markdown.markdownSetup`, or a `setup/` entry) that sets `data-src` on image tokens and on `<img>` tags in HTML tokens; check `pnpm dev` and `slidev build`
- [x] 1.2 If 1.1 isn't possible, try the `pre` transformer route (raw `<img>` gets `data-src`; `![alt](src "title")` and `=WxH` become an equivalent `<img>`; fences skipped), then the runtime mapping from the slide's markdown source
- [x] 1.3 Verify the chosen route on a markdown image, a raw `<img>`, an `<img v-click>` and an image in a list item, in dev and in a built deck; record the choice and findings in `design.md` (decision 1)

## 2. Reference grammar

- [x] 2.1 Create `composables/useImageRefs.ts`: `parseImageRef`, `formatImageRef`, `imageRefFor`, `resolveImageRef` (trailing `#\d+` only, `#0` invalid, repeated bare src → first occurrence + warning, missing → warning)
- [x] 2.2 `useSlideGeometry.ts`: entries `{ src?, x, y, w, h }` parsed into `{ ref, rect }` (positional ref = list index), serialization writing `src`, and `withGeometryRect` taking the slide's `srcs` to migrate resolvable positional entries
- [x] 2.3 `useSlideCallouts.ts`: image anchors `{ kind: 'image', ref, x, y }` accepting string or integer, serialization via `formatImageRef`, and `withSlideCallout`/`withoutSlideCallout` taking `srcs` to migrate positional image anchors
- [x] 2.4 Unit tests: grammar edge cases (fragments, `#0`, repeats, missing), shortest-reference generation, geometry and callout parsing/serialization with both forms, and migration keeping unresolvable entries untouched

## 3. Theme rendering and editing

- [x] 3.1 Implement the chosen stamping route and an `authoredSrc(img)` accessor used by the layout
- [x] 3.2 `default.vue`: read geometry from the slide-info ref; resolve geometry entries (src entries claim images first, colliding positional entries warn) and callout image anchors through `resolveImageRef`
- [x] 3.3 Editor writes: "+ Callout" on an image writes `imageRefFor`, anchor drags keep the image and write a src ref, geometry and callout writes pass the slide's `srcs` so positional entries migrate
- [x] 3.4 E2e: inserting an image before a src-keyed image keeps its geometry and callout; a slide with positional entries migrates to `src` on a geometry drag and on a callout drag; a repeated picture gets `#2`; an unresolvable `src` warns and leaves images in flow; a built deck resolves `src` entries (checked by hand on a `slidev build` of a scratch deck, since e2e runs against the dev server)

## 4. ODP importer

- [x] 4.1 `draft.ts`/`imageCallouts.ts`: build image anchors with the archive href, rewrite them to `imageRefFor(publicSrcs, index)` in `applyOverlay`, and emit `src`-keyed `geometry.images` entries (`#N` for a repeated picture)
- [x] 4.2 Diagram images: `src`-keyed entries; drop the "after other images" ordering comments and constraint
- [x] 4.3 Unit tests: a screenshot callout anchored by `src`, a picture used twice getting `#1`/`#2`, and a slide where a diagram candidate removed an image before an anchored one
- [x] 4.4 Update corpus assertions that match `{ image: N, … }` to `src` references

## 5. Docs and checks

- [x] 5.1 `AGENTS.md` (Slide geometry, Slide callouts, ODP import), `tutorial.md` examples, and the CLI README: `src` references, `#N`, numbers still accepted and migrated on edit
- [x] 5.2 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` pass
