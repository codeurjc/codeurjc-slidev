# odp-import-report

## Purpose

Writes a markdown report into the project on every ODP import: the import's context and summary, the console notices, how every code block matched the code folder, and per-slide notes and losses cross-referenced to the comparison deck. Reports are never overwritten and survive re-importing into the same project.

## Requirements

### Requirement: Every import writes a new markdown report inside the project
Each ODP import SHALL write a markdown report to `import-reports/import-report-<timestamp>.md` in the project directory. The timestamp SHALL be the import's local date and time as `YYYY-MM-DDTHH-MM-SS`, so reports sort chronologically by name. When a report with that name already exists, the importer SHALL append `-2`, `-3`, ... before `.md` until the name is free. An existing report SHALL never be overwritten. The report SHALL be written whether or not the import lost anything. The console output SHALL stay as it is and end with a line giving the report's path relative to the project.

#### Scenario: Report file for an import
- **WHEN** a deck is imported at 20:45:12 on 16 September 2026, local time
- **THEN** the project contains `import-reports/import-report-2026-09-16T20-45-12.md`, and the console's last import line names that path

#### Scenario: Two imports in the same second
- **WHEN** a report named `import-report-2026-09-16T20-45-12.md` already exists and another import runs within that second
- **THEN** the new report is written as `import-report-2026-09-16T20-45-12-2.md` and the first one is unchanged

#### Scenario: Import without losses still writes a report
- **WHEN** every slide converts without losses or notes
- **THEN** a report is written, with its summary and code sections, and states that nothing was lost

### Requirement: The report records the import's context and summary
The report SHALL begin with a heading naming the deck and a context list containing:
- the ODP's absolute path;
- the import's local date and time;
- the importer's name and version;
- the code folder used, with how many files it indexed, or that none was found;
- the source-link base, or why there is none;
- the LibreOffice version detected, or why it wasn't available;
- the comparison deck's outcome: written, not needed, or skipped.

It SHALL then give the summary counts:
- ODP slides and converted slides;
- merged build-ups;
- snippet imports and inline code blocks;
- slides with losses and slides with notes.

Last, it SHALL list every console notice, such as a missing code folder, source links being skipped, build-ups kept separate, or LibreOffice being unavailable.

#### Scenario: Context of an import with a code folder but no GitHub origin
- **WHEN** Tema 1.2 is imported with its code folder (112 files), no GitHub origin, and LibreOffice 25.8.7.3
- **THEN** the report's context lists the ODP path, the importer version, the code folder with 112 files, that source links were skipped for lack of a GitHub origin, LibreOffice 25.8.7.3, and the comparison deck's outcome, and its notices include the no-GitHub-origin notice

### Requirement: The report lists every code block and how it matched
The report SHALL contain a code section with one row per code block in the converted slides, in slide order. Each row SHALL give:
- the Slidev slide number, or "hidden";
- the ODP slide number or range;
- the block's language;
- its matching outcome, which SHALL be one of:
  - **imported**: an exact match that became a `<<<` snippet import, with the file's path relative to the code folder and its line range;
  - **close**: a near match left inline, with the file's path and how many of the block's lines matched;
  - **no match**: nothing in the code folder matched;
  - **command**: a terminal block, which is never matched;
  - **no code folder**: the import had no code folder to match against.

For blocks without a file, the row SHALL show the block's first non-blank line, so the code can be found in the deck. When the import had no code folder, the section SHALL say so once before the rows.

#### Scenario: Imported, close and unmatched blocks
- **WHEN** a deck's slide 26 shows code identical to lines 3–20 of `ejem1/src/test/java/Calculadora1Test.java`, slide 70 differs from `ejem2/ChatTest.java` in a few lines, and slide 81 matches no file
- **THEN** the code section lists slide 26 as imported from `ejem1/src/test/java/Calculadora1Test.java` lines 3–20, slide 70 as close to `ejem2/ChatTest.java` with its matched line count, and slide 81 as no match with its first line

#### Scenario: Deck without a code folder
- **WHEN** a deck with YAML workflow blocks is imported without a code folder
- **THEN** the code section says no code folder was found and lists each YAML block as "no code folder" with its first line

#### Scenario: Terminal commands
- **WHEN** a slide has a `$ mvn test` prompt box
- **THEN** its row's outcome is "command"

### Requirement: The report lists notes and losses per slide, cross-referenced to the comparison deck
The report SHALL contain a notes section and a losses section. Each SHALL have one row per slide with notes or losses, giving:
- the Slidev slide number, or "hidden";
- the ODP slide number or range;
- the notes or losses, in the same wording as the console.

When `comparison.md` was written, each losses row SHALL give the number of that slide's information slide within `comparison.md`. A section with no rows SHALL say that there is nothing to list instead of an empty table.

#### Scenario: Losses cross-referenced to the comparison deck
- **WHEN** slides 70 and 85 are the first two slides with losses and the comparison deck was written
- **THEN** the losses section lists slide 70 with comparison slide 1 and slide 85 with comparison slide 3 (each lossy visible slide takes an information slide and the imported converted slide)

#### Scenario: Notes section
- **WHEN** Tema 1.1 slide 81 becomes a mermaid diagram
- **THEN** the notes section lists that slide with `diagram converted to a mermaid flowchart`

#### Scenario: Nothing lost
- **WHEN** no slide has losses
- **THEN** the losses section states that nothing was lost
