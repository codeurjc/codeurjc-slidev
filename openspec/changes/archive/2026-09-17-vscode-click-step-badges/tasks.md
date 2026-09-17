## 0. Theme: native ranges on wrapped fences

- [x] 0.1 `setup/transformers.ts`: `wrapCodeBlock` parses the fence info like Slidev's wrapper and forwards `:ranges` and `v-bind` options; export the anchor-line parser from `useCodeHighlights.ts`
- [x] 0.2 Theme unit test for the wrapper output (ranges, options, title, source link) and an e2e case: a marked fence with `{1|3}` highlights line 3 at click 1 and its marker at click 2

## 1. Click model

- [x] 1.1 `documentScan.ts`: expose each fence's info string (range segments and `{…}` options) and a helper splitting a document into slides (text, start line, frontmatter), reusing the existing separator rules
- [x] 1.2 `src/clickModel.ts`: `computeSlideClicks(slideText, slideStartLine)` reproducing `calculateSince` for theme marker/anchor steps, fence ranges (relative/numeric `at`), `v-click`/`v-click-hide`/`v-after` attributes and elements, `<v-clicks>` over a markdown list (`depth`, `every`, `at`), `<VClickGap>`, frontmatter `clicks`; `registrations` in registration order with `exact`, `total`, `uncountable`
- [x] 1.3 Uncountable sources: bound/non-literal values, `<v-switch>`, magic-move fences, unknown or custom components (with an allow-list of click-free built-ins), MDC `{v-click}` attributes and KaTeX ranges (no reliable registration in the ground-truth deck), `<v-clicks>` over non-lists; later relative registrations become inexact, the total `null` unless `clicks:` is set
- [x] 1.4 Unit tests for the model: one table case per source form, relative vs absolute ordering, nested `<v-click>`, frontmatter override, uncountable before and after a fence, slide boundaries

## 2. Badges, hovers and CodeLens

- [x] 2.1 `stepBadges.ts`: `formatStepBadge(steps, total, showTotal)` (`▸2`, `▸1,3`, `▸2 of 3`) with unit tests
- [x] 2.2 `markerDecorations.ts`: carry `click` on highlights and compute `badges` per line from marker steps and exact fence range segments (`:start` line, first line of a segment's first range, `all`/`*` on the opening line), merged and de-duplicated
- [x] 2.3 Anchor-line badges (through the model's anchor registrations) and hover text (`computeStepHovers` in `stepBadges.ts`) with "revealed at click N [of M]", and the uncountable reason when a number is hidden
- [x] 2.4 Marker-line hovers for manual fences with a step (`computeStepHovers`, a new hover source), same wording, plus a hover on code blocks whose range clicks are unknown
- [x] 2.5 `referenceIndex/codeLens.ts`: slide labels gain `▸N [of M]` for stepped anchors; `showTotal` passed in
- [x] 2.6 Unit tests: badge lines/texts for markers, ranges, several markers per line, unstepped lines, fence ranges (`{2|4-5|all}`), anchors, `showTotal` off, uncountable slides; hover texts; CodeLens titles for stepped and unstepped references

## 3. Extension wiring

- [x] 3.1 `package.json`: `contributes.configuration` with `codeurjcSlidev.stepBadges.showTotal` (boolean, default `true`, description)
- [x] 3.2 `extension.ts`: badge decoration type (`after` text in `editorCodeLens.foreground`), applied with fence and anchor badges; repaint on `onDidChangeConfiguration`; CodeLens refresh on the same event
- [x] 3.3 `extension.ts`: `activate()` returns `{ stepBadgesFor(uri) }`, backed by the badges last applied per document

## 4. Tests against Slidev and the extension host

- [x] 4.1 `tests/click-model-ground-truth.spec.ts` (isolated project): fixture deck with one slide per recognised source and mixes; assert each slide's real click total and each fence segment's first click equal `computeSlideClicks`; add the spec to `playwright.config.ts`
- [x] 4.2 Mirror the ground-truth fixture's expectations in a vitest table so model regressions fail without a browser
- [x] 4.3 Smoke fixture: add a slide with stepped markers, a `:start{N}` range, a fence with native ranges, a stepped anchor, and an uncountable slide; a stepped anchor referencing `code/Foo.java`
- [x] 4.4 Smoke tests (`test-extension/suite/stepBadges.test.cjs`): badge texts via the exports hook (with and without total, uncountable slide), hover text on a marker and an anchor line, CodeLens title on `code/Foo.java`, and toggling `showTotal` updates badges and the lens

## 5. Docs and checks

- [x] 5.1 Extension README ("Marker preview" and a "Click step badges" section with the setting) and `AGENTS.md`'s VS Code section (`clickModel.ts`, badges, exports hook, ground-truth spec)
- [x] 5.2 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` pass, plus `xvfb-run -a pnpm test:extension`
