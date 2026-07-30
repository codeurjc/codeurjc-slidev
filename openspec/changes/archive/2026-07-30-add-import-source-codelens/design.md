## Context

`importAnalysis.ts`'s `analyzeImports` already walks every `<<<` import block once per document, resolving the target file, the selector's slice, and (via `sourceLinkDiagnostics.ts`'s `ClassifySourceLink`) whether a source link's git resolution would succeed. It never actually builds the URL, though -- `ClassifySourceLink` only answers `'ok' | 'no-repo' | 'no-remote' | 'no-branch'`, so today's hover for an auto-detected link shows the placeholder string `"auto-detected"` rather than a real URL. This change adds a CodeLens on the `<<<` line and, as a necessary side effect of that, actually computes the URL.

## Goals / Non-Goals

**Goals:**
- A `<<<` import line's CodeLens offers "Open imported file" (always, when the import resolved) and "Open source ↗" (whenever a URL actually resolves).
- Fix the existing hover to show the real resolved URL for auto-mode source links, replacing the placeholder string.
- Reuse the single existing per-import-block resolution pass in `analyzeImports` rather than re-deriving import/selector/source-link resolution in a parallel function.

**Non-Goals:**
- No CodeLens (or any other coverage) for a manual fence's own inline `// [!source url]` marker -- untouched ground, not extended here.
- No new diagnostic behavior -- the existing `no-branch` diagnostic is unchanged; this change only adds the ability to also retrieve the URL for the `ok` case.
- No change to where/how Slidev itself renders a source-link icon (title vs. bottom row) -- irrelevant to the editor-side CodeLens.

## Decisions

### Widen `ClassifySourceLink` into `ResolveSourceLink` (status + URL), rather than adding a parallel function
`makeClassifySourceLink` already calls `resolveRepoLinkInfoCached` internally -- the same call `buildGithubSourceLink` needs. Two injected functions that each privately re-derive the same git state would be exactly the kind of overlapping-responsibility duplication this codebase has otherwise avoided (see `serializeSnippetSelector` vs. `selectorFromSelection.ts`'s clean split by who-needs-what). `sourceLinkDiagnostics.ts`'s exported type becomes:
```ts
export type SourceLinkStatus = 'ok' | 'no-repo' | 'no-remote' | 'no-branch'
export type ResolveSourceLink = (absFilePath: string, selection: SourceLinkSelection, configuredBranch: string | null) => { status: SourceLinkStatus, url: string | null }
```
`makeResolveSourceLink` internally calls the theme's `buildGithubSourceLink` (which itself calls `resolveRepoLinkInfoCached`, so the repo-root cache is still hit once, not duplicated) to get the URL, and separately classifies status from the same `resolveRepoLinkInfoCached` result it already needs for the URL construction -- one function, one git round-trip, two facts returned.
- **Alternative considered**: keep `ClassifySourceLink` as-is and add a second `resolveSourceUrl` function. Rejected for the duplication reason above -- `resolveRepoLinkInfoCached`'s cache makes the *cost* of two calls negligible, but the *design* of two overlapping dependencies answering related questions about the same file is the actual problem being avoided.

### Fold lens data into `analyzeImports`'s existing return shape, not a parallel walk
`ImportAnalysis` gains a third field, e.g. `codeLensActions: { line: number, openFile: { absPath: string, startLine: number, endLine: number, isWholeFile: boolean }, openSourceUrl: string | null }[]`, populated in the same per-block loop that already computes `resolved`, `slice`, and `sourceMode` -- no second pass over `findImportBlocks`, no re-resolution of the same import.
- **Alternative considered**: a wholly separate `computeImportCodeLenses(text, resolveImport, resolveSourceLink)` function mirroring `analyzeImports`'s loop structure. Rejected -- it would re-run `resolveImport`/`resolveSnippetSelector`/source-mode detection a second time for every import block, for no benefit; `analyzeImports` already has everything a lens needs in scope at the point it currently pushes a hover.

### "Open imported file" always shows, with no selection when there's no selector
A whole-file import (`selector === null`) has no line range to reveal -- the CodeLens still opens the file, just without setting a specific selection/reveal range. This mirrors `resolveSnippetSelector`'s own `isWholeFile` concept already threaded through `useSourceLink.ts`'s `SourceLinkSelection`.

### CodeLens registration is a second provider on the `markdown` selector, gated the same way as decorations/hovers/diagnostics
Registered via `vscode.languages.registerCodeLensProvider('markdown', ...)`, filtered internally by `isRelevantDocument`. This is unrelated to the existing `{ pattern: '**/*' }` CodeLensProvider for `vscode-reference-index` (a different document selector, a different concern) -- CodeLens providers stack per VSCode's own model, so both coexist without conflict, the same reasoning already established for hover/diagnostic provider stacking with the official Slidev extension.

## Risks / Trade-offs

- **[Risk]** Widening `ClassifySourceLink` → `ResolveSourceLink` is a breaking rename at its two existing call sites (`importAnalysis.ts`'s diagnostic check, `extension.ts`'s wiring) → **Mitigation**: small, mechanical migration -- both call sites already have the `absFilePath`/`configuredBranch` in scope; only the destructured return shape changes.
- **[Risk]** "Open source ↗" needs a `SourceLinkSelection` (`{startLine, endLine, isWholeFile}`) that the existing diagnostic check never needed (it only cared about status) → **Mitigation**: this data (`slice.startLine`/`endLine`, `selector === null`) is already computed in the same loop for the hover text; no new resolution work, just passing it through.

## Migration Plan

Purely additive to an already-shipped, unpublished extension, aside from the internal `ClassifySourceLink` → `ResolveSourceLink` rename (no external consumers).
