## Why

Authoring this theme's custom `slides.md` syntax — inline `// [!mark]` markers, `<<<` snippet imports with `[!mark:...]` anchor lines, `[!source ...]` directives — is currently blind until the Slidev dev server renders it: an author can't tell what a marker highlights, whether a content anchor resolves, or which slides reference a given line of `code/` without switching to a browser tab. The official Slidev VSCode extension has no notion of this theme's grammar and structurally cannot add it. This repo's own composables (`useCodeHighlights.ts`, `useSnippetImport.ts`, `useSourceLink.ts`) are already pure, Node-runnable, DOM-free functions built for exactly this kind of reuse — a VSCode extension can consume them directly instead of reimplementing the grammar.

## What Changes

- New `packages/vscode-codeurjc-slidev/` extension package added to the pnpm workspace, depending on `codeurjc-slidev-theme` via `workspace:*` and importing its composables directly (no grammar reimplementation).
- Extension activates only for markdown files whose frontmatter declares `theme: codeurjc-slidev-theme`, so it stays inert for unrelated markdown.
- **Active-buffer support**: in the open `slides.md`, marker/anchor/directive lines are dimmed to preview what the audience will *not* see; highlighted spans are decorated; hovering a marker or anchor shows its resolved comment/target; an anchor or selector that fails to resolve is reported as a real diagnostic (reusing the `onWarn`/`onError` hooks `parseExternalHighlightAnchors` already exposes) instead of only a dev-server console warning.
- **Reverse reference index**: the extension scans the workspace's theme-tagged `.md` files, resolves every `<<<` import's anchors against their target files, and shows a CodeLens (e.g. "📽 2 references — Slide 3, Slide 12") above referenced lines when a `code/` file is opened directly, with click-through navigation back to the slide.
- No changes to the theme package's rendering behavior or grammar — this is purely additive tooling that reads the same syntax.

## Capabilities

### New Capabilities
- `vscode-marker-annotations`: Active-buffer decorations, hovers, and diagnostics for this theme's marker/anchor/source-directive grammar inside an open `slides.md`, including the theme-detection activation gate.
- `vscode-reference-index`: Workspace-wide index of `<<<` import anchors resolved against their target files, surfaced as CodeLens/navigation in `code/` files opened on their own.

### Modified Capabilities
(none — no existing spec's requirements change; this only adds a new consumer of the existing grammar)

## Impact

- **Affected code**: new `packages/vscode-codeurjc-slidev/` package; `pnpm-workspace.yaml` gains an entry; root `package.json` may gain a `test:extension` script alongside existing `test`/`test:e2e`.
- **Dependencies**: new devDependency on `@vscode/test-electron` (or equivalent) for the extension-host smoke-test layer; runtime dependency on `codeurjc-slidev-theme`'s composables via `workspace:*`.
- **Publishing**: adds a third publishable package (VSCode Marketplace via `vsce publish`), alongside the existing npm-published theme and CLI packages — a distinct credential/2FA flow from npm's.
- **No impact** to `slides.md` grammar, theme rendering, or existing composables' public behavior — they are consumed read-only.
