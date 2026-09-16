## 1. Marker grammar

- [x] 1.1 Replace `parseMarkerLine`'s single-match parse with a scan that returns every marker on a line: code prefix (text before the comment token), then per marker its role, substring range, click step, position override, and comment body ending at the next `[!mark` or end of line
- [x] 1.2 Record each highlight's marker index within its source line on `CodeHighlight`, using the `:start` marker's index for a range
- [x] 1.3 Process a line's markers left to right in `parseCodeHighlights`, sharing the existing `pendingStarts` stack so nested ranges can end (or start) on one line
- [x] 1.4 Skip a substring marker whose character range overlaps a highlight already parsed for that line, with a console warning naming the line and range
- [x] 1.5 Keep the rendered code identical: everything from the comment token onward is stripped regardless of marker count
- [x] 1.6 Unit tests: two markers on a line, comment body ending at the next marker, two `:end` markers closing nested ranges innermost-first, `:end` followed by `:start`, disjoint substrings on one line, overlapping substrings warn-and-skip, a comment containing `[!mark` splitting, and single-marker lines parsing exactly as before

## 2. Position write-back addressing

- [x] 2.1 Extend `serializeMarkerOverride` to rewrite the Nth marker of a line (keeping each marker's own `{N}` step in place), with unit tests for the second and third marker
- [x] 2.2 Compute each highlight's line occurrence within its slide in `setup/transformers.ts` (from `ctx.slide.source.raw`) and emit it with the marker index alongside `data-source-line`
- [x] 2.3 Read the slide's `source.filepath`, `source.start` and `source.end` in `layouts/default.vue` (replacing `meta.slide.filepath`) and post them with the occurrence and marker indexes
- [x] 2.4 Resolve the target line in the `/api/save-code-highlight-position` middleware by slicing the file to the slide's range and taking the Nth identical line, then rewriting the addressed marker
- [x] 2.5 Fall back to the current whole-file first match when the scoped lookup fails or the new fields are absent, keeping a failed save best-effort
- [x] 2.6 Unit tests for the middleware's resolution: multi-marker line, duplicate identical lines within one slide, identical lines in different slides, and the fallback path

## 3. ODP importer

- [x] 3.1 Rewrite `renderInlineMarks` to write every mark, ordering a line's markers as range ends (innermost first), then single-line and substring marks, then range starts
- [x] 3.2 Remove the "another marker already uses that line" loss, keeping the loss for languages without line comments
- [x] 3.3 Unit tests: nested ranges ending on one line, a substring mark sharing a line with a range end, and a round-trip through `parseCodeHighlights` asserting the produced markers parse back to the intended highlights
- [x] 3.4 Update the corpus spot check for the GitHub Actions deck to assert both `WORKFLOW` and `JOB` ranges survive, and that no collision loss is reported

## 4. Editor support

- [x] 4.1 Confirm the VS Code dim span still covers the whole marker region on a multi-marker line, and add regression tests in `markerDecorations.spec.ts` for two markers and for the highlight boxes they produce
- [x] 4.2 E2e: drag the callout of the second marker on a line carrying two, asserting the override lands in the second marker
- [x] 4.3 E2e: drag a callout on a slide whose marked line is duplicated in another slide, asserting the other slide's line is untouched

## 5. Documentation

- [x] 5.1 `AGENTS.md`: grammar tables for several markers per line, comment-body termination, the unsupported `[!mark` in comment text, and the overlapping-substring rule
- [x] 5.2 `AGENTS.md`: describe the write-back addressing (slide range, line occurrence, marker index) in the `vite.config.ts` middleware notes
- [x] 5.3 `tutorial.md`: extend the code-annotation syntax slide with several markers per line, and add a live example of two nested ranges ending on one line
- [x] 5.4 `packages/create-codeurjc-slidev/README.md`: note that overlapping code annotations now convert without losses

## 6. Verification

- [x] 6.1 `pnpm lint && pnpm typecheck`
- [x] 6.2 `pnpm test`
- [x] 6.3 `pnpm test:e2e`
- [x] 6.4 Local corpus run: the GitHub Actions deck emits all 16 highlights (9 ranges, 1 line, 6 substrings; 28 `[!mark` occurrences) with zero collision losses, against 8 emitted and 8 dropped before, and no other deck regresses
