## Why

`create-codeurjc-slidev` scaffolds exactly one deck (`slides.md`) per project, and `--from-odp` assumes the same: one ODP, one throwaway project, its own `package.json`/`node_modules`. A course is naturally many lecture decks sharing one theme, one dependency tree, and often one code corpus — importing all 20 CodeURJC course ODPs today means 20 separate project directories, 20 installs, and no way to add deck #21 later without either a brand-new directory or (worse) pointing the scaffolder at an existing one and wiping it, since the CLI's only response to "target directory is not empty" is `emptyDir`: delete everything except `import-reports/` and start clean. There's no way today to *add* a deck to a project without destroying the ones already there.

Slidev and the theme already support this at runtime — `slidev <file>.md` takes any entry file, and pnpm forwards extra CLI args through package.json scripts untouched (`pnpm dev tema1.md` already works, verified) — so the missing piece is entirely in the scaffolder: safely placing more than one deck's files (markdown, code, images) into one project directory without collision.

## What Changes

- New `--deck <slug>` flag on `create-codeurjc-slidev`, usable with or without `--from-odp`, that adds a named deck (`<slug>.md`) to a project instead of assuming `slides.md` is the only one. Works against a brand-new directory or an existing codeurjc-slidev project.
- New `--from-odp-dir <dir>` flag: batch-imports every `.odp` found in `<dir>` into one project in a single invocation, auto-slugifying each deck's name the same way a single `--from-odp` does today.
- `--from-odp`/`--deck` become repeatable in one invocation (`--from-odp a.odp --deck tema1 --from-odp b.odp --deck tema2`) for explicit batch control, as an alternative to `--from-odp-dir`.
- The CLI distinguishes three cases for a non-empty target directory instead of one: (a) doesn't exist → scaffold fresh (unchanged), (b) exists but isn't a recognized codeurjc-slidev project → today's wipe-or-abort prompt (unchanged, still the safety net for "wrong directory"), (c) exists and *is* a recognized project → per-deck add/overwrite, never a blanket wipe.
- Per-deck exists-already handling: a deck slug that already has a `<slug>.md` in the target project prompts "Deck '<slug>' already exists — overwrite its slide file, code and images? [y/N]"; declining skips just that deck and continues the batch. **BREAKING**: this replaces the current single-deck "not empty → remove everything or abort" prompt whenever the target is already a recognized project.
- New `--yes`/`--force` (blanket-overwrite every existing deck without prompting) and `--skip-existing` (blanket-skip every existing deck without prompting) flags for scripted/unattended batch reruns.
- ODP-sourced decks in a multi-deck project get their own generated code and images under `code/<slug>/` and `public/images/<slug>/`, never touching another deck's subfolder or the shared top level of `code/`/`public/images/`, which stays free for content a person places there by hand to be referenced from more than one deck (already possible today via the existing flat `@/code/...`/image-src resolution — no new mechanism needed for that half).
- A multi-deck project's per-ODP comparison deck and import report are similarly deck-scoped: `<slug>-comparison.md` instead of always `comparison.md`, and each report names which deck it covers.

## Capabilities

### New Capabilities
- `multi-deck-projects`: the general "add a deck to a project" scaffolding mechanism — recognizing an existing codeurjc-slidev project, the `--deck`/`--from-odp-dir`/repeated-`--from-odp` CLI surface, per-deck exists/overwrite/skip prompting, the `--yes`/`--force`/`--skip-existing` batch flags, and the per-deck code/image subfolder convention (with root-level `code/`/`public/images/` staying available for hand-placed cross-deck sharing).

### Modified Capabilities
- `project-scaffolding`: the "Scaffold can start a project from an ODP presentation" requirement's "one invocation SHALL import exactly one ODP into one project" constraint is lifted; the non-empty-directory requirement is split into the recognized-project vs. unrelated-directory cases described above.
- `odp-import`: the image-destination requirement changes from "the project's `public/images/`" to that path or its deck-scoped subfolder, depending on whether the project is multi-deck.
- `odp-code-conversion`: the code-folder-destination and `<<<` import-path requirements change from `<project>/code/` to that path or its deck-scoped subfolder, matching the images change.
- `odp-comparison-deck`: the comparison deck's filename and location requirement changes from the hardcoded `comparison.md` next to `slides.md` to `<slug>-comparison.md` next to `<slug>.md` for a named deck.
- `odp-import-report`: the report-content requirement gains the importing deck's slug/filename in its context section, so a shared `import-reports/` directory's reports are distinguishable across decks.

## Impact

- `packages/create-codeurjc-slidev/index.mjs`: CLI argument parsing (new flags), target-directory classification (recognized project vs. not), per-deck prompt loop replacing the single `emptyDir`-or-abort branch.
- `packages/create-codeurjc-slidev/project-dir.mjs`: `emptyDir`/`removableEntries` scope narrows to the "unrelated non-empty directory" case only; new logic for "is this directory a recognized codeurjc-slidev project" and per-deck file removal (as opposed to whole-directory).
- `packages/create-codeurjc-slidev/src/odp/index.ts` / `convert.ts`: `importOdpProject` takes a deck slug and writes `<slug>.md`, `code/<slug>/`, `public/images/<slug>/`, `<slug>-comparison.md` instead of the hardcoded singular names; `<<<` import paths and image `src`s emitted accordingly.
- `packages/create-codeurjc-slidev/template/`: unaffected for the single-deck path (default behavior with no new flags stays exactly as today).
- No changes needed in `packages/codeurjc-slidev-theme/` — the theme's editing/rendering already resolves everything against "whichever file this slide came from," not a hardcoded `slides.md`.
- The 20 already-generated `projects/<slug>/` directories in this repo's own workspace are out of scope for this change (they stay as-is); this change only affects future scaffolding.
