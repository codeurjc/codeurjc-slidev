## ADDED Requirements

### Requirement: Code-root path completion for `<<<` imports
Inside a theme-tagged markdown document, typing within a `<<< @/...` import's file-path token SHALL offer completion items for files and folders under the configured code root, matching what has been typed so far, retriggering as further path segments are typed.

#### Scenario: Completions offered after the `@/` prefix
- **WHEN** the cursor is positioned after `<<< @/` on an import line
- **THEN** completion items are offered for the top-level entries of the configured code root

#### Scenario: Completions narrow to a typed prefix
- **WHEN** the cursor is positioned after `<<< @/code/eje` on an import line
- **THEN** only code-root entries whose name starts with `eje` are offered

#### Scenario: No completions outside a theme-tagged document
- **WHEN** the cursor is on a `<<< @/...`-shaped line in a markdown document with no `theme: codeurjc-slidev-theme` frontmatter
- **THEN** no path completions are offered

### Requirement: Copy a selector for the current selection
A command SHALL compute a `<<<` import selector string for the active editor's current non-empty selection and copy it to the clipboard: a content-anchor range `["first line".."last line"]` (using the trimmed text of the selection's first and last lines) when both boundary lines are non-blank and each occurs exactly once in the file, otherwise a line range `[N-M]` (1-based, inclusive) — including the single-line case `[N-N]`, which SHALL always use the line-range form regardless of uniqueness.

#### Scenario: Unique multi-line selection produces a content-anchor range
- **WHEN** a multi-line selection's first and last lines each occur exactly once in the file (after trimming) and neither is blank
- **THEN** the copied selector is `["<first line text>".."<last line text>"]`

#### Scenario: Ambiguous boundary text falls back to a line range
- **WHEN** a multi-line selection's first or last line's trimmed text occurs more than once in the file, or either is blank
- **THEN** the copied selector is `[N-M]` using the selection's 1-based line numbers

#### Scenario: Single-line selection always uses a line range
- **WHEN** the selection spans a single line
- **THEN** the copied selector is `[N-N]` for that line's 1-based number, regardless of the line's uniqueness in the file

### Requirement: Paste a selector into the current import
A command, run with the cursor on a `<<<` import line, SHALL validate the clipboard's contents as a real selector using the theme's own selector parser and, if valid, splice it into that line's `[selector]` bracket — replacing an existing selector or inserting a new one — leaving the rest of the line (file path, language, `notitle`) unchanged. If the clipboard content does not parse as a valid selector, the command SHALL report an error and make no edit.

#### Scenario: Pasting into an import with no existing selector
- **WHEN** the cursor is on `<<< @/code/Foo.java java` and the clipboard holds `[7-24]`
- **THEN** the line becomes `<<< @/code/Foo.java[7-24] java`

#### Scenario: Pasting replaces an existing selector
- **WHEN** the cursor is on `<<< @/code/Foo.java[1-5] java` and the clipboard holds `["a".."b"]`
- **THEN** the line becomes `<<< @/code/Foo.java["a".."b"] java`

#### Scenario: Invalid clipboard content is rejected without editing
- **WHEN** the cursor is on a `<<<` import line and the clipboard holds text that does not parse as a selector
- **THEN** no edit is made, and an error is reported

#### Scenario: No-op when the cursor is not on an import line
- **WHEN** the command is run with the cursor on a line that is not a `<<<` import
- **THEN** no edit is made, and an error is reported
