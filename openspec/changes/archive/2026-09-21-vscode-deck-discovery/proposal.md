## Why

The Slidev VS Code extension (`antfu.slidev`) only treats a markdown file as a slides entry when it matches `slidev.include`, whose default is `**/slides.md`. A project created with `create-codeurjc-slidev` can hold several decks named `<slug>.md` (multi-deck projects), so none of them is detected and the Slidev sidebar, preview and slide tree stay empty. The extension also offers no way to read which entry is active, so a user with several decks gets no hint about how to switch.

## What Changes

- The scaffolder writes `.vscode/extensions.json` into every project it creates or adds to, recommending this repo's extension (whose `extensionPack` pulls in `antfu.slidev`) and `antfu.slidev` itself. An existing `extensions.json` is merged into, never replaced, and is also ensured in an already-scaffolded project when a deck is added to it.
- The comparison deck the ODP importer generates carries a `comparisonDeck: true` key in its headmatter, so tooling can tell a comparison deck from a presentable one without relying on file names.
- The VS Code extension discovers a workspace folder's decks: markdown files whose headmatter declares `theme: codeurjc-slidev-theme`, minus comparison decks. When some are missing from `slidev.include`, it offers once per set of decks to register them, writing an ordered list of literal paths, relative to the workspace folder that contains each deck, into `slidev.include` at Workspace scope. (`slidev.include` is a window-scoped setting, which VS Code ignores in a folder's `.vscode/settings.json` in a multi-root workspace, so Workspace scope is the only one that works everywhere.)
- The list is ordered so the default active deck comes first: the deck the user last edited, tracked by our extension, else alphabetical. A choice the Slidev extension already remembers still wins.
- The first time the user opens a deck in a project with two or more decks, our extension shows a notification saying the Slidev preview follows one deck at a time, with a **Choose deck…** button (runs `slidev.choose-entry`), a pointer to the Slidev sidebar's Projects view, and **Don't show again**. It is shown at most once per workspace.

## Capabilities

### New Capabilities

- `vscode-deck-discovery`: finding a workspace's theme decks, registering them with the Slidev extension in a deterministic default order, and the multi-deck tip notification.

### Modified Capabilities

- `project-scaffolding`: a scaffolded or extended project includes `.vscode/extensions.json` with the extension recommendation.
- `odp-comparison-deck`: the generated comparison deck's headmatter carries the `comparisonDeck: true` marker.

`multi-deck-projects` needs no requirement change: `.vscode/extensions.json` is a shared root-level file, so the existing rule that adding a deck touches only that deck's files still holds. The design covers how it is written.

## Impact

- `packages/create-codeurjc-slidev/`: `template/` gains `.vscode/extensions.json`; `index.mjs` merges into an existing one; `src/odp/comparison.ts` emits the marker.
- `packages/vscode-codeurjc-slidev/`: new pure modules for deck discovery, `include` planning and tip gating; a thin adapter section in `src/extension.ts`; a `codeurjcSlidev` setting or two for opting out. Extension-host smoke tests gain a fixture with several decks.
- Depends on the public surface of `antfu.slidev` only: the `slidev.include` and `slidev.exclude` settings and the `slidev.choose-entry` command. The active entry cannot be read, so the tip wording is generic.
- Existing projects whose comparison decks were generated before this change lack the marker; they are recognised by the `*-comparison.md` / `comparison.md` name as a fallback.
