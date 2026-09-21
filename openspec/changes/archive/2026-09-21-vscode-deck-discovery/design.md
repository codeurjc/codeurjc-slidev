## Context

`antfu.slidev` registers slides entries from `slidev.include` (default `["**/slides.md"]`) minus `slidev.exclude`, watches both settings and rescans when they change, and picks the active entry as: (1) the entry remembered in its private `workspaceState`; (2) a file named `slides.md` with the fewest path separators; (3) otherwise the entry with the fewest separators, ties going to the first in `include` order. It exports no API and its active entry cannot be read. Its only public surface is those two settings and commands such as `slidev.choose-entry`.

Multi-deck projects (`<slug>.md`) therefore register nothing. Our extension already has the pieces to find decks (`findMarkdownFiles`, `usesCodeurjcSlidevTheme`, `findProjectRoot` in `referenceIndex/scanner.ts` and `themeGate.ts`) and is active on `onStartupFinished`.

`slidev.include` is a **window**-scoped setting. VS Code ignores window-scoped settings in a folder's `.vscode/settings.json` in a multi-root workspace and only honours them at User or Workspace scope. A settings file shipped in a project is also read only when the project folder is itself a workspace folder, which is not the case when it is nested (`projects/AIS/` in a monorepo).

## Goals / Non-Goals

**Goals:**
- Decks are registered without the user touching `slidev.include`, wherever the project sits in the workspace.
- A sensible, deterministic default deck.
- A one-time hint about switching decks.

**Non-Goals:**
- Reading, or forcing, the Slidev extension's active entry. `slidev.set-as-active` takes an internal tree-item object; calling it with a fabricated one would break silently on an upgrade.
- Changing the theme, the preview, or how the Slidev extension previews a deck.
- Shipping `.vscode/settings.json` from the scaffolder.

## Decisions

**1. Detection and registration live in our extension, not in the scaffolder.** The scaffolder can only write a settings file inside the project, which works when the project is the workspace root and is invisible otherwise. It would also need to merge into a user-edited JSONC file every time a deck is added. The extension works for nested projects and for projects not made by the CLI, and re-scans as decks come and go. *Alternative considered:* a static `settings.json` with `include: ["*.md"]` and an `exclude` for the README and comparison decks. Rejected for the nesting problem above.

**2. The scaffolder's part is `.vscode/extensions.json` and the comparison marker.** The recommendation gets both `codeurjc.vscode-codeurjc-slidev` and `antfu.slidev`: the pack already installs the latter, but naming it covers a machine where ours is not yet installable. Merging follows the same "add only what is missing, never disturb" rule the per-deck handling uses; the file is parsed as JSONC and left alone when unparseable. The step runs for a recognized project too (older projects gain the file), since the template copy is skipped there. `comparisonDeck: true` in the comparison deck's headmatter lets the extension exclude comparison decks by content rather than by name; the name (`comparison.md`, `*-comparison.md`) stays as a fallback for decks generated before the marker.

**3. Registration writes at Workspace scope, always, and asks first.** Given the scope constraint above there is no per-folder alternative for a window setting. Paths are relative to the workspace folder containing the deck (the form the Slidev extension itself writes from `slidev.add-entry`), literal, with `*?[]{}` escaped by wrapping each in a character class (VS Code's glob syntax has no backslash escape). Existing entries are kept after ours. Silent writes to a user's settings are avoided: the user accepts a notification with **Register** and **Not now**, and the declined set (the sorted missing paths, joined) is remembered in `workspaceState` so the same set is not re-offered. *Alternative considered:* registering silently. Rejected: settings changes should be visible.

**4. "Already registered" is asked of VS Code, not reimplemented.** For each pattern in `slidev.include`, `workspace.findFiles(pattern, slidev.exclude)` gives the set the Slidev extension will resolve, using the same matcher, so no glob library is bundled and behaviour cannot drift from it.

**5. Default deck = order in `include`.** Ties in the Slidev extension's fewest-separators rule go to the first entry, so writing the last-edited deck first makes it the default when the user has no remembered choice. "Last edited" is a text change to a deck, recorded per workspace in `workspaceState` by an `onDidChangeTextDocument` listener (cheap: it only stores a path). Without one, alphabetical by path. A remembered choice in the Slidev extension still wins, which is the desired behaviour for returning users.

**6. The tip is triggered by opening a deck, once per workspace, and is deliberately generic.** It fires from `onDidChangeActiveTextEditor` (and once for the editor active at startup) when the document is a deck whose project holds two or more decks. Because the active entry cannot be read, the message never names one; it points to the Slidev sidebar's Projects view, offers **Choose deck…** (`slidev.choose-entry`) and **Don't show again**. The "shown" flag is stored when the tip is displayed, so a dismissal by closing it also counts.

**7. Structure.** Pure modules with no `vscode` import, unit-tested like the rest of the extension: `deckDiscovery.ts` (deck classification, project grouping), `includePlan.ts` (missing decks → ordered, escaped paths merged with existing entries; keying of the missing set for declined offers), `deckTip.ts` (whether to show). A thin adapter, `deckDiscoveryAdapter.ts`, reads settings, calls `findFiles`, shows notifications and writes the configuration. The scaffolder's merge lives in `project-dir.mjs`-style helper (`editor-config.mjs`) so it is testable without the interactive CLI.

## Risks / Trade-offs

- **Multi-root path collisions.** A relative literal path is matched against every workspace folder; two folders with the same relative deck path would both register. → Accepted: it needs identical layouts, and both would then be valid entries.
- **User customised `slidev.include`.** We only prepend to it, preserving their entries. The `**/slides.md` default staying in place means a project's own `slides.md` (fewest separators) still becomes the default, which matches its being a lone default deck.
- **Slidev extension internals change.** We depend only on `slidev.include`/`exclude` and `slidev.choose-entry`. If `choose-entry` disappears the button would fail; it is wrapped so the notification degrades to text.
- **The recommended extension may not be published yet.** VS Code ignores an unknown recommendation. `antfu.slidev` is recommended alongside it for that reason.
- **Old comparison decks with different names.** They would be offered as decks. → Name fallback covers the generator's own names; the user can decline.
- **Comparison marker leaks into the theme.** `comparisonDeck` is an unknown headmatter key, which Slidev passes through untouched; the theme ignores it.

## Migration Plan

Nothing to migrate. Existing projects gain `.vscode/extensions.json` the next time a deck is added; their decks are offered for registration the next time the extension activates. Rolling back means removing the extension section; `.vscode/extensions.json` and the marker are harmless.

## Open Questions

- Whether `codeurjc.vscode-codeurjc-slidev` is already published under that id; if not, the recommendation is inert until it is.
