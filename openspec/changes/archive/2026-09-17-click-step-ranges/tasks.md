## 1. Step range core

- [x] 1.1 `composables/stepRange.ts`: `StepRange`, `parseStepRange` (with validation: start ≥ 1, end ≥ start or ≥ 0 with open start), `formatStepRange`, `isVisibleAt`, `rangeRegistrations`, `rangesOverlap`
- [x] 1.2 Unit tests: every valid and malformed form from the spec (`2`, `2-`, `2-4`, `-1`, `-0`, `0`, `0-2`, `3-2`, `-`, `2-3-4`, ``), visibility at boundaries, registrations, overlap

## 2. Theme grammar and data

- [x] 2.1 `useCodeHighlights.ts`: marker regex and `parseAnchorLine` capture the brace content and validate through `parseStepRange`; `CodeHighlight.click` becomes `StepRange`; `:start`/`:end` precedence and `#*` sharing unchanged; `serializeMarkerOverride` keeps ranges before `@x,y`
- [x] 2.2 `useSlideCallouts.ts`: `step` accepts numbers and range strings, warns and drops an invalid one; serialization writes `formatStepRange`; `slideCalloutClickSteps` returns registration clicks
- [x] 2.3 Unit tests: marker/anchor ranges (incl. substring + override, `:start` range, `#*`), malformed ranges leave markers unrecognized, write-back keeps `{2-3}`, callout `step: 2-4` / `-1` / invalid

## 3. Theme rendering and placement

- [x] 3.1 `setup/transformers.ts`: code-block and slide-callout placeholders register start and end + 1 for every range; `data-highlight-click` carries the formatted range
- [x] 3.2 `layouts/default.vue`: `isStepHidden(range)` via `isVisibleAt` for highlight spans, code callouts and slide callouts
- [x] 3.3 `useHighlightLayout.ts` + `default.vue`: `placed` entries carry ranges; placement and shelf-stacking ignore rects whose range doesn't overlap the new callout's; unit tests for placement with disjoint and overlapping ranges
- [x] 3.4 E2e (`tests/callout-click-steps.spec.ts` or a new isolated spec): walk-through `{-0}`/`{1-1}`/`{2}` visibility per click, a range's disappearance click in the total, walk-through callouts placed beside their own lines (not stacked), dragging keeps `{2-3}`, slide callout `step: -1`, and export with clicks page count

## 4. ODP importer

- [x] 4.1 `buildups.ts`: `analyzePair` allows removed code annotation shapes on identical code; `mergeRun` assigns step ranges from the slides each mark appears on (open end on the last slide, `{-b}` from the first), splitting at non-contiguous appearances
- [x] 4.2 `annotations.ts` / `draft.ts`: marks carry `StepRange` and render suffixes through `formatStepRange`
- [x] 4.3 Near build-up warnings for same-title pairs that differ only in highlights, callouts, list items or images but can't merge, with a reason
- [x] 4.4 Tests: synthetic walk-through ODP (`{-0}`, `{1-1}`, `{2}`), mark moving across two slides, returning highlight kept separate with a warning, swapped image warns; corpus expectations for Tema 1.2 ODP 112–114 and the GitHub Actions decks' merges

## 5. VS Code extension

- [x] 5.1 `clickModel.ts`: ranges on markers, anchors and callout `step:` register start and end + 1
- [x] 5.2 `stepBadges.ts`: badges and CodeLens labels in authored form (`▸2-4 of 5`, `▸-0`), merged by first click; hovers "visible at clicks N–M" / "visible until click M"
- [x] 5.3 Unit tests for the model, badges, hovers and lens titles with ranges; ground-truth deck gains a range slide and a walk-through slide with real-Slidev totals; smoke fixture gains a ranged marker

## 6. Docs and checks

- [x] 6.1 `AGENTS.md` (marker grammar table, anchor grammar, slide callouts, placement, ODP build-ups, VS Code) and `tutorial.md` (click-steps slide with a walk-through example)
- [x] 6.2 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` and `xvfb-run -a pnpm test:extension` pass; ODP corpus tests pass locally
