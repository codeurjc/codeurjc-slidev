## Why

Slide devs currently hand-copy code from the `code/` exercise directories into `slides.md`. When the underlying example changes, the slide's copy silently goes stale (already observed: the `GestorNotas` example in `slides.md` no longer matches `code/ejer8/.../GestorNotas.java`). Slidev already ships a native snippet-import (`<<< @/path{lines}`) that reads files live and hot-reloads on change, but the project's own highlight-callout feature (`code-highlight-marking` / `code-highlight-callouts`) only recognizes markers written as trailing comments on the code line itself — which doesn't work for imported code, since exercise files must stay clean (no teaching markup) for students who open them directly.

## What Changes

- Introduce a `<<< @/path/to/file[selector]` snippet-import convention for pulling code from the `code/` directory into a slide, instead of copy-pasting. Slidev's native `<<<` only slices content via in-file `#region`/`#endregion` markers (or shows the whole file) — since example files must stay clean, this change implements its own line-selection preprocessing (a Slidev `pre` markdown-transformer that rewrites the import into a literal fenced block before Slidev's own `<<<` rule runs), still backed by the same live file-read/HMR behavior. Two selector forms, matching the anchor grammar below for a consistent mental model:
  - Line-range: `[9-15]` — absolute line numbers in the source file
  - Content-anchor range: `["first line text".."last line text"]` — from the line containing the first match through the line containing the second, inclusive
  - No selector — whole file, same as today's copy-paste equivalent
- Introduce a single project-level config value naming the code root directory (default `code`), plus a dev-time check that warns/errors when a `<<<` import resolves to a path outside that directory — keeping "all referenced code lives under one configurable directory" an enforced convention, not just documentation.
- Introduce a new marker grammar, written entirely in `slides.md` immediately following a `<<<` import line, for placing highlights/callouts on file-sourced snippets without touching the source file:
  - Slice-relative line anchors (`[!mark:N]`, `[!mark:N..M]`)
  - Content anchors that search the sliced snippet's text (`[!mark:"text"]`, `[!mark:"text"(start-end)]` for substrings, `[!mark:"a".."b"]` and `[!mark:"a"+N]` for ranges)
  - Occurrence selectors for repeated text (`#N` for the Nth match, `#*` for all matches)
  - Graceful degradation: an anchor that matches nothing is skipped (no highlight/callout rendered for it) with a console warning; an anchor that matches more than once without a selector uses the first match, also with a console warning — never silently highlights the wrong fragment.
- Existing inline-typed code blocks keep today's trailing-comment marker grammar (`code-highlight-marking`) unchanged — the new grammar only applies to `<<<`-imported snippets.
- The existing drag-to-reposition flow (`/api/save-code-highlight-position`) continues to patch `slides.md` in place, since both old and new marker forms always live in `slides.md`; it needs to additionally recognize and patch the new anchor-line syntax.

## Capabilities

### New Capabilities
- `code-snippet-import`: Convention and dev-time validation for referencing example code from a configurable root directory (default `code/`) via Slidev's native `<<<` snippet-import syntax, keeping example files themselves untouched.
- `external-highlight-anchors`: The anchor grammar (line, content, range, occurrence-selector) that lets a presenter attach highlights/callouts, from `slides.md`, to specific fragments of a file-sourced code snippet — including graceful degradation when an anchor no longer resolves.

### Modified Capabilities
- `code-highlight-callouts`: "Each highlight renders a connected callout box" currently only considers highlights produced by `code-highlight-marking` (inline comment markers). This must broaden to also render callouts for highlights produced by the new `external-highlight-anchors` capability, using the same auto-placement/connector/drag-override behavior.

## Impact

- `composables/useCodeHighlights.ts`: needs a second parser path (or a shared highlight-model with two front-ends) for the anchor grammar, operating on the *rendered snippet text* rather than trailing comments in the source.
- New `pre` markdown-transformer (registered via `defineTransformersSetup`'s `pre` array, e.g. `setup/transformers.ts` or a new `setup/snippet-import.ts`): parses `<<< @/path[selector]` lines, reads and slices the file itself, rewrites the line into a literal fence in the slide's `MagicString` before Slidev's native `snippet_import` markdown-it rule runs, registers the file for HMR watch, and consumes+records any following anchor-declaration lines so the `codeblocks` transformer can attach them to the resulting fence.
- `setup/transformers.ts`: the `codeblocks` transformer must detect snippet-imported fences (correlated with the `pre`-pass's recorded anchor groups) and route them through the new anchor parser instead of (or in addition to) `parseCodeHighlights`.
- `vite.config.ts` (and its e2e copy `e2e/vite.config.ts`, which must be kept in sync): add the code-root config constant + dev-time path validation; extend `/api/save-code-highlight-position` to patch the new anchor-line syntax.
- `composables/__tests__/` and `tests/`: new unit tests for the anchor parser (content search, occurrence selection, degradation warnings) and e2e coverage for a snippet-imported slide with external anchors.
- No changes expected to `layouts/default.vue` or `composables/useHighlightLayout.ts` — placement/routing geometry is agnostic to where a highlight's anchor came from.
