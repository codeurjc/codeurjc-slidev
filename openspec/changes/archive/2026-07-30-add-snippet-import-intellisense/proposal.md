## Why

Writing a `<<< @/code/...[selector] lang` import today means typing the file path from memory (no completion) and hand-computing a `[N-M]` line range or `["a".."b"]` content-anchor by counting lines or copy-typing text out of the target file — exactly the kind of authoring friction `vscode-marker-annotations`/`vscode-reference-index` already reduce for markers and reverse references, but left untouched for the import line itself.

## What Changes

- **Path completion**: typing `<<< @/` inside a theme-tagged `slides.md` offers file/folder completions rooted at the configured code root, retriggering per path segment.
- **"Copy selector for selection"**: run from a selection in any file, computes a selector string for that selection — a content-anchor range `["first line".."last line"]` when both boundary lines are non-blank and occur exactly once in the file (self-healing against later edits elsewhere in the file), falling back to a plain line range `[N-M]` otherwise (including the always-safe single-line case `[N-N]`) — and copies it to the clipboard.
- **"Paste selector into import"**: run with the cursor on an existing `<<<` import line in a theme-tagged `slides.md`, validates the clipboard content as a real selector (via the theme's own `parseSnippetSelector`, rejecting anything that doesn't parse) and splices it into that line's `[selector]` bracket, replacing any existing selector or inserting a new one.
- New theme-package primitive `serializeSnippetSelector(line, newSelectorRaw)` in `useSnippetImport.ts`, symmetric to `useCodeHighlights.ts`'s existing `serializeMarkerOverride`, so the extension never re-derives the `<<<` line's own bracket-splicing logic.
- No changes to the `<<<` grammar itself, to selector *resolution* semantics, or to any rendering behavior.

## Capabilities

### New Capabilities
- `vscode-snippet-import-intellisense`: path completion for `<<< @/...` imports, plus the copy/paste selector command pair, in the VSCode extension.

### Modified Capabilities
- `code-snippet-import`: gains a requirement that the module expose a round-trip serializer for writing a selector into an existing `<<<` line, for editor tooling to reuse rather than re-derive the bracket-splicing logic.

## Impact

- **Affected code**: `packages/codeurjc-slidev-theme/composables/useSnippetImport.ts` (new `serializeSnippetSelector` export); `packages/vscode-codeurjc-slidev/src/` gains a `CompletionItemProvider` for import paths, a new pure `selectorFromSelection.ts` (the decision tree for which selector form to produce), and two new commands wired in `extension.ts`.
- **Dependencies**: none new — reuses `vscode.env.clipboard`, existing `findProjectRoot`/workspace-scanning helpers from `referenceIndex/scanner.ts`, and the theme's own `parseSnippetSelector`/`parseSnippetImportLine`.
- **Open item carried into design**: whether the official Slidev VSCode extension already offers `<<<` path completion (would need to be checked empirically before committing to building Half A) — flagged in design.md as a pre-implementation spike rather than blocking the proposal.
