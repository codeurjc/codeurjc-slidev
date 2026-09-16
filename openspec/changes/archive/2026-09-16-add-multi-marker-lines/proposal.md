## Why

A fenced line can carry only one `// [!mark]` marker: the grammar treats everything after the marker's `]` as that highlight's comment, so a second marker on the same line is swallowed as comment text and stripped from the render. Nested ranges that end together therefore can't both be expressed — the common "outer box plus inner box" shape over a workflow or a method. The ODP importer already hits this on real decks: the GitHub Actions deck wants 23 marks and drops 8 of them as "another marker already uses that line", because the WORKFLOW and JOB ranges both end on `- run: mvn test`.

Marks belong next to the code they mark, so the fix is to let a line carry several markers rather than to move marks out of the fence.

## What Changes

- A fenced line MAY carry several markers in its trailing comment. Each marker's comment body ends at the next `[!mark` on that line, or at end of line for the last one. The rendered (stripped) code is unchanged: everything from the comment token onward still disappears.
- Range pairing stays nearest-unclosed-start-first, applied left to right within a line, so `# [!mark:end] [!mark:end]` closes the innermost range first.
- Marker comment text cannot contain the literal `[!mark`; this is documented, and such a comment splits at that point rather than failing.
- Two *overlapping* substring ranges on one line are not supported: the second is skipped with a console warning. Disjoint substring ranges on one line are supported.
- A dragged callout's `@x,y` write-back is addressed by slide line range, line occurrence within that slide, and marker index within the line, instead of the first whole-file match of the source line. This is required for several markers per line, and also fixes a pre-existing defect where two identical marked lines in a deck sent the override to the wrong one.
- The ODP importer emits every mark inline instead of dropping the wider one when two marks need the same line, removing the "another marker already uses that line" loss.
- Not breaking: a line with a single marker parses exactly as it does today, and existing write-back payloads without the new fields keep working through a documented fallback.

## Capabilities

### New Capabilities

None. This extends existing grammar, write-back and importer behavior.

### Modified Capabilities

- `code-highlight-marking`: the inline marker grammar gains several-markers-per-line, with comment bodies ending at the next marker, plus the unsupported-`[!mark`-in-comment and overlapping-substring rules.
- `code-highlight-callouts`: the manual position override is addressed per marker, not per source line, so the correct marker is rewritten when a line carries several or when an identical line appears elsewhere in the deck.
- `odp-code-conversion`: code annotations that need the same line are all emitted, instead of keeping the narrower one and reporting the wider one as a loss.

## Impact

- `packages/codeurjc-slidev-theme/composables/useCodeHighlights.ts`: marker parsing (`parseMarkerLine`, `parseCodeHighlights`, `findMarkerSpan`) and `serializeMarkerOverride` gain a per-line marker index; substring overlap detection.
- `packages/codeurjc-slidev-theme/setup/transformers.ts`: emits the per-highlight marker index and the line's occurrence within its slide.
- `packages/codeurjc-slidev-theme/layouts/default.vue`: posts the new addressing fields; reads the slide's source path and range from `slide.source` rather than `slide.filepath`.
- `packages/codeurjc-slidev-theme/vite.config.ts`: `/api/save-code-highlight-position` resolves the target line within the slide's range, with the current whole-file match as fallback.
- `packages/create-codeurjc-slidev/src/odp/annotations.ts`: `renderInlineMarks` places every mark, ordering markers within a line.
- `packages/vscode-codeurjc-slidev`: no logic change expected (its dim span already runs to end of line); tests cover multi-marker lines.
- Docs: `AGENTS.md` grammar tables, `tutorial.md`, `packages/create-codeurjc-slidev/README.md`.
- Tests: theme unit tests, importer unit/corpus tests, and e2e drag coverage for a multi-marker line and for duplicate identical lines.
