## Purpose

TBD - defines an anchor-declaration syntax, written in `slides.md` immediately following a `<<<` snippet import (see `code-snippet-import`), that attaches highlights and callouts (see `code-highlight-callouts`) to fragments of a file-sourced snippet without adding any marker text to the imported file itself. Complements the inline trailing-comment marker grammar (`code-highlight-marking`), which continues to apply to code blocks typed directly in `slides.md`.

## Requirements

### Requirement: Anchor declarations mark highlights in file-sourced snippets without touching the source file
A presenter SHALL be able to attach a highlight (and optional callout) to a fragment of a `<<<`-imported code snippet by writing an anchor declaration line in `slides.md` immediately following the `<<<` import, without adding any marker text to the imported file itself. Each declaration produces the same highlight/callout rendering as an inline `// [!mark]` marker (see `code-highlight-marking`, `code-highlight-callouts`).

#### Scenario: Anchor declaration produces a highlight with no source-file changes
- **WHEN** a `<<<` import is followed by `[!mark:"GestorNotas("] Injects the DB dependency`
- **THEN** the matched text `GestorNotas(` in the rendered snippet is highlighted with a callout reading "Injects the DB dependency", and the imported file on disk contains no marker text

### Requirement: Slice-relative line anchors
The anchor grammar SHALL support targeting a line by its position within the rendered (post-`{line-range}`-slicing) snippet, using `[!mark:N]` for a single line or `[!mark:N..M]` for an inclusive range, where `N`/`M` count from 1 within the snippet as displayed, not the original file's line numbers.

#### Scenario: Single line anchor by slice-relative position
- **WHEN** a snippet renders 7 lines and the declaration is `[!mark:3] comment`
- **THEN** the 3rd line of the rendered snippet is highlighted with that comment

#### Scenario: Line range anchor
- **WHEN** the declaration is `[!mark:2..5] comment`
- **THEN** lines 2 through 5 of the rendered snippet are highlighted as a single highlight with that comment

### Requirement: Content anchors locate a highlight by searching snippet text
The anchor grammar SHALL support targeting a fragment by its literal text instead of a line number, using `[!mark:"text"]`, where `"text"` is searched for as a plain substring within the rendered snippet. By default (no explicit substring range), the highlight SHALL cover exactly the matched text, not the whole line it occurs on. A content anchor SHALL additionally support overriding this to a different substring of the matched line with `[!mark:"text"(start-end)]`, where `start`/`end` are 0-based, end-exclusive character offsets into the matched line, matching the existing substring convention used by inline markers.

#### Scenario: Content anchor highlights exactly the matched text
- **WHEN** the rendered snippet contains a line `List<Float> notas = alumnos.getNotasAlumno(idAlumno);` and the declaration is `[!mark:"getNotasAlumno(idAlumno)"] comment`
- **THEN** only the text `getNotasAlumno(idAlumno)` is highlighted, not the whole line

#### Scenario: Explicit substring range overrides the default matched-text range
- **WHEN** the declaration is `[!mark:"this.alumnos = alumnos"(0-12)] comment`
- **THEN** characters 0 through 11 of the matched line are highlighted instead of the anchor text's own span

### Requirement: Content anchor ranges span from one anchor to another
The anchor grammar SHALL support defining a multi-line range by two content anchors (`[!mark:"a".."b"]`), highlighting from the line containing the first match through the line containing the second match inclusive, or by one content anchor plus a line-count offset (`[!mark:"a"+N]`), highlighting from the matched line through N additional lines.

#### Scenario: Range between two content anchors
- **WHEN** the rendered snippet contains `float suma = 0.0f;` followed later by `return suma / notas.size();`, and the declaration is `[!mark:"float suma = 0.0f;".."return suma / notas.size();"] comment`
- **THEN** every line from the first match through the second match, inclusive, is highlighted as a single highlight with that comment

#### Scenario: Range via anchor plus offset
- **WHEN** the declaration is `[!mark:"float suma = 0.0f;"+3] comment`
- **THEN** the matched line and the 3 lines following it are highlighted as a single highlight with that comment

### Requirement: Occurrence selection disambiguates repeated content anchors
When a content anchor's text matches more than one location in the rendered snippet, the Nth match SHALL be selectable with a `#N` suffix (1-based), and every match SHALL be selectable at once with a `#*` suffix, producing one highlight per match (each rendering its own callout if the declaration has comment text).

#### Scenario: Selecting a specific occurrence
- **WHEN** the text `nota` appears 3 times in the rendered snippet and the declaration is `[!mark:"nota"#2] comment`
- **THEN** only the line containing the 2nd occurrence of `nota` is highlighted with that comment

#### Scenario: Selecting all occurrences
- **WHEN** the text `nota` appears 3 times in the rendered snippet and the declaration is `[!mark:"nota"#*] comment`
- **THEN** all 3 occurrences are each highlighted, each with a callout showing that comment

### Requirement: Unresolved or ambiguous anchors degrade without breaking the slide
If a content anchor's text is not found in the rendered snippet, that anchor's highlight and callout SHALL be omitted (not rendered) and a console warning SHALL be logged identifying the slide and the anchor text, without failing the build or blocking the dev server. If a content anchor without an occurrence selector matches more than once, the first match SHALL be used and a console warning SHALL be logged noting the ambiguity. If an explicit `#N` selector exceeds the number of matches, this SHALL be treated as an authoring error and reported accordingly (fail loud, distinct from the silent-drift case).

#### Scenario: Anchor text no longer present
- **WHEN** a declaration's anchor text does not appear anywhere in the rendered snippet
- **THEN** no highlight or callout is rendered for that declaration, a console warning is logged, and the rest of the slide renders normally

#### Scenario: Ambiguous anchor without a selector
- **WHEN** a declaration's anchor text matches more than one location and no `#N`/`#*` selector is given
- **THEN** the first match is highlighted, and a console warning is logged noting multiple matches were found

#### Scenario: Explicit occurrence index out of range
- **WHEN** a declaration is `[!mark:"nota"#5]` but `nota` only occurs 3 times
- **THEN** this is reported as an authoring error rather than silently falling back to a nearby match

### Requirement: Inline marker grammar is unaffected
Code blocks that are typed directly in `slides.md` (not sourced via `<<<` import) SHALL continue to use the existing trailing-comment marker grammar defined by `code-highlight-marking`, unchanged by the introduction of anchor declarations.

#### Scenario: Inline block still uses trailing-comment markers
- **WHEN** a fenced code block is typed directly in `slides.md` with a trailing `// [!mark]` comment
- **THEN** it is parsed and rendered exactly as before, with no anchor-declaration syntax involved
