## MODIFIED Requirements

### Requirement: The report records the import's context and summary
The report SHALL begin with a heading naming the deck and a context list containing:
- the ODP's absolute path;
- the deck's own markdown file name (`slides.md`, or `<slug>.md` for a named deck), so a shared `import-reports/` directory stays legible once it holds reports for more than one deck;
- the import's local date and time;
- the importer's name and version;
- the code folder used, with how many files it indexed, or that none was found;
- the source-link base, or why there is none;
- the LibreOffice version detected, or why it wasn't available;
- the comparison deck's outcome: written (naming the comparison file, `comparison.md` or `<slug>-comparison.md`), not needed, or skipped.

It SHALL then give the summary counts:
- ODP slides and converted slides;
- merged build-ups;
- snippet imports and inline code blocks;
- slides with losses and slides with notes.

Last, it SHALL list every console notice, such as a missing code folder, source links being skipped, build-ups kept separate, or LibreOffice being unavailable.

#### Scenario: Context of an import with a code folder but no GitHub origin
- **WHEN** Tema 1.2 is imported with its code folder (112 files), no GitHub origin, and LibreOffice 25.8.7.3
- **THEN** the report's context lists the ODP path, the deck's file name, the importer version, the code folder with 112 files, that source links were skipped for lack of a GitHub origin, LibreOffice 25.8.7.3, and the comparison deck's outcome, and its notices include the no-GitHub-origin notice

#### Scenario: A namespaced deck's report names its own file
- **WHEN** an ODP is imported as deck `tema1` into a multi-deck project, and it has losses
- **THEN** the report's context lists the deck's file name as `tema1.md` and the comparison outcome as written to `tema1-comparison.md`
