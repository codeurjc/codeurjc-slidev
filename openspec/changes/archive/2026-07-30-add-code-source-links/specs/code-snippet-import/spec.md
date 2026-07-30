## MODIFIED Requirements

### Requirement: Imported snippets display the source file's basename as a title
A `<<<` snippet import SHALL render its code block with a title bar showing the basename of the imported file (e.g. `GestorNotas.java`), using Slidev's native fence-title mechanism. A presenter SHALL be able to suppress the title for a specific import by appending a `notitle` keyword after the language token on the `<<<` line. No file-type icon SHALL be forced for languages absent from Slidev's built-in icon map; the title renders text-only in that case. When the import has a resolved source link (see the `code-source-links` capability) and its title is shown, the title bar SHALL additionally show a small clickable source-link icon beside the title text.

#### Scenario: Snippet import shows the file's basename as a title
- **WHEN** a slide contains `<<< @/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java[7-22] java`
- **THEN** the rendered code block has a title bar reading `GestorNotas.java`

#### Scenario: notitle suppresses the title bar
- **WHEN** a slide contains `<<< @/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java[7-22] java notitle`
- **THEN** the rendered code block has no title bar

#### Scenario: A language missing a built-in icon still shows a text-only title
- **WHEN** a slide contains a `<<<` import of a `.java` file (a language absent from Slidev's built-in file-type icon map)
- **THEN** the title bar renders the basename as text, with no file-type icon

#### Scenario: Title bar shows a source-link icon when a link is resolved
- **WHEN** a slide contains a `<<<` import with a title shown and a resolved (auto-detected or directive-supplied) source link
- **THEN** the title bar shows both the basename title text and a clickable source-link icon
