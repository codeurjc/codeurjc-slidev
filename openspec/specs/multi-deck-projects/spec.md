# multi-deck-projects

## Purpose

Lets one `create-codeurjc-slidev` project hold several decks (`<slug>.md`), added in one batched invocation or later, without touching the other decks' files: project recognition, deck slugs, batch flags, per-deck overwrite/skip handling, and per-deck code/image namespacing.

## Requirements

### Requirement: A target directory is recognized as an existing project by its dependency on the theme
`create-codeurjc-slidev` SHALL classify an existing, non-empty target directory as a **recognized project** when it contains a `package.json` whose `dependencies` include `codeurjc-slidev-theme`, and as an **unrelated directory** otherwise. This classification SHALL determine whether the non-empty-directory prompt removes everything (unrelated directory, unchanged prior behavior) or the per-deck add/overwrite/skip behavior applies (recognized project).

#### Scenario: Existing project directory is recognized
- **WHEN** the target directory contains a `package.json` listing `codeurjc-slidev-theme` under `dependencies`
- **THEN** the CLI treats it as a recognized project and does not offer to remove its contents wholesale

#### Scenario: Unrelated non-empty directory is not recognized
- **WHEN** the target directory is non-empty but has no `package.json`, or a `package.json` that doesn't depend on `codeurjc-slidev-theme`
- **THEN** the CLI falls back to the existing "not empty, remove and continue?" prompt

### Requirement: A deck is named by an explicit or derived slug
`create-codeurjc-slidev` SHALL accept `--deck <slug>` to name the deck being added, usable with or without `--from-odp`. Without `--deck`: a batch entry from `--from-odp-dir`, or an entry in a batch of more than one deck, SHALL default its slug to the slugified ODP file name (or, with no ODP, be required — an empty deck with no `--deck` is only valid as the sole entry of its invocation). A lone deck — the only entry in its invocation, whether from a bare `--from-odp` or from neither `--from-odp` nor `--deck` — SHALL default its slug to `slides`, matching today's single-deck behavior. A slug SHALL be validated the same way a target directory name is (letters, digits and hyphens after slugification).

#### Scenario: Empty deck with an explicit slug
- **WHEN** a user runs `create-codeurjc-slidev course --deck tema1`
- **THEN** `course/tema1.md` is created from the starter template content, without requiring `--from-odp`

#### Scenario: ODP-sourced deck with an explicit slug
- **WHEN** a user runs `create-codeurjc-slidev course --from-odp "Tema 1.2.odp" --deck tema1-2`
- **THEN** the imported deck is written as `course/tema1-2.md` (and its code/images under the `tema1-2` subfolder per the per-deck placement requirement) rather than the ODP-filename-derived slug

#### Scenario: A lone bare --from-odp still defaults to slides
- **WHEN** a user runs `create-codeurjc-slidev talk --from-odp x.odp` with no `--deck` and no other `--from-odp`/`--deck` in the same invocation
- **THEN** the deck's slug defaults to `slides` (unchanged from today), not a slug derived from `x.odp`'s file name

#### Scenario: A batch entry without --deck derives its slug from its ODP
- **WHEN** a user runs `--from-odp-dir odp/` and `odp/` contains `Tema 1.2 - Pruebas unitarias.odp` with no corresponding `--deck`
- **THEN** that entry's slug is `tema-1-2-pruebas-unitarias`, not `slides`

### Requirement: A whole directory of ODPs can be imported in one invocation
`create-codeurjc-slidev` SHALL accept `--from-odp-dir <dir>` to import every `.odp` file found directly under `<dir>` into the target project in one invocation, deriving each deck's slug from its ODP file name the same way a single `--from-odp` does. `--from-odp-dir` and one or more explicit `--from-odp [--deck]` pairs SHALL be combinable in the same invocation, contributing to the same batch.

#### Scenario: Batch-import a directory
- **WHEN** a user runs `create-codeurjc-slidev course --from-odp-dir odp/` and `odp/` contains 20 `.odp` files
- **THEN** the CLI imports all 20 into `course/` in one run, one deck per ODP, each named by its own slug

### Requirement: A slug collision within one batch is a hard error
When resolving the batch of decks to place, a slug used by more than one entry in that batch (whether from `--from-odp-dir`'s auto-slugging, an explicit `--deck` reused across entries, or a combination) SHALL abort the entire invocation with a non-zero exit code and an error naming the colliding slug, before any file is written.

#### Scenario: Two ODPs slugify to the same name
- **WHEN** `--from-odp-dir` finds two files that both slugify to `tema-1`
- **THEN** the command exits with a non-zero code, an error naming `tema-1`, and no files are written for that invocation

### Requirement: Adding a deck to a recognized project never touches another deck's files
When the target is a recognized project (per the classification requirement above), placing a deck SHALL only create or replace that deck's own files: `<slug>.md`, `code/<slug>/` (when the deck has generated code), `public/images/<slug>/` (when the deck has generated images), and `<slug>-comparison.md` (when applicable). It SHALL NOT modify, remove, or rename any other deck's files, nor anything at the root of `code/` or `public/images/` not under a `<slug>/` subfolder.

#### Scenario: Adding a second deck leaves the first untouched
- **WHEN** a project already contains `tema1.md`, `code/tema1/`, and `public/images/tema1/`, and a user adds `tema2` via `--from-odp`
- **THEN** `tema1.md`, `code/tema1/` and `public/images/tema1/` are byte-for-byte unchanged, and `tema2.md`, `code/tema2/` and `public/images/tema2/` are created

#### Scenario: Root-level shared code and images are left alone
- **WHEN** a project has a file at `code/shared/Utils.java` placed by hand (not under any `<slug>/` subfolder), and a deck is added or overwritten
- **THEN** `code/shared/Utils.java` is unchanged, and remains referenceable from any deck's markdown as `@/code/shared/Utils.java`

### Requirement: A deck's generated code and images are namespaced by slug, except a lone default deck
A deck's own generated code and images SHALL be written under `code/<slug>/` and `public/images/<slug>/`, keeping today's flat `code/`/`public/images/` layout only for the one case that matches today's exact behavior: the deck's slug is `slides` (the default), the target directory was not already a recognized project before this invocation, and this invocation's batch contains exactly that one deck. This decision SHALL be made once, when a deck is first placed, from facts about that invocation; a later invocation adding a different deck to the same project SHALL NOT move or renamespace a deck already placed.

#### Scenario: A fresh single-deck import stays flat
- **WHEN** a user runs `create-codeurjc-slidev talk --from-odp x.odp` against a directory that doesn't yet exist
- **THEN** the imported code and images are written to `talk/code/` and `talk/public/images/`, not a `slides/` subfolder

#### Scenario: A deck added to an existing project is namespaced even if it would otherwise default to slides
- **WHEN** a project was already a recognized project before this invocation, and a deck is added to it with no `--deck` and no other entry in this invocation's batch
- **THEN** its slug still defaults to `slides` per the slug-naming requirement, but its generated code and images are written under `code/slides/` and `public/images/slides/`, since the project already existed before this call

#### Scenario: Adding a second deck never moves the first deck's flat files
- **WHEN** a project was created by a lone `--from-odp` (flat `code/`, `public/images/`) and a second deck is added afterward
- **THEN** the first deck's code and images remain at `code/` and `public/images/` unmoved, and the second deck's are written under its own `code/<slug>/`, `public/images/<slug>/`

### Requirement: An existing deck prompts before being overwritten, and can be skipped
When a batch entry's slug already has a `<slug>.md` in the target project, the CLI SHALL prompt to confirm overwriting that deck's own files (`<slug>.md`, its `code/<slug>/`, its `public/images/<slug>/`, its `<slug>-comparison.md`) before doing so. Declining SHALL skip that deck's placement entirely and continue processing the remaining entries in the batch. A new deck (no existing `<slug>.md`) SHALL be placed without prompting.

#### Scenario: Declining an overwrite skips just that deck
- **WHEN** a batch of three decks includes one whose slug already exists, and the user answers "no" to its overwrite prompt
- **THEN** that deck's files are left exactly as they were, the other two decks (new) are placed without prompting, and the command's summary reports one skipped

#### Scenario: Accepting an overwrite replaces only that deck
- **WHEN** the user answers "yes" to an existing deck's overwrite prompt
- **THEN** that deck's `<slug>.md`, `code/<slug>/`, `public/images/<slug>/` and `<slug>-comparison.md` are replaced with the newly generated content, and no other deck's files change

### Requirement: Batch overwrite/skip prompts can be bypassed for scripted runs
`create-codeurjc-slidev` SHALL accept `--yes` (alias `--force`) to answer every per-deck overwrite prompt "yes" without asking, and `--skip-existing` to answer every one "no" without asking. These two flags SHALL be mutually exclusive; passing both SHALL abort with a non-zero exit code and an error before any file is written. Neither flag SHALL affect the separate "target isn't a recognized project" prompt, which SHALL remain interactive regardless.

#### Scenario: Unattended full refresh
- **WHEN** a user runs the same `--from-odp-dir odp/` batch again with `--yes`, and every deck already exists
- **THEN** every deck is overwritten with no prompts, and the summary reports all of them overwritten

#### Scenario: Unattended add-only run
- **WHEN** a user runs a batch with `--skip-existing` against a project where some decks already exist and some are new
- **THEN** the new decks are placed, the existing ones are left untouched with no prompts, and the summary reports the existing ones as skipped

#### Scenario: Both flags together is rejected
- **WHEN** a user passes both `--yes` and `--skip-existing`
- **THEN** the command exits with a non-zero code and an error, and no files are written

### Requirement: A batch invocation ends with a placement summary
After processing every entry in the batch, the CLI SHALL print one summary line counting decks imported (newly placed), overwritten (replaced after confirmation or `--yes`), and skipped (declined or `--skip-existing`).

#### Scenario: Mixed batch summary
- **WHEN** a batch places 2 new decks, overwrites 1, and skips 1
- **THEN** the console prints a line equivalent to "2 imported, 1 overwritten, 1 skipped"
