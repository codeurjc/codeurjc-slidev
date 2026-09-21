## ADDED Requirements

### Requirement: A scaffolded project recommends the editor extensions
`create-codeurjc-slidev` SHALL ensure `.vscode/extensions.json` in the project it creates or adds a deck to, with `recommendations` listing `codeurjc.vscode-codeurjc-slidev` and `antfu.slidev`. When the file already exists it SHALL add only the missing identifiers, keeping every other recommendation and key; when it exists but cannot be parsed, is not a JSON object, or has comments and would need changes (rewriting would drop the comments), the CLI SHALL leave it untouched and print a note naming what to add. This is independent of the per-deck overwrite/skip handling and SHALL NOT be affected by `--skip-existing`.

#### Scenario: New project
- **WHEN** a user runs `create-codeurjc-slidev course --deck tema1`
- **THEN** `course/.vscode/extensions.json` recommends `codeurjc.vscode-codeurjc-slidev` and `antfu.slidev`

#### Scenario: Deck added to an older project
- **WHEN** a deck is added to a recognized project with no `.vscode/extensions.json`
- **THEN** the file is created, and no other file outside the new deck's own is modified

#### Scenario: Existing recommendations are kept
- **WHEN** `.vscode/extensions.json` already recommends `dbaeumer.vscode-eslint`
- **THEN** it ends up recommending that plus the two identifiers above

#### Scenario: Unparseable file is left alone
- **WHEN** `.vscode/extensions.json` is not valid JSON
- **THEN** the CLI does not modify it and prints a note saying so

#### Scenario: A commented file is only touched when nothing needs adding
- **WHEN** `.vscode/extensions.json` has comments and already lists both identifiers
- **THEN** it is left byte-for-byte as it was, with no note
- **WHEN** it has comments and lacks an identifier
- **THEN** it is left as it was and the CLI prints a note naming the missing identifier(s)
