# CodeURJC Slidev Theme Support

A VSCode extension that previews [`codeurjc-slidev-theme`](../codeurjc-slidev-theme)'s custom `slides.md` grammar directly in the editor, without running the Slidev dev server. It only activates for markdown files whose frontmatter declares `theme: codeurjc-slidev-theme` — everything else is left untouched.

## What it does

- **Marker preview** — inside a manual fenced code block, `// [!mark] comment` / `# [!mark] comment` markers (and their `:start`/`:end` range and `(<start>-<end>)` substring forms) are dimmed in the buffer (since they're stripped from the rendered slide) while the code they highlight is boxed, so you can see what the audience will see without building the deck.
- **Anchor/source hovers** — hovering a `[!mark:...]` anchor line or a `[!source ...]` directive line (the ones following a `<<<` snippet import) shows what it resolves to: the target file, the matched line, the anchor's comment, or the source-link URL that will be used.
- **Diagnostics** — an anchor whose text can't be found, an ambiguous anchor with no `#N` occurrence selector, or an out-of-range `#N` all show up as real editor diagnostics on the offending line, instead of only a Vite dev-server console warning.
- **Reverse references** — open a file under `code/` on its own (not through `slides.md`) and, if any `<<<` import anywhere in the workspace references a line in it, a CodeLens appears above that line (e.g. "📽 2 references — Slide 3, Slide 12"). Clicking it jumps back to the slide; with more than one reference it prompts you to pick which one.

See the root [`AGENTS.md`](../../AGENTS.md#vscode-editor-support) for the extension's internal architecture.

## Status

This extension is **not yet published** to the VSCode Marketplace. For now it can only be run locally, in development mode, as described below.

## Running it locally

1. From the repo root: `pnpm install`
2. Open `packages/vscode-codeurjc-slidev/` as a folder in VSCode (a dedicated window, not the whole monorepo — the `.vscode/launch.json` in this folder assumes it's the workspace root)
3. Press **F5** (or Run → Start Debugging). This runs the `compile` build task, then launches a new **Extension Development Host** window with this extension loaded.
4. In that new window, open a folder containing a `slides.md` with `theme: codeurjc-slidev-theme` in its frontmatter — for example, this repo's own root, or its `e2e/` folder — and open that `slides.md` to see the decorations/hovers/diagnostics, or open one of its `code/` files directly to see reference CodeLenses.

Changes to the extension's source are picked up by re-running the build (the launch config's `watch` task, or just pressing F5 again) and reloading the Extension Development Host window (`Cmd/Ctrl+R` inside it, or the "Developer: Reload Window" command).

### Installing a built copy without the Marketplace

To try a built copy in your own everyday VSCode (not just the throwaway Extension Development Host):

```sh
cd packages/vscode-codeurjc-slidev
npx vsce package
```

This produces a `.vsix` file in this directory. In VSCode, open the Extensions view → `...` menu → **Install from VSIX...** and pick it.
