# vscode-deck-discovery

## Purpose

Makes the official Slidev extension (`antfu.slidev`) see a project's decks: finds every deck a workspace holds, offers to register the ones its `slidev.include` setting doesn't reach (with a deterministic default deck), and explains once how to switch the active deck in a multi-deck project.

## Requirements

### Requirement: Decks are discovered by their theme declaration
The extension SHALL treat a markdown file in an open workspace folder as a **deck** when its leading frontmatter declares `theme: codeurjc-slidev-theme`, except when that frontmatter also declares `comparisonDeck: true`, or (for a comparison deck generated before the marker existed) when the file is named `comparison.md` or ends in `-comparison.md`. Files under `node_modules`, `.git` and `dist` SHALL be ignored.

#### Scenario: A deck with any name is found
- **WHEN** the workspace folder contains `tema1.md` whose frontmatter declares `theme: codeurjc-slidev-theme`
- **THEN** `tema1.md` is a deck

#### Scenario: A comparison deck with the marker is not a deck
- **WHEN** `tema1-comparison.md` declares the theme and `comparisonDeck: true`
- **THEN** it is not a deck

#### Scenario: An older comparison deck is recognised by name
- **WHEN** `comparison.md` declares the theme but no `comparisonDeck` key
- **THEN** it is not a deck

#### Scenario: Other markdown is ignored
- **WHEN** `README.md` has no `theme:` frontmatter
- **THEN** it is not a deck

### Requirement: Unregistered decks are registered with the Slidev extension on request
When the workspace has decks that no pattern in `slidev.include` (minus `slidev.exclude`) already resolves to, the extension SHALL offer to register them, and only after the user accepts SHALL it write `slidev.include` at **Workspace** scope. The new value SHALL list each missing deck as a literal path relative to the workspace folder containing it, with glob metacharacters in the path escaped (VS Code's glob syntax has no backslash escape, so each is wrapped in a character class, `*` becoming `[*]`), followed by every entry that `slidev.include` already had. Decks already resolved by an existing pattern SHALL NOT be listed again. The offer SHALL be made at most once for a given set of missing decks, and again when that set changes. Nothing SHALL be written when the user declines, when no workspace is open, or when the setting `codeurjcSlidev.deckDiscovery.enabled` is `false`.

#### Scenario: Decks named other than slides.md are offered for registration
- **WHEN** a workspace folder holds `tema1.md` and `tema2.md` and `slidev.include` is still the default
- **THEN** the extension offers to register them, and after acceptance `slidev.include` becomes `["tema1.md", "tema2.md", "**/slides.md"]` (in the order given by the default-deck requirement)

#### Scenario: A project nested in a larger workspace
- **WHEN** the workspace folder is a monorepo and the decks are in `projects/AIS/`
- **THEN** the written paths are `projects/AIS/<deck>.md`, relative to the workspace folder

#### Scenario: Declining writes nothing
- **WHEN** the user dismisses the offer
- **THEN** `slidev.include` is unchanged and the same set of decks is not offered again

#### Scenario: A new deck reopens the offer
- **WHEN** the user declined for two decks and a third deck later appears
- **THEN** the extension offers again for the new set

#### Scenario: Decks already covered are left alone
- **WHEN** `slidev.include` already contains `*.md` and covers every deck
- **THEN** no offer is made and no setting is written

#### Scenario: Metacharacters in a path are escaped
- **WHEN** a deck lives at `projects/curso [2026]/tema{1}.md`
- **THEN** it is written to `slidev.include` as `projects/curso [[]2026[]]/tema[{]1[}].md`, which matches only that file

### Requirement: The default active deck is first in the include order
The decks the extension writes SHALL be ordered so the first is the deck the user last edited in this workspace (a change to a deck's text, remembered by the extension per workspace), and the rest alphabetical by path. When no deck has been edited yet, all SHALL be alphabetical. A deck the user last edited that is not among the decks being written SHALL be ignored. A choice of active entry that the Slidev extension already remembers SHALL NOT be overridden by the extension.

#### Scenario: Last edited deck goes first
- **WHEN** the user last edited `tema2.md` and the missing decks are `tema1.md`, `tema2.md`, `tema3.md`
- **THEN** they are written in the order `tema2.md`, `tema1.md`, `tema3.md`

#### Scenario: Alphabetical without history
- **WHEN** no deck has been edited in the workspace
- **THEN** the decks are written in alphabetical order by path

### Requirement: A tip explains how to switch the active deck in a multi-deck project
The first time the user opens a deck (makes a deck the active text editor) in a project holding two or more decks, the extension SHALL show one information notification saying that the Slidev preview follows one deck at a time and how to change it. The notification SHALL offer a **Choose deck…** button that runs the `slidev.choose-entry` command, and a **Don't show again** button. The message SHALL point to the Projects view in the Slidev sidebar and SHALL NOT claim which deck is currently active. A project is the tree rooted at the deck's nearest ancestor directory that holds a `code/` directory or a `package.json` (the extension's existing project-root rule), or the deck's own directory when there is none. The tip SHALL be shown at most once per workspace, whichever button is pressed or if it is dismissed. Opening a deck in a project with a single deck SHALL show nothing.

#### Scenario: First deck opened in a multi-deck project
- **WHEN** the user opens `tema1.md` in a project that also holds `tema2.md`
- **THEN** the notification appears with **Choose deck…** and **Don't show again**

#### Scenario: Choose deck…
- **WHEN** the user presses **Choose deck…**
- **THEN** the `slidev.choose-entry` command runs

#### Scenario: Shown once per workspace
- **WHEN** the tip has been shown and the user opens another deck, or reloads the window
- **THEN** it is not shown again

#### Scenario: Single-deck project
- **WHEN** the project holds only one deck
- **THEN** no tip is shown

#### Scenario: Opt-out
- **WHEN** `codeurjcSlidev.deckDiscovery.enabled` is `false`
- **THEN** neither the registration offer nor the tip is shown
