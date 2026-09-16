## 1. Conversion data for the report

- [x] 1.1 In `convert.ts`, collect `codeBlocks` from each rendered draft's code blocks (Slidev/ODP numbers, hidden, language, terminal, outcome `imported`/`close`/`none`/`command`/`no-folder`, file relative path, line range, matched/total, first non-blank line), using the same exact-match condition `renderCode` uses for imports
- [x] 1.2 Return `context` (code folder, indexed file count, source-link base, LibreOffice status or `disabled`) from `convertOdp`
- [x] 1.3 Compute `comparisonSlides` (fileIndex → information slide number) in the same walk that builds `comparison.md`'s entries; empty when the deck isn't written
- [x] 1.4 Unit tests: code block outcomes on the synthetic deck (import, near, command, no folder), and comparison slide numbers matching the generated `comparison.md`'s slide separators, including a hidden slide

## 2. Report rendering

- [x] 2.1 Create `importReport.ts` with `reportFileName(importedAt, existing)` (local `YYYY-MM-DDTHH-MM-SS`, `-2`/`-3` on collision)
- [x] 2.2 `importReportMarkdown(result, { odpPath, importedAt, version })`: heading, Context, Summary, Notices, Code (with the no-folder line), Notes and Losses tables (Slidev number or "hidden", ODP number or range, comparison slide), "nothing to list" wording for empty sections, and escaping of `|`, newlines and backticks in cells
- [x] 2.3 Unit tests: file naming and collisions, each section's rows and empty-state wording, cell escaping, and a first-line display for unmatched blocks

## 3. Writing the report

- [x] 3.1 `importOdpProject`: accept `now` and `version`, write the report last under `import-reports/` with a free name, and return `reportPath`
- [x] 3.2 End `formatReport`'s lines with `Report written to import-reports/<name>`, and pass `version` from `package.json` to `importOdpProject` in `index.mjs`
- [x] 3.3 Move the target-directory handling in `index.mjs` into a small testable helper (`project-dir.mjs`: `removableEntries`, `emptyDir` keeping a top-level `import-reports/`), update the prompt to say reports are kept
- [x] 3.4 Add `import-reports/` to `template/_gitignore`
- [x] 3.5 Tests: helper unit tests (only-reports directory counts as empty, removal keeps top-level `import-reports/` but not a nested one); CLI test that the report is written and printed, that a project directory holding only an earlier report gets a second report next to it, and that `.gitignore` lists `import-reports/`

## 4. Corpus and docs

- [x] 4.1 Corpus assertion: Tema 1.2's report lists imported, close and unmatched code blocks, the no-GitHub-origin notice, and losses; a deck without a code folder (Integración Continua con GitHub Actions) says so in its code section
- [x] 4.2 `packages/create-codeurjc-slidev/README.md`: the import report (location, naming, contents, kept across re-imports, gitignored, adding the ignore line to older projects)
- [x] 4.3 `AGENTS.md`: `importReport.ts` in the ODP import pipeline and the re-import rule
- [x] 4.4 `pnpm lint && pnpm typecheck && pnpm test` pass
