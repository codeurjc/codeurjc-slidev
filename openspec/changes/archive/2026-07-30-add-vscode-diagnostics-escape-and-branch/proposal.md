## Why

`vscode-marker-annotations`'s diagnostics requirement only covered anchor-resolution failures (unresolved/ambiguous anchors, out-of-range occurrences). Two other conditions the theme itself only ever logs to the Vite dev-server console — a `<<<` import resolving outside the configured code root, and a source link with no resolvable git branch — were left as silent console-only warnings in the extension too, even though they're exactly the kind of authoring mistake this extension exists to surface early.

Note: this change is written up retroactively — the implementation already shipped directly (in response to a follow-up request) without going through the OpenSpec proposal flow first. This change exists to bring the spec back in sync with what was actually built, not to plan new work.

## What Changes

- `vscode-marker-annotations`'s diagnostics requirement gains two more conditions, both attached to the exact offending line:
  - A `<<<` import whose file path resolves outside the configured code root now gets a warning diagnostic on the import line — the import is still read/analyzed (an escape is a warning, not a hard failure, matching the theme's own rendering behavior).
  - A `<<<` import's source link (implicit or explicit `[!source]` auto mode) that finds a git repo and a GitHub `origin` remote but can't resolve a branch (no `codeSourceLinkBranch` frontmatter override, no local/remote default branch) now gets a warning diagnostic on the `[!source]` line if present, else the import line. A missing repo or a non-GitHub remote are NOT diagnosed — those are the theme's own intentional, silent "no link" states.
- Fixes a latent bug in the import-path resolution used for this: non-`@/`-prefixed relative imports were being resolved against the project root instead of the importing markdown file's own directory (the theme's actual convention). Both the active-buffer diagnostics path and the reference-index scanner now share the corrected resolution logic.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `vscode-marker-annotations`: the "Diagnostics for unresolved markers and anchors" requirement gains two new scenarios (code-root escape, missing default branch), and is renamed in scope to cover import-resolution/source-link diagnostics generally, not just anchor resolution.

## Impact

- **Affected code**: `packages/vscode-codeurjc-slidev/src/importAnalysis.ts` (new diagnostics, `ResolvedImport.escapesCodeRoot`, `ClassifySourceLink` param, frontmatter `codeSourceLinkBranch` read), new `src/sourceLinkDiagnostics.ts` (wraps the theme's `resolveRepoLinkInfoCached` to classify why a source link doesn't resolve), `src/referenceIndex/scanner.ts` (new `resolveImportAbsPath`/`resolveImportTarget`, fixing the relative-import-path resolution bug), `src/extension.ts` (wiring), `src/themeGate.ts` (generalized `parseFrontmatterField`, reused for `codeSourceLinkBranch`).
- **No changes** to the theme package itself, to the `vscode-reference-index` capability, or to any other existing capability's requirements.
