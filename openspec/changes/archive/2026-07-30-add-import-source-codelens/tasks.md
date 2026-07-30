## 1. Widen source-link resolution

- [x] 1.1 In `sourceLinkDiagnostics.ts`, replace `SourceLinkStatus`-only `ClassifySourceLink` with `ResolveSourceLink`, returning `{ status, url }`, internally calling the theme's `buildGithubSourceLink` (import `SourceLinkSelection` alongside it)
- [x] 1.2 Update `makeClassifySourceLink` → `makeResolveSourceLink`, still backed by an injectable `GitRunner`
- [x] 1.3 Update unit tests (temp-repo + fake `GitRunner` pattern already established) to assert both `status` and `url` for each of the four classifications, plus a configured-branch-override case

## 2. Thread URL resolution + lens data through `analyzeImports`

- [x] 2.1 Update `importAnalysis.ts`'s `analyzeImports` signature to accept `ResolveSourceLink` in place of `ClassifySourceLink`
- [x] 2.2 Fix the auto-mode `[!source ...]` hover to show the real resolved URL (or an explicit "no link resolves" message) instead of the placeholder `"auto-detected"` string
- [x] 2.3 Add a `codeLensActions` field to `ImportAnalysis`'s return shape, populated in the same per-import-block loop (no second walk): `{ line, openFile: { absPath, startLine, endLine, isWholeFile }, openSourceUrl: string | null }`
- [x] 2.4 Unit test: explicit `[!source <url>]` override produces that URL with no git call needed; auto mode with a resolving link produces the real URL; `[!source none]` produces `openSourceUrl: null`; auto mode with `no-repo`/`no-remote` produces `openSourceUrl: null` with no diagnostic; auto mode with `no-branch` produces `openSourceUrl: null` alongside the existing diagnostic; whole-file import (`selector: null`) produces `isWholeFile: true` with no line range

## 3. CodeLens provider wiring

- [x] 3.1 Register a `CodeLensProvider` for `markdown`, gated by the existing `isRelevantDocument` check, producing lenses from `codeLensActions`
- [x] 3.2 "Open imported file" command: open `absPath`, revealing/selecting `startLine`-`endLine` when `!isWholeFile`, no selection when `isWholeFile`
- [x] 3.3 "Open source ↗" command: `vscode.env.openExternal` on `openSourceUrl` (lens omitted entirely when null)
- [x] 3.4 Wire the real `makeResolveSourceLink()` (real `GitRunner`) into `extension.ts`'s existing `analyzeImports` call sites

## 4. Extension-host smoke test

- [x] 4.1 Extend the fixture with a `.git` directory plus a fake/real GitHub `origin` remote (new setup requirement -- no prior smoke test needed a real git repo) so an auto-mode source link actually resolves
- [x] 4.2 Smoke test: `vscode.executeCodeLensProvider` on the fixture's `<<<` import line returns both "Open imported file" and "Open source ↗" lenses

## 5. Documentation

- [x] 5.1 Update the package's own `README.md`, root `README.md`, and `AGENTS.md`'s architecture notes to describe the CodeLens and the `ResolveSourceLink` rename
