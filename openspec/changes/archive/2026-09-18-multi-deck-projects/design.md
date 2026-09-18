## Context

`create-codeurjc-slidev` currently treats a target directory as owned entirely by one deck. `--from-odp` writes `slides.md`, `public/images/`, `code/`, `comparison.md` at fixed, singular paths (`packages/create-codeurjc-slidev/src/odp/index.ts`), and the only response to a non-empty target is `project-dir.mjs`'s `emptyDir`: delete every top-level entry except `import-reports/`, then scaffold fresh. There is no concept of "this directory already holds a project I should add to."

At the Slidev/theme level, nothing needs to change: `slidev <file>.md` already takes any entry file, the theme's vite plugin resolves layout/callout/geometry writes against "whichever markdown file this slide came from" rather than an assumed `slides.md` (see the theme's own doc comments on `resolveSlideSourcePath` and the force-invalidate plugin), and `pnpm run <script> <extra-args>` forwards arguments straight through with no `--` separator (verified: `pnpm run echo foo.md --bar` → `['foo.md', '--bar']`). So `pnpm dev tema1.md` already works today in a project with a `tema1.md` sitting next to `slides.md`. The entire gap is in the scaffolder's file-placement logic, not the runtime.

Driving use case: importing the ~20-deck CodeURJC course into one project instead of 20, and being able to add deck #21 later without touching #1-20.

## Goals / Non-Goals

**Goals:**
- Let one `create-codeurjc-slidev` project hold multiple decks (`<slug>.md` files), each independently `slidev dev/build/export`-able by filename, with no per-deck script generation needed.
- Let a deck be added to an existing project — whether that deck comes from an ODP or starts empty — without touching any other deck's files.
- Let this happen in one batched CLI invocation covering many decks (a whole `odp/` directory, or an explicit list), with per-deck collision handling (prompt / `--yes` / `--skip-existing`) resolved within that one run.
- Keep the single-deck, zero-new-flags path (`create-codeurjc-slidev my-talk`, `create-codeurjc-slidev my-talk --from-odp x.odp`) behaviorally identical to today.
- Let genuinely shared code/images live at the root of `code/`/`public/images/`, referenced by any deck, with no new mechanism (this already works via the existing flat `@/code/...` and image-`src` resolution — the design only needs to not break it).

**Non-Goals:**
- Retrofitting the 20 already-generated `projects/<slug>/` directories in this repo's own workspace onto the new layout. Out of scope; they stay as independent projects.
- Auto-detecting or merging genuinely duplicate/renamed code files across decks (e.g. noticing two decks both vendor a copy of the same exercise). The importer still just copies what each ODP's own code folder contains, into that deck's own subfolder.
- Per-deck `package.json` scripts (`dev:tema1`, etc.). Not needed — `pnpm dev tema1.md` already works — and generating them would be one more thing to keep in sync as decks are added/renamed.
- Changing how `slidev build`/`export` choose their output directory (`--out`) for multiple decks. Existing Slidev flags already cover it; not this change's concern.

## Decisions

### 1. Project recognition: how the CLI tells "add to this" from "wipe this"

A target directory is a **recognized codeurjc-slidev project** iff it contains a `package.json` whose `dependencies` include `codeurjc-slidev-theme`. This is the same fact the theme itself relies on for auto-loading, cheap to check, and specific enough not to misfire on an arbitrary non-empty directory (a `git init`'d folder, a stray `node_modules`, etc.).

- Not recognized + non-empty → today's behavior, unchanged: prompt "not empty, remove and continue?", `emptyDir` on yes, abort on no.
- Recognized (regardless of emptiness) → the new per-deck add/overwrite/skip path (Decision 3). `emptyDir` is never called against a recognized project; its blast radius shrinks to exactly the case it already had before this change existed for.
- Doesn't exist → scaffold fresh (unchanged).

Alternative considered: a marker file (e.g. `.codeurjc-slidev`) written by the scaffolder. Rejected — adds a file every project has to explain, for a fact the `package.json` already states declaratively.

### 2. Deck identity: the slug

A deck is identified by a **slug**: the same `slugify()` already used for the project directory name (NFD-strip-diacritics, lowercase, non-alnum → `-`), applied to either the ODP's basename or an explicit `--deck <slug>` value. The slug is the deck's filename stem (`<slug>.md`) and its subfolder name under `code/`/`public/images/` when the project already holds more than one deck contribution (Decision 4).

`--deck` and `--from-odp` are independent: `--deck tema1` alone scaffolds an empty `tema1.md` (mirrors today's empty-project template, just not named `slides.md`); `--from-odp x.odp --deck tema1` names the ODP's own auto-slug explicitly; `--from-odp x.odp` alone keeps today's auto-slug-from-filename behavior.

### 3. Batch surface and per-deck collision handling

Three ways to name the batch of decks a single invocation should place, all funneling into one internal list of `{ slug, source }` pairs before anything is written:

```
--deck <slug>                                  one empty deck
--from-odp <file> [--deck <slug>]              one ODP-sourced deck (repeatable)
--from-odp-dir <dir>                           every *.odp directly under <dir>,
                                                slug = slugify(basename)
```

`--from-odp-dir` and repeated `--from-odp` can combine in one invocation (the directory scan and the explicit pairs both contribute to the same list); a slug collision *within* the requested batch itself (two ODPs slugifying to the same name, or an explicit `--deck` reused) is a hard error before any file is written — batching exists precisely so this is catchable up front instead of discovered as a silent overwrite between two separate process runs.

For each `{slug, source}` in the batch, resolved against the target project's current state:

```
<slug>.md doesn't exist yet   → place it, no prompt
<slug>.md already exists      → "Deck '<slug>' already exists — overwrite its slide
                                  file, code and images? [y/N]"
                                  yes → replace that deck's own files only
                                        (<slug>.md, code/<slug>/, public/images/<slug>/,
                                         <slug>-comparison.md)
                                  no  → skip; batch continues with the rest
```

`--yes`/`--force` answers every such prompt "yes" without asking; `--skip-existing` answers every one "no" without asking. Both are rejected together (mutually exclusive) since they contradict; neither affects the "target isn't a recognized project" prompt from Decision 1, which is about a different question (is this the right directory at all) and stays interactive-only — force-wiping an unrelated directory is a different, more dangerous mistake than re-importing a known deck, and doesn't need a batch-friendly escape hatch.

A one-line summary closes the batch: `N imported, M overwritten, K skipped`.

Alternative considered: no interactive prompt at all, always require an explicit `--yes`/`--skip-existing` when the batch would touch an existing deck (fail otherwise). Rejected per explicit preference — an ODP re-import can silently discard hand-edited slide content (layout positions, callouts) added after the last import, so the safe default for an interactive run is to ask, with the flags existing solely for scripted/unattended reruns.

### 4. Per-deck subfolders for generated code/images, root stays shared

An ODP-sourced deck's own generated content is namespaced under its slug: `code/<slug>/` (was `<project>/code/`) and `public/images/<slug>/` (was `<project>/public/images/`), and its `<<<` imports/`src`s are emitted with that prefix (`@/code/<slug>/...`, `/images/<slug>/...`). This is purely about *where the importer writes what it generates* — the code-root convention `useSnippetImport.ts` checks against is still the whole `code/` tree, so a person can place a file directly at `code/shared-util.java` (outside any `<slug>/` folder) and reference it from any deck's markdown with `@/code/shared-util.java`, exactly as today; nothing new is needed for that half, it's a direct consequence of the code root already being a single flat tree rather than a per-deck boundary. Same reasoning for `public/images/`.

Precise rule, to avoid an ambiguous "single-deck vs. multi-deck project" judgment call at arbitrary later points: a deck's generated code/images are written **flat** (`code/`, `public/images/`, unnamespaced) exactly when both hold: (a) its slug is `slides` (the default, unnamed deck), and (b) the target was **not already a recognized project before this invocation** (i.e. this invocation is the one creating the project) **and** this invocation's batch contains exactly this one deck. Every other case — an explicitly-slugged deck, any deck in a batch of more than one, or any deck (even an unnamed one, which can't arise twice) added to a project that was already recognized before this call — is namespaced under `code/<slug>/`, `public/images/<slug>/`.

This makes today's exact case (`create-codeurjc-slidev talk --from-odp x.odp`, fresh directory, one deck) keep its flat layout forever, and guarantees no deck's already-written files are ever retroactively moved: whether a deck lands flat or namespaced is decided once, when it's first placed, from facts about that moment (did the project already exist, how many decks does this call place) — never revisited by a later invocation adding a different deck.

Alternative considered: always namespace, even for a lone deck. Rejected — breaks the existing single-deck spec scenarios and this repo's own `slides.md`/`code/` convention for no benefit in the common case.

### 5. Comparison deck and import report naming

`comparison.md` becomes `<slug>-comparison.md` (next to `<slug>.md`, same directory), and its per-slide `src:` include points at `<slug>.md#<n>` instead of `slides.md#<n>`. For the default single, unnamed deck (bare `--from-odp` with no `--deck`, i.e. slug not otherwise surfaced) the deck's own file is still `slides.md`, so its comparison deck stays `comparison.md` — the rename only kicks in for an explicitly-slugged deck, keeping the single-deck path unchanged.

The import report's context section gains one line naming the deck (`<slug>.md`) the report is for, so `import-reports/`, being shared across every deck in the project, stays legible once it accumulates reports from several.

## Risks / Trade-offs

- **[Risk]** A person expects the interactive per-deck prompt during a large batch (all 20 decks already exist, all need refreshing) and has to answer 20 times. → **Mitigation**: `--yes`/`--skip-existing` exist exactly for this; documented in the CLI's own `--help`/README as the "scripted rerun" path.
- **[Risk]** Renaming a deck's slug after the fact (e.g. deciding `tema1` should've been `tema-1-1`) leaves its old `code/tema1/`, `public/images/tema1/` orphaned with no automated cleanup. → **Mitigation**: out of scope for this change (no rename command proposed); documented as a manual step (move the subfolder, update the deck's own `<<<`/image references) since it's a rare, deliberate action, not a batch-time concern.
- **[Risk]** Re-importing the default deck (`slides`) into a project first created by a lone bare `--from-odp` writes the new copy's code and images under `code/slides/`, `public/images/slides/` (the project already existed, so Decision 4's flat case no longer applies), leaving the original flat `code/`/`public/images/` files orphaned but unreferenced. → **Mitigation**: none automatic (removing them would risk deleting hand-placed shared files at the root of those directories); called out in the README so the person can delete the old flat copies by hand.
- **[Trade-off]** Detecting "recognized project" via `package.json`'s `dependencies` is a heuristic, not a guarantee — a hand-edited `package.json` that removed the theme dependency (project still fully functional, dependency just moved to `devDependencies` or a lockfile-only resolution) would misclassify as "unrelated directory" and trigger the wipe-prompt instead of the add path. Accepted: this is already how similar tools (e.g. checking for a framework's config file) draw this line, and the fallback (wipe-prompt) is the *safer* of the two failure directions — it asks before deleting either way.
- **[Trade-off]** A slug collision *within* one batch is a hard error (Decision 3), so a person importing `2.2 Código de calidad.odp` and a hypothetical differently-named-but-identically-slugifying ODP together has to pick an explicit `--deck` for one of them. Accepted: rare, and the alternative (silently suffixing `-2`) risks a deck landing under a name the person didn't choose and won't easily find.

## Migration Plan

Additive change to the CLI surface; no existing invocation's behavior changes when no new flag is used. No data migration — this only affects how *future* `create-codeurjc-slidev` runs lay out a project. No rollback concern beyond reverting the package version.

## Open Questions

- Should `--yes`/`--force` also suppress the Decision-1 "target isn't a recognized project" wipe-prompt, for a fully unattended "always create fresh here" scripted path? Leaning no (per Decision 3's reasoning), but worth confirming before implementation.
- Exact wording/format of the per-deck prompt and the closing summary line — cosmetic, left to implementation.
