## Purpose

TBD - defines the inline marker syntax presenters use inside fenced code blocks to mark lines, ranges, or substrings for persistent highlight styling, independent of Slidev's native click-step highlighting, with markers stripped from rendered output.

## Requirements

### Requirement: Inline marker syntax identifies a highlight
A presenter SHALL be able to mark a fragment of code inside a fenced code block by adding a trailing marker comment `// [!mark:<id>]` (or the language's equivalent comment syntax) to the target line, where `<id>` is a presenter-chosen slug unique within that code block. Any text following the marker on the same line is the highlight's comment body.

#### Scenario: Single line marked with a comment
- **WHEN** a fenced code block contains a line ending in `// [!mark:ctor-dep] Injects the DB dependency`
- **THEN** that line is recognized as highlight `ctor-dep` with comment text "Injects the DB dependency", and the marker text itself is not shown in the rendered code

#### Scenario: Duplicate id within the same code block
- **WHEN** two lines in the same fenced code block use the same highlight id
- **THEN** the transformer treats this as a range start/end pair if both `:start`/`:end` suffixes are present, otherwise the second occurrence is ignored and the highlight keeps the first line's bounds

### Requirement: Multi-line ranges via start/end markers
A presenter SHALL be able to highlight a contiguous range of lines by placing `// [!mark:<id>:start]` on the first line and `// [!mark:<id>:end]` on the last line of the range, both sharing the same id.

#### Scenario: Range spans multiple lines
- **WHEN** a code block has `// [!mark:loop:start]` on line 5 and `// [!mark:loop:end]` on line 8
- **THEN** lines 5 through 8 inclusive are rendered as a single highlight with id `loop`

### Requirement: Sub-line substring marking
A presenter SHALL be able to highlight only a portion of a line by including a parenthesized match target in the marker: `// [!mark:<id>(<substring>)]`. The transformer highlights the first occurrence of `<substring>` on that line rather than the whole line.

#### Scenario: Substring highlighted instead of full line
- **WHEN** a line reads `alumnos.getNotasAlumno(idAlumno); // [!mark:fetch(getNotasAlumno(idAlumno))] Fetches raw scores`
- **THEN** only the text `getNotasAlumno(idAlumno)` is rendered with the highlight style, not the full line

### Requirement: Highlighted fragments render with a distinct persistent style
Marked fragments (whole-line, ranged, or substring) SHALL render with a background/emphasis style that is visually distinct from Slidev's native `{n-m}` click-step dim/undim highlighting, and SHALL remain visible regardless of click-step state (it is not step-gated).

#### Scenario: Highlight visible without any click steps
- **WHEN** a slide with a marked highlight is shown before any click-step interaction
- **THEN** the marked fragment already displays its highlight style

### Requirement: Marker syntax is stripped from rendered output
The marker comment SHALL never appear in the rendered slide, regardless of highlight type (line, range, or substring).

#### Scenario: Marker text not visible in output
- **WHEN** a code block contains `// [!mark:ctor-dep] Injects the DB dependency`
- **THEN** the rendered line shows the original code content only, with no visible `[!mark:...]` text
