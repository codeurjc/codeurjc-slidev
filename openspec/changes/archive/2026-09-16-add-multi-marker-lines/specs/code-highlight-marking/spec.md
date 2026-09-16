## MODIFIED Requirements

### Requirement: Inline marker syntax identifies a highlight
A presenter SHALL be able to mark a fragment of code inside a fenced code block by adding a trailing marker comment `// [!mark]` (or the language's equivalent comment syntax) to the target line. Highlights carry no presenter-chosen id — the transformer assigns one internally, by encounter order within the code block, purely for DOM grouping and position bookkeeping.

A line's trailing comment MAY contain several markers. Each marker's comment body is the text following its `]` up to the next `[!mark` on that line, or to end of line for the last marker. A marker comment therefore cannot contain the literal text `[!mark`; a comment written that way SHALL split at that point rather than being reported as an error.

The rendered code is unaffected by how many markers a line carries: everything from the comment token onward SHALL be stripped, exactly as for a single marker.

#### Scenario: Single line marked with a comment
- **WHEN** a fenced code block contains a line ending in `// [!mark] Injects the DB dependency`
- **THEN** that line is recognized as a highlight with comment text "Injects the DB dependency", and the marker text itself is not shown in the rendered code

#### Scenario: Two markers on one line
- **WHEN** a line reads `    steps:      # [!mark(4-10)] Los pasos [!mark:end]`
- **THEN** two highlights are produced for that line — a substring highlight with comment "Los pasos" and the range closed by the `:end` marker — and the rendered line is `    steps:` with no marker text

#### Scenario: Comment body ends at the next marker
- **WHEN** a line carries `# [!mark] First note [!mark(0-4)] Second note`
- **THEN** the first highlight's comment is "First note" and the second highlight's comment is "Second note"

### Requirement: Multi-line ranges via start/end markers
A presenter SHALL be able to highlight a contiguous range of lines by placing `// [!mark:start]` on the first line and `// [!mark:end]` on the last line of the range. Pairing is nearest-unclosed-start-first (like matching brackets), so ranges can nest. When one line carries several markers, they are processed left to right, so several ranges MAY end (or start) on the same line and the innermost range closes first.

#### Scenario: Range spans multiple lines
- **WHEN** a code block has `// [!mark:start]` on line 5 and `// [!mark:end]` on line 8
- **THEN** lines 5 through 8 inclusive are rendered as a single highlight

#### Scenario: Dangling end marker with no matching start
- **WHEN** a code block contains `// [!mark:end]` with no preceding unclosed `// [!mark:start]`
- **THEN** the marker is ignored and no highlight is produced for it

#### Scenario: Nested ranges ending on the same line
- **WHEN** a block opens a range on line 0, opens a second range on line 4, and line 8 reads `      - run: mvn test    # [!mark:end] [!mark:end]`
- **THEN** two range highlights are produced, lines 4–8 (closed by the first `:end`) and lines 0–8 (closed by the second), and neither is discarded

## ADDED Requirements

### Requirement: Overlapping substring ranges on one line are skipped
When two substring markers on the same line specify character ranges that overlap, only the first SHALL produce a highlight; the second SHALL be skipped and a console warning SHALL name the line and the skipped range. Substring ranges on the same line that do not overlap SHALL both produce highlights.

#### Scenario: Overlapping ranges warn and skip
- **WHEN** a line carries `# [!mark(0-10)] A [!mark(5-15)] B`
- **THEN** only the `0-10` highlight is rendered, and a console warning reports that the `5-15` range overlaps an existing highlight on that line

#### Scenario: Disjoint ranges on one line both render
- **WHEN** a line carries `# [!mark(0-4)] A [!mark(6-12)] B`
- **THEN** both substrings are highlighted, each with its own callout
