## Why

The ODP importer reports losses, notes and notices only to the console, which scrolls away. When converting many decks in one go, there's no lasting reference of what each import lost, what it converted with caveats, or which code blocks found their file. Answering "which decks still need a code folder" meant re-running the importer's matching by hand. Re-importing a deck into its project also wipes the directory, so a report saved inside the project would vanish on the next run.

## What Changes

- Every ODP import writes a markdown report to `import-reports/import-report-<local timestamp>.md` inside the project, with a numeric suffix when that name already exists. Earlier reports are never overwritten.
- The report records:
  - the import's context: source ODP, date, importer version, code folder and source-link base, LibreOffice version and comparison-deck outcome;
  - the summary counts and the console notices;
  - a code-matching section listing every code block with its outcome: imported, close to a file, no match, terminal command, or no code folder;
  - per-slide notes and per-slide losses, cross-referenced to the slide in `comparison.md` that shows them.
- Re-importing into an existing project keeps its `import-reports/` directory. The "not empty" check ignores a directory that only contains reports.
- The scaffolded project's `.gitignore` ignores `import-reports/`.
- The console output is unchanged, plus a final line naming the written report.

## Capabilities

### New Capabilities

- `odp-import-report`: the markdown import report: location, naming, content sections, and the code-matching record.

### Modified Capabilities

- `project-scaffolding`: re-importing into a non-empty project preserves `import-reports/`, and the template ignores it in git.

## Impact

- `packages/create-codeurjc-slidev/src/odp/`:
  - `convert.ts`: collect each code block's match outcome with its slide numbers, and expose the import context (code folder, repo base, LibreOffice status).
  - New `importReport.ts`: pure markdown rendering from the conversion result.
  - `index.ts`: write the report with an injectable clock and version, and return its path for the console line.
- `packages/create-codeurjc-slidev/index.mjs`:
  - `emptyDir` and the non-empty check skip `import-reports/`;
  - print the report path;
  - pass the package version to the importer.
- `packages/create-codeurjc-slidev/template/_gitignore`: add `import-reports/`.
- Tests: unit tests for rendering and naming, a CLI test for re-importing into an existing project, and corpus assertions on a real deck's report.
- Docs: `packages/create-codeurjc-slidev/README.md`, `AGENTS.md` (ODP import pipeline).
