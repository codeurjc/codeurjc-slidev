## 1. Pre-implementation spike

- [x] 1.1 In the Extension Development Host with only the official Slidev extension installed, type `<<< @/` in a theme-tagged `slides.md` and confirm whether it already offers path completion; note the finding and adjust task 3's scope (drop/narrow it) if so -- **finding: no path/file completions offered at all, only generic word-suggest noise; task 3 proceeds at full scope (see design.md)**

## 2. Theme package: selector serializer

- [x] 2.1 Implement `serializeSnippetSelector(line, newSelectorRaw)` in `useSnippetImport.ts`, reusing `parseSnippetImportLine`'s own bracket-scanning position rather than re-deriving it
- [x] 2.2 Unit test: insert into a bare import (no existing selector), replace an existing selector, preserve trailing `notitle`/language tokens

## 3. Path completion (pending the spike's outcome)

- [x] 3.1 Implement a directory-listing helper for the code root (one level at a time, unlike the reference index's fully-recursive walk), reusing `findProjectRoot`
- [x] 3.2 Implement a `CompletionItemProvider` registered for markdown, gated on the theme-detection check, firing only when the line up to the cursor matches the `<<< @/...` prefix shape
- [x] 3.3 Unit test the pure prefix-matching/candidate-filtering logic without a real vscode completion context
- [x] 3.4 Extension-host smoke test: completions appear for a fixture code-root file

## 4. Selector-from-selection decision logic (extension, pure)

- [x] 4.1 Implement `selectorFromSelection.ts`: single-line selection → `[N-N]`; multi-line → attempt content-anchor (trimmed boundary lines, non-blank, each occurring exactly once in the file), else line range `[N-M]`
- [x] 4.2 Unit test all branches: single line, unique multi-line boundaries, ambiguous (duplicate) boundary text, blank boundary line

## 5. Copy/paste commands

- [x] 5.1 Register "Copy Selector for Selection": compute via `selectorFromSelection`, write to `vscode.env.clipboard`
- [x] 5.2 Register "Paste Selector into Import": confirm cursor is on a line matching `parseSnippetImportLine`, read clipboard, validate via `parseSnippetSelector`, splice via the new `serializeSnippetSelector`, apply as a `WorkspaceEdit`
- [x] 5.3 Error path: clipboard content that doesn't parse as a selector reports an error and makes no edit
- [x] 5.4 Error path: cursor not on an import line reports an error and makes no edit
- [x] 5.5 Extension-host smoke test: copy from a fixture selection, paste into a fixture import line, confirm the resulting line text

## 6. Documentation

- [x] 6.1 Update the package's own `README.md`, root `README.md`, and `AGENTS.md`'s architecture notes to describe path completion and the copy/paste commands (or their absence, if the spike drops path completion)
