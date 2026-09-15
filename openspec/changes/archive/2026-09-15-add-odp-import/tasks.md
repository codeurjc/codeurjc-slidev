## 1. Prerequisites and setup

- [x] 1.1 Confirm `add-slide-geometry-frontmatter` and `add-callout-click-steps` are implemented (the importer emits `geometry` frontmatter and `{N}` steps)
- [x] 1.2 Add `odp/` to `.gitignore`
- [x] 1.3 Set up `packages/create-codeurjc-slidev` for TypeScript sources:
  - `src/odp/`, `tsconfig.json`, `vitest` config and `test`/`typecheck` scripts;
  - `fflate` and `@xmldom/xmldom` dependencies;
  - an esbuild bundle to `dist/odp-import.mjs` in `prepack`, with `dist` added to `files`;
  - the package included in the root `pnpm test`/`pnpm typecheck` filters and lint globs
- [x] 1.4 Move `computeSelectorForSelection` from `packages/vscode-codeurjc-slidev/src/selectorFromSelection.ts` into the theme's `composables/useSnippetImport.ts`; update the extension's import and move or duplicate its unit tests accordingly

## 2. Early checks

- [x] 2.1 Carry-over through `src:`: hand-write a small `slides.md` (titles carried across slides, one hidden slide) and a `comparison.md` with `image-right` information slides plus `src: ./slides.md#N` stubs; assert in an e2e/programmatic Slidev load that imported slides show the same carried titles as in `slides.md`. If not, reset the carry state per file in `setup/preparser.ts`
- [x] 2.2 Hidden first slide carrying headmatter: assert a deck whose first slide has `hide: true` plus `theme`/`aspectRatio` still applies them; if not, plan for the importer to emit the visible cover first
- [x] 2.3 SVG split reference: turn the exploration prototype into a tested TypeScript function over a small checked-in synthetic SVG sample (with meta slides, master in defs, hidden-wrapper slide groups, script)

## 3. ODF parsing

- [x] 3.1 Unzip reader returning `content.xml`, `styles.xml` and `Pictures/*` (with fflate)
- [x] 3.2 Style resolver: automatic and common styles from both XML files, parent chains, font-face declarations; effective bold/italic/font family/font size per run; monospace detection against the known font list
- [x] 3.3 Deck model: page size, master pages (with outline placeholder region), slides (index, `draw:name`, hidden flag from drawing-page style), shapes (kind, custom-shape type, normalized geometry, paragraphs with list depth, list-header flag, runs with links, line breaks and tabs, image hrefs, tables, connector endpoints)
- [x] 3.4 Test helper that builds synthetic ODPs from `content.xml`/`styles.xml` snippets (zipped with fflate) for each family
- [x] 3.5 Unit tests: style inheritance, monospace detection, `text:s`/`text:tab`/`text:line-break` handling, hidden flag, SVG+PNG image pairs, table cells

## 4. Classification

- [x] 4.1 Constants module with all thresholds (title band, monospace ratio, alignment tolerance, connector distance, geometry tolerance)
- [x] 4.2 Cover and copyright detection, with field extraction (subject, lesson, title, date, authors)
- [x] 4.3 Title detection (placeholder, then top-band shape), with one-line and two-line split
- [x] 4.4 Body detection (outline frame, then largest listed text shape) and in-content heading detection (list-header, or lone bold first item), with sub-item promotion
- [x] 4.5 Code shapes (monospace ratio, `$ `-prompt boxes), code labels (filename, project label), link-only boxes, annotation rectangles, callouts and connectors, decorations, spacers, loose text
- [x] 4.6 Unit tests per rule with synthetic fixtures covering all three families

## 5. Slide model and markdown emission

- [x] 5.1 Lists with nesting and empty-item removal; body paragraphs; tables to markdown tables
- [x] 5.2 Inline formatting emission (bold, italic, inline code, links), moving whitespace outside markers and escaping markdown-significant characters in plain text
- [x] 5.3 Link-only boxes as trailing link paragraphs; loose text flattened into paragraphs and recorded as a loss
- [x] 5.4 Cover and copyright slide emission; deck headmatter on the first slide; `hide: true` for hidden slides
- [x] 5.5 Heading emission: desired title/subtitle per slide, simulated with the theme's `advanceCarryState` over all slides including hidden; minimal `#`/`##`, bare resets, `resetTitle: true`; `###` for in-content headings under two-line titles
- [x] 5.6 Image extraction to `public/images/` (SVG preferred over a raster fallback; unsupported formats become losses) and `geometry.images`/`geometry.content` emission with the region-to-region mapping and clamping
- [x] 5.7 Loss records with ODP slide number and computed Slidev slide number (position among non-hidden slides), printed to the console at the end of the import
- [x] 5.8 Unit tests for each emitter, including the carry-over scenarios from the spec (repeated title omitted, subtitle reset when the title changes, hidden slide in the chain)

## 6. Code conversion

- [x] 6.1 Code text extraction (paragraphs and line breaks → lines, tabs → 4 spaces, trim blank edges) and language inference (label extension, then content rules, then `text`); label as fence title
- [x] 6.2 Code folder resolution (`--code`, then same-name sibling folder) and copy into `<project>/code/` excluding `target`, `node_modules`, `.git`, `build`, `dist`, `.idea`
- [x] 6.3 File index and matcher: normalization, exact contiguous match, near match (≥ 50% ordered LCS), elision markers, tie-breaking (project label → shortest path → lexicographic), mapping back to real 1-based line numbers
- [x] 6.4 `<<<` import emission with the shared `computeSelectorForSelection` (no selector for whole-file spans)
- [x] 6.5 Base URL resolution: parse `--code-repo` (`/tree/<branch>/<subpath>` optional; resolve a missing branch like the theme); otherwise `findGitRoot` + `parseGitHubRemote` + branch resolution from the source code folder via an injected `GitRunner`; blob URL building with `#L<a>-L<b>`
- [x] 6.6 Explicit `[!source <url>]` lines on imports, `// [!source <url>]` (or `#`) markers on near-match fences; console notice when there's no base URL; near-match loss records
- [x] 6.7 Unit tests: language inference table, matcher classifications (exact, elided, drifted, none), tie-breaking, selector choice, URL building from flag and from a fake git runner

## 7. Annotations to highlights

- [x] 7.1 Line-height and text-top estimation from resolved font size, line spacing and padding (box height when the frame grew to fit its text); rectangle → the lines whose centers it contains; narrow one-line rectangle → substring columns snapped to token boundaries
- [x] 7.2 Callout pairing via connector endpoints, labels inside or on rectangle edges, and arrow-only callouts to nearest lines; callout box position mapped to `@x,y`
- [x] 7.3 Emission as anchor declaration lines for imports (with `#N` for repeated substrings) or inline markers for fences (language comment token); losses for misaligned rectangles, unpaired callouts, and languages without line comments on non-imported blocks
- [x] 7.4 Unit tests from synthetic fixtures modeled on the GitHub Actions nested WORKFLOW/JOB boxes and the `steps:` substring callout

## 8. Build-ups

- [x] 8.1 Shape signatures and superset detection between consecutive slides with equal titles
- [x] 8.2 Merging convertible runs: code annotation additions → `{k}` steps; trailing list items → `<v-clicks>`/`v-click`; images → `<img v-click>` keeping `geometry.images` order
- [x] 8.3 Non-convertible runs kept as separate slides with a console warning naming the ODP slides and addition kinds; loss reports of merged ODP slides map to the merged Slidev slide number
- [x] 8.4 Unit tests: code-callout build-up merge, list build-up merge, screenshot-arrow build-up kept separate with a warning

## 9. Comparison deck

- [x] 9.1 LibreOffice detection (`soffice --version` ≥ 7.4) through an injected `OfficeRunner`, with console messages for missing and too-old versions
- [x] 9.2 SVG export with an isolated temporary `-env:UserInstallation` profile, cleanup of temporary files, and the split (from 2.3) writing `public/odp-originals/<draw:name>.svg` only for slides with losses
- [x] 9.3 `comparison.md` writer: headmatter, then per lossy slide an `image-right` information slide (`# Slide <Slidev number>`, ODP slide number, loss list, or a "not rendered: hidden slide" note) followed by `src: ./slides.md#<file index>` (omitted for hidden slides); no file when there are no losses
- [x] 9.4 Unit tests: numbering with hidden slides before the lossy slide (Slidev number vs `src:` index), hidden lossy slide, no-loss import; LibreOffice-gated integration test that skips with a warning when `soffice` ≥ 7.4 is unavailable

## 10. CLI integration

- [x] 10.1 `index.mjs`: parse `--from-odp`, `--code`, `--code-repo`; interactive "Empty project / Import from ODP" prompt when neither `--from-odp` nor a directory is given; default directory slug from the ODP basename
- [x] 10.2 Validate the ODP path before creating anything (non-zero exit with the path in the error)
- [x] 10.3 Write the project: template files except the starter `slides.md`; generated `slides.md`, images, `code/`, optional `comparison.md` and originals; `package.json` with `export: slidev export --with-clicks` and `dev:compare` when a comparison deck exists
- [x] 10.4 End-of-run console report: slides converted, merged build-ups, code imports vs inline, losses per slide, comparison deck status
- [x] 10.5 Integration test running the CLI on a synthetic ODP into a temp directory, asserting the file tree and `package.json` scripts, plus the missing-file abort

## 11. Corpus tests (local-only fixtures)

- [x] 11.1 Fixture locator: `<repo>/odp/` or `CODEURJC_ODP_FIXTURES`; `describe.skipIf` with a `console.warn` naming each missing deck or code folder
- [x] 11.2 Per-deck tests over the 11 known decks: import completes, slide count matches, spot checks from the exploration (Tema 1.1 two-line titles and carry-over resets, Tema 1.2 exact imports for `Calculadora1Test.java` etc., GitHub Actions labeled boxes and callouts as code highlights (no corpus build-up qualifies for merging), hidden cover slide)
- [x] 11.3 Local smoke check: `slidev build` succeeds on a generated project for at least one deck per family (documented as a pre-publish step, not CI)

## 12. Documentation

- [x] 12.1 `CLAUDE.md`: new "ODP import" section (CLI flags, conversion rules summary, code folder convention, source-link base URL, comparison deck and LibreOffice requirement), plus the importer's package layout in the workspace overview
- [x] 12.2 `CLAUDE.md` Tests section and development cycle: synthetic vs corpus tests, the `odp/` fixture location and env override, skipped-test warnings, and that the real ODP fixture decks and their code folders are provided upon request to the author
- [x] 12.3 `packages/create-codeurjc-slidev/README`: usage of `--from-odp`/`--code`/`--code-repo`, comparison deck, LibreOffice ≥ 7.4 note, fixtures-on-request note

## 13. Verification

- [x] 13.1 `pnpm lint && pnpm typecheck`
- [x] 13.2 `pnpm test`
- [x] 13.3 `pnpm test:e2e`
- [x] 13.4 Local corpus run with all 11 decks present
