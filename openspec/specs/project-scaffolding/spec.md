## Purpose

TBD - defines the `create-codeurjc-slidev` npm scaffolding package that generates a new, ready-to-run Slidev presentation project depending on `codeurjc-slidev-theme`, independent of this repo's own content.

## Requirements

### Requirement: One-command project scaffold
A `create-codeurjc-slidev` npm package SHALL be published such that running `pnpm create codeurjc-slidev <name>` (or the npm/yarn/bun equivalents) generates a new directory containing a working `package.json`, a starter `slides.md`, and an empty `code/` directory, without the user hand-writing any of those files.

#### Scenario: Scaffold a new presentation repo
- **WHEN** a user runs `pnpm create codeurjc-slidev my-talk`
- **THEN** a `my-talk/` directory is created containing `package.json` (with `name: "my-talk"`, depending on `@slidev/cli` and `codeurjc-slidev-theme`, and `dev`/`build`/`export` scripts), a starter `slides.md` whose frontmatter includes `theme: codeurjc-slidev-theme`, and an empty `code/` directory

### Requirement: Scaffolded project runs without further setup
After running `pnpm install` inside a freshly scaffolded project, `pnpm dev` SHALL start a working Slidev dev server presenting the starter `slides.md` with the theme's default layout and editor active, with no additional files or configuration needed.

#### Scenario: Scaffolded project starts immediately
- **WHEN** a user runs `pnpm install && pnpm dev` inside a directory produced by `create-codeurjc-slidev`
- **THEN** the Slidev dev server starts successfully and the starter slide renders with the theme's default layout, without requiring the user to create a `vite.config.ts`, `composables/`, or `_override/` directory

### Requirement: Scaffold does not prompt for or require an existing slides.md or code/ to copy from
The scaffold SHALL generate its starter content from a bundled template only; it SHALL NOT read, scan, or copy from this repo's own `slides.md` or `code/` directory, and SHALL NOT attempt to determine which code files a new project "needs" from any existing presentation.

#### Scenario: Scaffold is independent of this repo's own content
- **WHEN** `create-codeurjc-slidev` is run from any location, including outside a clone of this repo
- **THEN** it produces the same starter project regardless of what this repo's own `slides.md`/`code/` currently contain

### Requirement: Scaffold can start a project from an ODP presentation
`create-codeurjc-slidev` SHALL accept `--from-odp <file.odp>` (with optional `--code <dir>` and `--code-repo <github-url>`) to create or add to a project whose deck's `slides.md` (or `<slug>.md` when named, see the `multi-deck-projects` capability), `public/images/` and `code/` come from importing that ODP, instead of from the starter template content. One invocation MAY import more than one ODP, into the same or a new project, via `--from-odp-dir` or repeated `--from-odp` (see `multi-deck-projects`); with no such multi-deck flag used, behavior is unchanged: one `--from-odp` imports exactly one ODP into the project's single `slides.md`. When no target directory is given, it SHALL default to a slug of the ODP's file name. When run interactively without `--from-odp`, the scaffolder SHALL ask whether to start empty or import an ODP, and ask for the ODP path in the latter case. A missing or unreadable ODP SHALL abort with a non-zero exit code before any project files are written.

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

### Requirement: Import reports survive re-importing into the same project
A top-level `import-reports/` directory SHALL be ignored when deciding whether a target directory is empty. It is project-wide, not scoped to any one deck: no deck placement, overwrite or removal — whether via the unrelated-directory wipe prompt or the recognized-project per-deck overwrite prompt — SHALL ever remove or modify it. The unrelated-directory wipe prompt SHALL say that import reports are kept. Scaffolded projects SHALL ignore `import-reports/` in their `.gitignore`.

#### Scenario: Re-importing into an already-scaffolded project keeps earlier reports
- **WHEN** a project already depends on `codeurjc-slidev-theme` (so it's a recognized project) and has `slides.md`, `public/` and `import-reports/import-report-2026-09-16T20-45-12.md`, and a user re-runs `--from-odp` against it and confirms the per-deck overwrite prompt for the default deck
- **THEN** `slides.md` is replaced by the new import (its code and images written under the deck-scoped `code/slides/` and `public/images/slides/`, per the `multi-deck-projects` capability), the earlier report is still there, and a second report is added next to it

#### Scenario: Directory with only reports counts as empty
- **WHEN** the target directory contains nothing but `import-reports/`
- **THEN** the scaffolder doesn't ask to remove existing files, and the reports are kept

#### Scenario: Reports aren't committed by default
- **WHEN** a project is scaffolded
- **THEN** its `.gitignore` contains `import-reports/`

### Requirement: Non-empty target directory handling depends on whether it's a recognized project
When the target directory exists and is non-empty, `create-codeurjc-slidev` SHALL first classify it (per the `multi-deck-projects` capability's project-recognition requirement). Against an **unrelated directory**, it SHALL keep today's behavior: prompt to remove existing files (import reports are kept) and continue, or abort on decline. Against a **recognized project**, it SHALL NOT offer to remove its contents wholesale; instead it SHALL follow the `multi-deck-projects` capability's per-deck add/overwrite/skip behavior for the deck(s) being placed by this invocation.

#### Scenario: Unrelated non-empty directory still prompts to wipe
- **WHEN** `--from-odp` targets a non-empty directory with no `codeurjc-slidev-theme` dependency in its `package.json`
- **THEN** the CLI prompts "Target directory is not empty. Remove existing files (import reports are kept) and continue?", exactly as before this change

#### Scenario: Recognized project directory is never wiped wholesale
- **WHEN** `--from-odp` targets a directory that already depends on `codeurjc-slidev-theme`
- **THEN** the CLI does not prompt to remove its contents, and instead applies the per-deck placement behavior to the deck this invocation is adding

#### Scenario: Directory with only reports still counts as empty
- **WHEN** the target directory contains nothing but `import-reports/`
- **THEN** the scaffolder doesn't ask to remove existing files and doesn't apply the recognized-project path either, since there's no `package.json` yet — it scaffolds fresh, and the reports are kept
