## Purpose

TBD - defines the inline marker syntax presenters use inside fenced code blocks to mark lines, ranges, or substrings for persistent highlight styling, independent of Slidev's native click-step highlighting, with markers stripped from rendered output.

## Requirements

### Requirement: Inline marker syntax identifies a highlight
A presenter SHALL be able to mark a fragment of code inside a fenced code block by adding a trailing marker comment `// [!mark]` (or the language's equivalent comment syntax) to the target line. Highlights carry no presenter-chosen id — the transformer assigns one internally, by encounter order within the code block, purely for DOM grouping and position bookkeeping. Any text following the marker on the same line is the highlight's comment body.

#### Scenario: Single line marked with a comment
- **WHEN** a fenced code block contains a line ending in `// [!mark] Injects the DB dependency`
- **THEN** that line is recognized as a highlight with comment text "Injects the DB dependency", and the marker text itself is not shown in the rendered code

### Requirement: Multi-line ranges via start/end markers
A presenter SHALL be able to highlight a contiguous range of lines by placing `// [!mark:start]` on the first line and `// [!mark:end]` on the last line of the range. Pairing is nearest-unclosed-start-first (like matching brackets), so ranges can nest.

#### Scenario: Range spans multiple lines
- **WHEN** a code block has `// [!mark:start]` on line 5 and `// [!mark:end]` on line 8
- **THEN** lines 5 through 8 inclusive are rendered as a single highlight

#### Scenario: Dangling end marker with no matching start
- **WHEN** a code block contains `// [!mark:end]` with no preceding unclosed `// [!mark:start]`
- **THEN** the marker is ignored and no highlight is produced for it

### Requirement: Sub-line substring marking
A presenter SHALL be able to highlight only a portion of a line by including a parenthesized character range in the marker: `// [!mark(<start>-<end>)]`, where `<start>` and `<end>` are 0-based, end-exclusive character indexes into the source line (counting the line's own characters, including leading whitespace, not the rendered/Shiki-wrapped HTML). The transformer highlights exactly that character range rather than the whole line.

#### Scenario: Substring highlighted instead of full line
- **WHEN** a line reads `alumnos.getNotasAlumno(idAlumno); // [!mark(8-32)] Fetches raw scores`
- **THEN** only the text `getNotasAlumno(idAlumno)` (characters 8 through 31) is rendered with the highlight style, not the full line

### Requirement: Highlighted fragments render with a distinct persistent style
Marked fragments (whole-line, ranged, or substring) SHALL render with a background/emphasis style that is visually distinct from Slidev's native `{n-m}` click-step dim/undim highlighting, and SHALL remain visible regardless of click-step state (it is not step-gated).

#### Scenario: Highlight visible without any click steps
- **WHEN** a slide with a marked highlight is shown before any click-step interaction
- **THEN** the marked fragment already displays its highlight style

### Requirement: Marker syntax is stripped from rendered output
The marker comment SHALL never appear in the rendered slide, regardless of highlight type (line, range, or substring).

#### Scenario: Marker text not visible in output
- **WHEN** a code block contains `// [!mark] Injects the DB dependency`
- **THEN** the rendered line shows the original code content only, with no visible `[!mark...]` text
