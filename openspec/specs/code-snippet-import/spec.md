## Purpose

TBD - defines how presenters reference example code living on disk from `slides.md` via Slidev's `<<<` snippet-import syntax, sourced from a single configurable code-root directory, with fragment selection (line ranges or content-anchor ranges) expressed entirely in `slides.md` so the referenced files themselves stay unmodified.

## Requirements

### Requirement: Code examples are referenced from a single configurable root directory
The project SHALL define a single configuration value naming the root directory under which all referenceable example code lives (default `code`). A presenter SHALL reference files from this directory using a `<<< @/path/to/file[selector] lang` snippet-import line, which reads the file at render/build time and re-renders the slide when the file changes. No selector (`<<< @/path/to/file lang`) SHALL show the file's full contents.

#### Scenario: Snippet import reflects the current file contents
- **WHEN** a slide contains `<<< @/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java[9-15] java`
- **THEN** the rendered code block shows lines 9-15 of that file's current contents, not a hand-copied snapshot

### Requirement: A fragment of a file can be selected without any in-file markup
Since example files must remain unmodified, a presenter SHALL be able to select a contiguous fragment of a file to display using a selector written entirely in `slides.md`, either as an absolute line range `[N-M]` or as a content-anchor range `["first line text".."last line text"]` (matching from the line containing the first text through the line containing the second, inclusive, searched against the whole file's text).

#### Scenario: Line-range selector
- **WHEN** a slide contains `<<< @/code/ejer8/.../GestorNotas.java[9-15] java`
- **THEN** only lines 9 through 15 of the file are shown, and the file itself contains no selection markup of any kind

#### Scenario: Content-anchor range selector
- **WHEN** a slide contains `<<< @/code/ejer8/.../GestorNotas.java["public float calculaNotaMedia".."return suma / notas.size();"] java`
- **THEN** the shown code starts at the line containing "public float calculaNotaMedia" and ends at the line containing "return suma / notas.size();", inclusive

#### Scenario: No selector shows the whole file
- **WHEN** a slide contains `<<< @/code/ejer8/.../GestorNotas.java java` with no bracketed selector
- **THEN** the full contents of the file are shown

#### Scenario: Editing the source file updates the slide without editing slides.md
- **WHEN** the dev server is running and a file referenced by a `<<<` import is modified and saved
- **THEN** the slide showing that snippet re-renders with the updated content, without any change to `slides.md`

### Requirement: Imports outside the configured code root are flagged
When a `<<<` snippet import resolves to a path outside the configured code-root directory, the dev server and build SHALL emit a console warning identifying the offending slide and the resolved path, without failing the build or blocking the dev server.

#### Scenario: Import from outside the code root warns
- **WHEN** a slide contains a `<<<` import whose resolved path is not under the configured code-root directory
- **THEN** a console warning is emitted naming the slide and the out-of-root path, and the slide still renders

#### Scenario: Import from inside the code root is silent
- **WHEN** a slide contains a `<<<` import whose resolved path is under the configured code-root directory
- **THEN** no code-root warning is emitted for that import

### Requirement: Example files are never modified by the import mechanism
Referencing a file via `<<<` import SHALL NOT require or cause any modification to that file (no injected markers, region comments, or other teaching-only markup). Files under the code root remain exactly what a student would see if they opened them directly.

#### Scenario: Imported file is unchanged on disk
- **WHEN** a file under the code root is referenced by one or more `<<<` imports across the deck
- **THEN** the file's contents on disk are identical before and after the deck is built or served
