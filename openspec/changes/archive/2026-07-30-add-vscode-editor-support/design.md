## Context

The theme's custom `slides.md` grammar (inline `// [!mark]` markers, `<<<` snippet imports with `[!mark:...]` anchor lines, `[!source ...]` directives) is currently only observable by running the Slidev dev server. The parsing/resolution logic already lives in three composables designed to be reusable outside Vue/Vite:

- `useCodeHighlights.ts` — marker/anchor parsing, explicitly "no Vue or DOM dependency"
- `useSnippetImport.ts` — `<<<` selector parsing/resolution, same constraint
- `useSourceLink.ts` — GitHub source-link resolution, with git access injected via a `GitRunner` type specifically so it's usable outside a real repo/dev-server context

This change adds `packages/vscode-codeurjc-slidev/`, a VSCode extension consuming these directly, in the existing pnpm workspace alongside `codeurjc-slidev-theme` and `create-codeurjc-slidev`.

## Goals / Non-Goals

**Goals:**
- Reuse the theme's existing parsing/resolution functions verbatim — never reimplement or fork the grammar.
- Preview, inside the editor, what a marker/anchor/directive resolves to without running Slidev.
- Surface resolution failures (unresolved anchors, ambiguous matches, out-of-range selectors) as first-class diagnostics instead of dev-server-console-only warnings.
- Show reverse references ("this line is used by slide N") in `code/` files opened on their own — something the official Slidev extension cannot do since it has no notion of this theme's grammar.
- Coexist cleanly with the official Slidev VSCode extension and any language extension already active on the same files.

**Non-Goals:**
- No new markdown language/grammar registration (would risk conflicting with the official Slidev extension's own markdown handling) — all output goes through Decorations, Hover, Diagnostics, and CodeLens providers, which stack additively with other extensions.
- No editing/authoring assistance (autocomplete, code actions, snippet insertion) in this change — tracked as clearly separable follow-up if wanted.
- No changes to the theme package's rendering, grammar, or public composable APIs.
- No support for non-GitHub source-link providers beyond what `useSourceLink.ts` already resolves.

## Decisions

### Reuse composables via workspace dependency, not a published-package version pin
`codeurjc-slidev-theme`'s `package.json` has no `exports` map restricting subpath resolution, ships `.ts` files unbuilt (the existing no-build Slidev-theme convention), and excludes only `composables/__tests__`. The extension takes a `workspace:*` dependency and imports composables by path (e.g. `codeurjc-slidev-theme/composables/useCodeHighlights`), bundled via esbuild the same way most VSCode extensions already bundle their dependencies.
- **Alternative considered**: depend on the published npm package. Rejected — would require a publish-and-bump cycle to pick up any grammar change, reintroducing exactly the drift risk direct reuse avoids, and this repo already treats the workspace as the source of truth for the theme during development.

### Split into two capabilities, not one
`vscode-marker-annotations` (single-document, active-buffer) and `vscode-reference-index` (workspace-wide, cross-file) are different mechanisms with different costs — one is a per-document parse, the other is a workspace index with invalidation rules. Keeping them separate specs lets the reference index ship or iterate independently of the active-buffer feature.

### Theme-detection gate via frontmatter, not file path or content sniffing
Activation checks a document's YAML frontmatter for `theme: codeurjc-slidev-theme` before running any parsing. This is the same signal Slidev itself uses to load the theme, is cheap to check (frontmatter is always the first lines of the file), and avoids false-positive activation on unrelated markdown in the same workspace (e.g. this repo's own README/DEVELOPMENT/ROADMAP docs).

### Reference index built from the same slice-relative coordinates the renderer uses
`resolveSnippetSelector` already reports the resolved 1-based real-file line numbers a slice came from; `parseExternalHighlightAnchors` reports highlight positions relative to that slice. The index composes these two (`absoluteLine = sliceStartLine + highlight.startLine`) rather than re-deriving line numbers independently, so the index can never disagree with what the theme actually renders.

### Index invalidation mirrors the dev-server's own "always re-resolve" behavior, not incremental line-tracking
Line-based anchor forms (`[!mark:N]`, `[N-M]` selectors) are inherently fragile to edits elsewhere in a target file — but the dev server already has this property, since it re-resolves on every render rather than caching. The extension re-runs resolution against current file content on relevant document-change events rather than attempting to track line-shift deltas itself, keeping its behavior consistent with what the audience will actually see rendered. Content-anchor forms (`"a".."b"`) are self-healing by construction and need no special-casing.
- **Alternative considered**: incrementally adjust cached line numbers on every edit using VSCode's `TextDocumentContentChangeEvent` deltas. Rejected as unnecessary complexity — full re-resolution against current content is cheap (single-file parse) and already matches the theme's own semantics.

### Test layering: pure logic in vitest, provider wiring against fake documents, extension host only for smoke coverage
Three layers, increasing in cost:
1. **Vitest, no `vscode` import** — offset-translation (fence-relative → document line, slice-relative → absolute target line), the frontmatter activation gate, and the reference-index builder (pure function over an in-memory `{path: text}` map, no real fs). This is where the actual risk concentrates (coordinate-system math), and it's the cheapest layer to test exhaustively — same shape as this repo's existing `composables/__tests__`.
2. **Provider functions against fake documents** — hover/decoration/CodeLens provider functions called directly with a minimal object shaped like `vscode.TextDocument`; `vscode.Range`/`vscode.Position` are plain classes usable outside a real extension host.
3. **`@vscode/test-electron`** — a thin smoke-test layer only: does the extension activate on a fixture workspace, do providers register, do decorations/CodeLens actually render end-to-end for one fixture. Not where grammar edge cases get re-enumerated.
- **Alternative considered**: rely primarily on `@vscode/test-electron` for all coverage. Rejected — it launches a real downloaded VSCode build in Electron (headless via Xvfb on Linux CI), a materially heavier CI dependency than this repo's existing vitest+jsdom/Playwright+Chromium stack, and most of the risk doesn't actually require a real host to catch.

## Risks / Trade-offs

- **[Risk]** A third publishable package adds a new release process (VSCode Marketplace via `vsce publish`, distinct credential/2FA flow from npm) → **Mitigation**: document it alongside the existing publish steps in CLAUDE.md when this ships; no need to solve it before implementation.
- **[Risk]** `@vscode/test-electron` is a new, heavier CI dependency → **Mitigation**: keep it to a small, explicit smoke-test suite (`test:extension`, not part of default `pnpm test`), per the test-layering decision above.
- **[Risk]** Reference-index CodeLens could get noisy on files with many references or in large workspaces with many decks → **Mitigation**: out of scope for this change to optimize; first implementation just needs correctness, not scale-tuning, since the theme's own use (per-consumer single deck) is small.
- **[Risk]** Importing theme composables via deep path (no `exports` map) is implicit contract, not an explicit public API → **Mitigation**: acceptable within this monorepo where both packages are developed and versioned together; if theme's `package.json` later adds an `exports` map, this dependency must be updated in lockstep.

## Migration Plan

Purely additive — no existing behavior changes, no migration needed for current theme consumers. Rollback is simply not installing/publishing the extension package.

## Open Questions

- Should the extension eventually gain authoring assistance (autocomplete for `<<<` paths, quick-fix to insert `[!mark]`/`[!source]`) — explicitly deferred out of this change's scope, but worth a follow-up proposal once the read-only annotation features are validated with real usage.
- Exact CodeLens/hover copy and icon choices are left to implementation; not a requirements-level concern.
