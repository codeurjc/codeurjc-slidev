## Context

`vscode-marker-annotations` already diagnosed anchor-resolution problems (unresolved/ambiguous anchors, out-of-range occurrences) by reusing the theme's own `onWarn`/`onError` hooks. Two other conditions the theme's Vite transformer (`setup/transformers.ts`) already detects and warns about — a `<<<` import escaping the configured code root, and a source link with no resolvable branch — had no equivalent in the extension; they were silent unless you were watching the dev-server console.

## Goals / Non-Goals

**Goals:**
- Surface both conditions as real diagnostics, on the exact line, without duplicating the theme's own detection logic.
- Match the theme's actual severity model: a code-root escape is a warning that doesn't stop the file from being read/rendered (confirmed by reading `setup/transformers.ts`'s own handling, which warns and continues).
- Only diagnose the "found a repo and a GitHub remote but no branch" case for source links — not "no repo" or "non-GitHub remote", which are the theme's own intentional silent-no-link states.

**Non-Goals:**
- No change to the theme package's own grammar, warning text, or rendering behavior.
- No diagnostic for a manual (non-imported) fence's `[!source ...]` marker — that form has no file-backed git resolution to classify in the first place.

## Decisions

### Reuse `resolveRepoLinkInfoCached` directly, wrapped in a small classifier
`src/sourceLinkDiagnostics.ts`'s `makeClassifySourceLink` wraps the theme's `resolveRepoLinkInfoCached` (from `useSourceLink.ts`) rather than re-deriving repo/remote/branch resolution. It reuses the same injectable `GitRunner` the theme's own tests use, so this module is unit tested the same way (`useSourceLink.spec.ts`'s temp-repo-with-a-fake-git-runner pattern), without a real repo or network access.

### Fix import-path resolution to match the theme's actual `@/`-vs-relative convention
Computing an accurate code-root-escape check required first fixing a latent bug: `referenceIndex/scanner.ts`'s `makeResolveImportPath` treated every import as `@/`-prefixed, resolving even plain relative imports against the project root instead of the importing markdown file's own directory (the theme's real convention, confirmed in `setup/transformers.ts`'s own unexported `resolveImportPath` helper). The new `resolveImportAbsPath`/`resolveImportTarget` functions correct this for both the active-buffer diagnostics path and the reference-index scanner, which now share the same resolution logic.

### `escapesCodeRoot` is a field on the resolved import, not a resolution failure
`ResolvedImport` gained an `escapesCodeRoot: boolean` field rather than `ResolveImport` returning `null` for an escaping path — matching the theme's "still reads the file, just warns" behavior. `resolveImport` only returns `null` for an actual read failure.

### Frontmatter `codeSourceLinkBranch` read via a generalized helper
`themeGate.ts`'s frontmatter-parsing regex was generalized into `parseFrontmatterField(text, field)` (theme detection is now just `parseFrontmatterField(text, 'theme') === 'codeurjc-slidev-theme'`), reused by `importAnalysis.ts` to read a deck's `codeSourceLinkBranch` override the same way the theme's own frontmatter does.

## Risks / Trade-offs

- **[Risk]** The code-root-escape check now runs on every import in every relevant document, walking up the directory tree via `findProjectRoot` for each -- negligible in practice (single-digit imports per slide deck, cached per-document recompute only on edit).
- **[Risk]** `makeClassifySourceLink` calls out to real `git` subprocesses (via `resolveRepoLinkInfoCached`, which the theme itself caches per resolved repo root for the process lifetime) -- acceptable since it's the same caching the theme's own dev-server render path already relies on.

## Migration Plan

Purely additive to an already-shipped, unpublished extension -- no migration needed.
