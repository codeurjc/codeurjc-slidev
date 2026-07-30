## 1. Import-path resolution fix

- [x] 1.1 Add `resolveImportAbsPath` to `referenceIndex/scanner.ts`, mirroring the theme's own `@/`-vs-relative import resolution convention
- [x] 1.2 Add `resolveImportTarget` (path + `escapesCodeRoot` boolean), and rewire `makeResolveImportPath` to use it
- [x] 1.3 Unit test both against `@/`-prefixed and plain relative import paths, and the code-root-escape case

## 2. Code-root escape diagnostic

- [x] 2.1 Add `escapesCodeRoot` to `ResolvedImport` in `importAnalysis.ts`
- [x] 2.2 Wire `extension.ts`'s `createFsResolveImport` to compute it via `resolveImportTarget`, still reading/returning the file when it escapes
- [x] 2.3 Emit a warning diagnostic on the import line when `escapesCodeRoot` is true, without short-circuiting the rest of that import's analysis
- [x] 2.4 Unit test: escaping import still produces a hover, plus the diagnostic

## 3. Missing-default-branch diagnostic

- [x] 3.1 Generalize `themeGate.ts`'s frontmatter regex into `parseFrontmatterField(text, field)`; reuse it for both theme detection and `codeSourceLinkBranch`
- [x] 3.2 Add `src/sourceLinkDiagnostics.ts` (`makeClassifySourceLink`), wrapping the theme's `resolveRepoLinkInfoCached` with an injectable `GitRunner`
- [x] 3.3 Thread a `ClassifySourceLink` param through `analyzeImports`, defaulting to an always-`'ok'` no-op so existing callers/tests are unaffected
- [x] 3.4 Diagnose only the `'no-branch'` classification, for `[!source]` auto mode (implicit or explicit), attached to the directive line if present else the import line
- [x] 3.5 Unit test all four classifications (`ok`/`no-repo`/`no-remote`/`no-branch`) against a real temp git repo with a fake `GitRunner`, plus the `analyzeImports` wiring (auto/url/none modes, frontmatter branch override, no diagnostic for no-repo/no-remote)

## 4. Wiring + verification

- [x] 4.1 Wire `classifySourceLink` (real `GitRunner`) into `extension.ts`'s diagnostic refresh path
- [x] 4.2 Update root `README.md`, the package's own `README.md`, and `AGENTS.md`'s architecture notes to describe the two new diagnostics
- [x] 4.3 Full verification: `tsc --noEmit`, `pnpm test` (theme + extension packages), extension-host smoke tests under `xvfb-run`
