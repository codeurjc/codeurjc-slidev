## 1. Project recognition and CLI argument surface

- [x] 1.1 In `project-dir.mjs`, add `isRecognizedProject(root)`: reads `root/package.json` if present, returns whether `dependencies` includes `codeurjc-slidev-theme`. Returns `false` when the directory or file doesn't exist or fails to parse.
- [x] 1.2 In `index.mjs`, parse `--deck <slug>` (single value; error if repeated without a matching `--from-odp`... see 1.4), `--from-odp-dir <dir>`, `--yes`/`--force` (alias), `--skip-existing`. Reject `--yes`/`--force` and `--skip-existing` together with a non-zero exit and an error before any file is touched.
- [x] 1.3 Support repeated `--from-odp` (minimist collects repeats into an array); when `--deck` is also repeated, pair them positionally by occurrence order. Validate equal counts when both are repeated more than once (or document/enforce the pairing rule chosen during implementation — see design.md Decision 2/3).
- [x] 1.4 Build the batch: one `{ slug, odpPath | null }` entry per requested deck (`--from-odp-dir` entries + explicit `--from-odp`/`--deck` pairs + a bare `--deck` with no ODP). Compute each entry's slug per the slug-naming requirement (multi-deck-projects spec): explicit `--deck` wins; else slugify the ODP file name for a batch of >1 or a `--from-odp-dir` entry; else (lone entry, no `--deck`) default to `slides`.
- [x] 1.5 Validate the batch has no duplicate slugs; abort with a non-zero exit and an error naming the collision before writing anything if it does.

## 2. Target-directory classification and per-deck placement flow

- [x] 2.1 Replace `index.mjs`'s single "not empty → prompt → emptyDir" branch: if the target doesn't exist, scaffold fresh (unchanged). If it exists and `isRecognizedProject` is false, keep today's exact prompt/`emptyDir` behavior (still only reachable for a directory this tool never scaffolded, or one with only `import-reports/`, per the existing "directory with only reports counts as empty" scenario). If `isRecognizedProject` is true, skip straight to the per-deck loop (3).
- [x] 2.2 For a brand-new project (target didn't exist before this invocation) with a bare `--from-odp`/no flags at all, keep writing the full template (`package.json`, `.gitignore`, `README.md`, etc.) exactly as today, then hand off to the per-deck placement step below for the actual deck content.
- [x] 2.3 For an existing recognized project, skip re-writing template scaffolding files (`package.json`'s base fields, `.gitignore`, etc.) — only add/update the requested deck(s)' own files. (Decide during implementation whether `package.json`'s `export`/`dev:compare` script fields still need conditional updates per deck — see design.md Non-Goals: no per-deck scripts, so likely no change needed here beyond what already exists.)

## 3. Per-deck add/overwrite/skip loop

- [x] 3.1 For each batch entry, check whether `<slug>.md` already exists in the target. If not: place it (4/5), no prompt.
- [x] 3.2 If it exists: resolve the answer via `--yes`/`--force` (always yes), `--skip-existing` (always no), or an interactive `prompts` confirm ("Deck '<slug>' already exists — overwrite its slide file, code and images? [y/N]") otherwise.
- [x] 3.3 On yes: replace exactly that deck's own files (its `.md`, its code subfolder or flat `code/` per the flat-vs-namespaced rule, its images subfolder or flat `public/images/`, its comparison file if applicable) — remove the deck's own previous code/image subfolder recursively before recopying (not a blanket `emptyDir` of the whole project). On no: skip, note it for the summary.
- [x] 3.4 Never touch `import-reports/`, another deck's `.md`/code/image files, or anything at the root of `code/`/`public/images/` not under any deck's own subfolder, during this loop.
- [x] 3.5 Track counts (imported / overwritten / skipped) across the loop and print the one-line summary after the batch completes.

## 4. Flat-vs-namespaced path resolution

- [x] 4.1 Implement the flat-vs-namespaced decision (design.md Decision 4 / multi-deck-projects spec): flat (`code/`, `public/images/`) iff slug is `slides` AND the target was not a recognized project before this invocation AND the batch has exactly one entry; namespaced (`code/<slug>/`, `public/images/<slug>/`) otherwise. Compute this once per deck, before calling into the importer.
- [x] 4.2 Thread the resolved code/image base paths (and the deck's `.md` file name) into `importOdpProject`'s options (`src/odp/index.ts`) as explicit parameters, rather than the current hardcoded `'slides.md'` / `join(root, 'public', ...)` / `join(root, 'code')`.
- [x] 4.3 Update `convert.ts` / `draft.ts` (diagram SVG paths, pasted-image paths, `publicImagePath`) to write under the resolved images base path instead of a hardcoded `images/...`.
- [x] 4.4 Update `code.ts`'s `copyCodeFolder` call site to target the resolved code base path instead of the hardcoded `join(root, 'code')`.
- [x] 4.5 Update the `<<<` import-path emission (wherever `@/code/<path>` is built, per `odp-code-conversion`) and image `src` emission (per `odp-import`) to include the `<slug>/` prefix when namespaced, none when flat.

## 5. Comparison deck and import report naming

- [x] 5.1 Update `comparison.ts` (or wherever `comparison.md` is currently a literal) to write `<slug>-comparison.md` when namespaced, `comparison.md` when flat, and point its `src:` includes at `<slug>.md`/`slides.md` accordingly.
- [x] 5.2 Update `importReport.ts` to add the deck's own file name to the context list, and to name the actual comparison file (`comparison.md` or `<slug>-comparison.md`) in the "comparison deck outcome: written" line.
- [x] 5.3 Confirm `import-reports/<timestamp>.md` naming/placement is unaffected (it's already project-wide and cumulative) — no change expected here beyond the content addition in 5.2.

## 6. Unit tests

- [x] 6.1 `project-dir.mjs`: unit tests for `isRecognizedProject` (present, absent, malformed `package.json`, dependency present/absent).
- [x] 6.2 `cli.spec.ts`: batch argument parsing (repeated `--from-odp`/`--deck` pairing, `--from-odp-dir` discovery, `--yes`/`--force`/`--skip-existing` parsing and their mutual-exclusion error), slug-collision-within-batch abort, and end-to-end runs against a temp directory covering: fresh single-deck (flat, unchanged), fresh multi-deck batch, adding a deck to an existing recognized project (namespaced, other decks untouched), overwrite-declined skip, overwrite-accepted replace, `--yes` and `--skip-existing` non-interactive paths, root-level shared `code/`/`public/images/` files left alone.
- [x] 6.3 `convert.spec.ts` / `draft.spec.ts` (or equivalent): image/code path resolution honors an injected namespace prefix (flat vs. `<slug>/`).
- [x] 6.4 `comparison.spec.ts`: comparison file naming and `src:` target vary with the deck slug/namespace.
- [x] 6.5 `importReport.spec.ts`: report context includes the deck's file name and the correctly-named comparison outcome.

## 7. Spec-conformance pass

- [x] 7.1 Walk every scenario added/modified in `openspec/changes/multi-deck-projects/specs/**/spec.md` and confirm each has a corresponding test from section 6 (or an existing corpus/e2e test already covering it).
- [x] 7.2 Run `pnpm --filter create-codeurjc-slidev test`, `pnpm lint`, `pnpm typecheck`.

## 8. Documentation

- [x] 8.1 Update `packages/create-codeurjc-slidev/README.md` with the new flags (`--deck`, `--from-odp-dir`, repeated `--from-odp`, `--yes`/`--force`, `--skip-existing`) and the multi-deck project layout (namespaced `code/<slug>/`, `public/images/<slug>/`, shared root-level files).
- [x] 8.2 Update this repo's `CLAUDE.md`/`AGENTS.md` "ODP import" section to describe the multi-deck scaffolding capability and its CLI surface, matching how other sections document behavior.
- [ ] 8.3 Once implemented and merged, consider (separately, out of scope for this change per proposal.md's Impact section) re-importing the 20 course ODPs already under `projects/` into a consolidated multi-deck project, if desired.
