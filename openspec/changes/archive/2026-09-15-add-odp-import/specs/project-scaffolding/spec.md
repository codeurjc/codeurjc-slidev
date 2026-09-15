## ADDED Requirements

### Requirement: Scaffold can start a project from an ODP presentation
`create-codeurjc-slidev` SHALL accept `--from-odp <file.odp>` (with optional `--code <dir>` and `--code-repo <github-url>`) to create a project whose `slides.md`, `public/images/` and `code/` come from importing that ODP, instead of from the starter template content. One invocation SHALL import exactly one ODP into one project. When no target directory is given, it SHALL default to a slug of the ODP's file name. When run interactively without `--from-odp`, the scaffolder SHALL ask whether to start empty or import an ODP, and ask for the ODP path in the latter case. A missing or unreadable ODP SHALL abort with a non-zero exit code before any project files are written.

#### Scenario: Import into a named project
- **WHEN** a user runs `pnpm create codeurjc-slidev tema-1-2 --from-odp "odp/Tema 1.2 - Pruebas unitarias.odp"`
- **THEN** `tema-1-2/` contains a `package.json` depending on `@slidev/cli` and `codeurjc-slidev-theme`, a `slides.md` converted from the ODP, the ODP's images under `public/images/`, and the ODP's code folder under `code/`

#### Scenario: Default directory name from the ODP
- **WHEN** a user runs `pnpm create codeurjc-slidev --from-odp "Tema 1.2 - Pruebas unitarias.odp"` without a directory argument
- **THEN** the project is created in `tema-1-2-pruebas-unitarias/`

#### Scenario: Missing ODP aborts cleanly
- **WHEN** `--from-odp` points to a file that doesn't exist
- **THEN** the command exits with a non-zero code and an error naming the path, and no project directory is created

### Requirement: Imported projects export click steps and can open the comparison deck
A project created with `--from-odp` SHALL have an `export` script of `slidev export --with-clicks`, so click steps produced by the import are kept in the exported PDF. When a `comparison.md` was generated, it SHALL also have a `dev:compare` script that starts the dev server on `comparison.md`.

#### Scenario: Scripts of an imported project with losses
- **WHEN** an ODP with losses is imported on a machine with LibreOffice ≥ 7.4
- **THEN** the generated `package.json` has `"export": "slidev export --with-clicks"` and `"dev:compare": "slidev comparison.md --open"`
