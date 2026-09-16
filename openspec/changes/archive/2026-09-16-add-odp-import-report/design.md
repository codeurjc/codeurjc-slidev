## Context

`convertOdp` returns a `ConvertResult` and writes nothing. It holds the stats, `notices`, per-slide `reports` (`losses`, `info`), the comparison outcome and markdown. `importOdpProject` (`src/odp/index.ts`) writes the project files, and `formatReport` turns the result into console lines, which `index.mjs` prints. Nothing about the import survives except the console scrollback.

Three details shape the design:
- **Re-imports wipe the project.** `index.mjs` re-imports into a non-empty target by asking "Remove existing files and continue?" and running `emptyDir`, which recursively deletes everything. A report stored in the project would be deleted by the next import unless that step spares it.
- **Match outcomes never reach the result.** Each code block's `CodeMatch` (`kind`, `file`, `startLine`/`endLine`, `matched`/`total`) lives on `DraftCode` inside the drafts. Only a near match's file name leaves `convertOdp`, as a loss.
- **Comparison slide numbers are predictable.** `comparisonMarkdown` emits, for each slide with losses in order, one information slide, followed by the imported converted slide unless the slide is hidden.

## Goals / Non-Goals

**Goals:**
- A lasting, per-import markdown record: context, summary, notices, code matching, notes and losses. It is never overwritten, including across re-imports into the same project.
- Keep report rendering pure and unit-testable, with the clock and version injected.

**Non-Goals:**
- Changing the console output, beyond one final line naming the report.
- A machine-readable (JSON) report, a report history index, or pruning old reports.
- Reports for the plain (non-ODP) scaffold.
- Diffing reports between imports.

## Decisions

### 1. `convertOdp` exposes what the report needs; rendering is a separate pure module

`ConvertResult` gains:
- `codeBlocks: { slidevNumber?: number, odpNumbers: number[], hidden: boolean, language: string, terminal: boolean, outcome: 'imported' | 'close' | 'none' | 'command' | 'no-folder', file?: string, startLine?: number, endLine?: number, matched?: number, total?: number, firstLine: string }[]`. It is collected in the existing per-draft rendering loop from each `code` block, so hidden slides and merged build-ups get the same numbering as `reports`.
  - `imported` covers the same condition under which `renderCode` emits an import (`match.kind === 'exact'` with a file and line range).
  - `none` becomes `no-folder` when no code folder was resolved.
- `context: { codeFolder?: string, codeFiles: number, repoBase?: string, office?: LibreOfficeStatus | 'disabled' }`. Its values are already computed in `convertOdp` and are just returned.
- `comparisonSlides: Map<number, number>`: fileIndex → information slide number in `comparison.md`. It is computed next to `comparisonMarkdown` with the same walk (+1 for the information slide, +1 more when the slide isn't hidden), so the numbering can't drift. It is empty when the deck wasn't written.

`src/odp/importReport.ts` exports:
- `importReportMarkdown(result, { odpPath, importedAt: Date, version })`, returning a string with sections Context, Summary, Notices, Code, Notes and Losses as specified;
- `reportFileName(importedAt, existing: Set<string>)`, returning `import-report-YYYY-MM-DDTHH-MM-SS[-N].md` in local time.

Markdown tables escape `|` and newlines in cells, and first code lines are wrapped in backticks with backticks inside escaped.

*Alternative considered:* rendering from `formatReport`'s console lines. Rejected: it throws away the structure (slide numbers, match details) the tables need.

### 2. `importOdpProject` writes the report; the CLI only prints its path

`ImportProjectOptions` gains `now?: () => Date` (default `new Date()`) and `version?: string`. After writing the project files, `importOdpProject` lists the existing names in `<root>/import-reports/`, picks a free name with `reportFileName`, writes the markdown, and returns `reportPath` (relative to root). `index.mjs` passes its `version` from `package.json`, and `formatReport` ends with `Report written to import-reports/<name>`, so the line is covered by the same tests as the rest of the console summary. The report is written last, so it can state the comparison deck's final outcome.

*Alternative considered:* writing the report from `index.mjs`. Rejected: the importer's integration tests call `importOdpProject` directly, and the bundle already owns every other project write.

### 3. Timestamped names with a collision suffix

Names use local time, because an author reads them next to the other files in their project. The format `2026-09-16T20-45-12` sorts chronologically and avoids `:`, which Windows forbids. A same-second collision (scripted batch re-imports) appends `-2`, `-3`, and so on. The listing and the write are sequential within one process, and concurrent imports into the same project aren't supported anyway.

*Alternative considered:* an incrementing counter (`import-report-3.md`). Rejected: the name tells nothing about when the import ran, and a counter would need to parse existing names.

### 4. `emptyDir` spares a top-level `import-reports/`

`project-dir.mjs` (a small module beside `index.mjs`, published with it and unit-testable without the interactive CLI) defines `KEPT_ON_REIMPORT = new Set(['import-reports'])`, used in two places:
- the non-empty check (`removableEntries(root)`, the directory's entries minus the kept ones);
- the top-level loop of `emptyDir`. Only at the top level: a nested directory of that name inside, say, `code/` is ordinary content.

The prompt reads "Remove existing files (import reports are kept) and continue?".

### 5. Template `.gitignore`

`template/_gitignore` gains `import-reports/`. Reports contain absolute local paths and are a personal working record, not project content.

## Risks / Trade-offs

- **[Absolute paths in reports]** → The reports are gitignored by default. Paths are what make an old report actionable ("which folder was used").
- **[Reports accumulate]** → This is intended, since the history is the point. They're small text files in one directory, easy to clear by hand.
- **[Comparison slide numbers drift from `comparison.md`]** → Both come from one walk in `convert.ts`, and a unit test checks the numbers against the generated deck's slide separators.
- **[Local-time names are ambiguous across a DST change]** → The seconds and the collision suffix still keep names unique. Chronological sorting can be off by an hour once a year, which is acceptable.

## Migration Plan

Additive. Existing projects gain `import-reports/` on their next re-import; their `.gitignore` isn't touched, since the scaffolder only writes the template's on creation. The README notes adding `import-reports/` by hand to older projects.

## Open Questions

None.
