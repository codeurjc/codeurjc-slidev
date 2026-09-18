# CodeURJC Slidev Theme Support

A VSCode extension that previews [`codeurjc-slidev-theme`](../codeurjc-slidev-theme)'s custom `slides.md` grammar directly in the editor, without running the Slidev dev server. It only activates for markdown files whose frontmatter declares `theme: codeurjc-slidev-theme` — everything else is left untouched.

## What it does

- **Marker preview** — inside a manual fenced code block, `// [!mark] comment` / `# [!mark] comment` markers (and their `:start`/`:end` range and `(<start>-<end>)` substring forms) are dimmed in the buffer (since they're stripped from the rendered slide) while the code they highlight is boxed, so you can see what the audience will see without building the deck.
- **Click step badges** — every line whose highlight appears on a click shows a small `▸N of M` badge after its end: a marker with a `{N}` step (a `:start`/`:end` range on its start line), a `[!mark:...{N}]` anchor line, and each segment after the first of Slidev's own `{1|3}` fence line ranges. M is the slide's total number of clicks, counted from the slide's markdown the way Slidev counts them (`v-click`, `v-after`, `<v-clicks>` lists, `{at: …}` options, frontmatter `clicks:`, …). Several steps on one line read `▸1,3 of 3`. Hovering a stepped marker or anchor line says at which click it appears.
  - When a slide has something whose clicks can't be counted from the text (a custom component, a bound `v-click` value, magic-move, MDC `{v-click}` attributes, KaTeX line ranges), the total is left out, and so are range badges whose click depends on it; the hover names what's in the way.
  - Setting **`codeurjcSlidev.stepBadges.showTotal`** (default `true`) turns the "of M" part off, in badges and in the reverse-reference CodeLens.
- **Anchor/source hovers** — hovering a `[!mark:...]` anchor line or a `[!source ...]` directive line (the ones following a `<<<` snippet import) shows what it resolves to: the target file, the matched line, the anchor's comment, or the source-link URL that will be used.
- **Diagnostics** — surfaces as real editor diagnostics on the offending line what would otherwise only be a Vite dev-server console warning: an anchor whose text can't be found, an ambiguous anchor with no `#N` occurrence selector, an out-of-range `#N`, a `<<<` import resolving outside the configured code root, and a source link that can't resolve a git branch (found a repo and a GitHub remote, but no configured `codeSourceLinkBranch` and no resolvable default branch either).
- **Reverse references** — open a file under `code/` on its own (not through `slides.md`) and, if any `<<<` import anywhere in the workspace references a line in it, a CodeLens appears above that line (e.g. "📽 2 references — Slide 3 ▸2 of 3, Slide 12", with the click step of a stepped anchor). Clicking it jumps back to the slide; with more than one reference it prompts you to pick which one.
- **Path completion** — typing `<<< @/` in a theme-tagged `slides.md` offers file/folder completions rooted at the configured code root, narrowing as you type further path segments.
- **Copy/paste a selector** — select some lines (in any file) and run **"CodeURJC Slidev: Copy Selector for Selection"** to copy a `[N-M]` or `["first line".."last line"]` selector for that selection to the clipboard (preferring the content-anchor form when it's safe — both boundary lines non-blank and unique in the file — since that form survives later edits elsewhere in the file). Then, with the cursor on an existing `<<<` import line, run **"CodeURJC Slidev: Paste Selector into Import"** to splice the copied selector into that line's bracket.
- **Import CodeLens** — a `<<<` import line shows "Open imported file" (jumps straight to the resolved file, revealing its resolved line range) and, whenever a source-link URL actually resolves, "Open source ↗" (opens it in the browser) — the same real resolution the hover uses, not a placeholder.

See the root [`AGENTS.md`](../../AGENTS.md#vscode-editor-support) for the extension's internal architecture.

## Status

This extension is **not yet published** to the VSCode Marketplace. For now it can only be run locally, in development mode, as described below.

## Running it locally

1. From the repo root: `pnpm install`
2. Open the repo root in VSCode and press **F5** (Run and Debug view), picking one of:
   - **VS Code extension: this repo's deck** — opens this repo in an **Extension Development Host** window with the extension loaded. It opens it through `.vscode/extension-dev.code-workspace` rather than as a folder: VS Code won't open a folder that's already open in another window, and switches to that window instead
   - **VS Code extension: test fixture deck** — opens `test-extension/fixture/`, a small deck with an import, click steps and a geometry entry that matches nothing
3. Edit the extension: the `vscode-extension: watch` task the launch started rebuilds on every save (errors land in the Problems panel). Restart the host (`Ctrl+Shift+F5`) to load the new build.

(Opening this package folder on its own still works: its own `.vscode/launch.json` builds once and opens an empty host window.)

### Installing a built copy into your own VSCode

To use the current source in your everyday VSCode rather than the throwaway host, run the task **vscode-extension: install into VS Code** (Terminal → Run Task), then **Developer: Reload Window**. From a terminal, the same thing is:

```sh
cd packages/vscode-codeurjc-slidev
pnpm run install-local   # production build → vscode-codeurjc-slidev.vsix → code --install-extension
```

`pnpm run vsix` stops after writing the `.vsix`. `vsce` is fetched with `pnpm dlx` (its publishing dependencies are large, so it isn't a devDependency). Under Remote-WSL, run it from VSCode's own terminal or the task, so `code` installs into the WSL side where the extension runs.
