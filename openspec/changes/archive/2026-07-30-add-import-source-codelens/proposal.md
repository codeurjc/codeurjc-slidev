## Why

Confirming what a `<<<` import resolves to, or what URL a `[!source ...]` directive (or the implicit auto-detection with no directive at all) will actually link to, currently requires running the Slidev dev server — the extension's own hover today only ever shows the literal string `"auto-detected"` for the common case, never the real computed URL, since nothing in the extension currently calls the theme's `buildGithubSourceLink`. A clickable CodeLens on the `<<<` import line would let an author open the imported file, or open the resolved source link, directly from the editor.

## What Changes

- A `<<<` import line gains a CodeLens row with two actions: **"Open imported file"** (opens `targetAbsPath`, revealing the resolved selector's line range when there is one) and **"Open source ↗"** (opens the resolved source-link URL in the browser) — the latter present whenever a URL actually resolves: always for an explicit `[!source <url>]` override, and for auto mode (implicit or `[!source]`/`[!source bottom]`) whenever `resolveSourceLink` reports `ok`. No lens for `[!source none]`, and none for auto mode when no URL resolves (`no-repo`/`no-remote`, silently, matching the theme's own degrade behavior — `no-branch` continues to be a diagnostic, not a lens).
- `sourceLinkDiagnostics.ts`'s `ClassifySourceLink` is widened into `ResolveSourceLink`, returning both the status and (when resolvable) the actual URL — internally calling the theme's `buildGithubSourceLink`, which already wraps the same `resolveRepoLinkInfoCached` call the status classification uses. Replaces the narrower classifier at both of its existing call sites.
- The existing hover for an auto-mode `[!source ...]` line is fixed to show the real resolved URL (or the reason it's absent) instead of the placeholder string `"auto-detected"` — a natural side effect of computing the URL for the CodeLens, not separate scope.
- **Out of scope**: a manual (hand-typed) fence's own inline `// [!source url]` marker gets no CodeLens in this change — that code path (`isInlineSourceMarkerLine`/`extractInlineSourceLink` in the theme) has no hover/diagnostic coverage in the extension at all today, and bringing it in is new ground, not an extension of this change's scope.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `vscode-marker-annotations`: gains a CodeLens requirement for `<<<` import lines, and the existing anchor/directive-preview hover requirement is corrected to show a real resolved source-link URL instead of a placeholder string.

## Impact

- **Affected code**: `packages/vscode-codeurjc-slidev/src/sourceLinkDiagnostics.ts` (widened `ClassifySourceLink` → `ResolveSourceLink`, now calling the theme's `buildGithubSourceLink`), `src/importAnalysis.ts` (hover fix, and/or new lens-data output reusing the existing per-import-block resolution loop rather than re-deriving it), `src/extension.ts` (registers a `CodeLensProvider` for `<<<` import lines; updates the `ResolveSourceLink` wiring at its existing call site).
- **No changes** to the theme package, to `vscode-reference-index`, or to any rendering behavior.
