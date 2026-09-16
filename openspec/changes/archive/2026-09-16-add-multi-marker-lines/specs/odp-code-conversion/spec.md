## MODIFIED Requirements

### Requirement: Code annotations become highlights and callouts
The importer SHALL convert annotations drawn over a code block into highlights and callouts, as follows:
- A rectangle containing the vertical centers of one or more non-blank code lines, by a margin of at least 0.15 line height, SHALL become a line or line-range highlight over those lines.
- A rectangle narrower than the code block, spanning one line, SHALL become a substring highlight, with its character range derived from the monospace column width.
- A text box connected to a highlight rectangle by an arrow or connector, or a short label placed inside the rectangle near its top edge, SHALL become that highlight's callout comment.
- A rectangle framing the whole code block SHALL become a whole-block range highlight only when it carries a label, and SHALL otherwise be ignored without a loss.
- A text box connected by an arrow straight into the code block SHALL become a line highlight on the non-blank line nearest the arrow's endpoint.
- A callout's ODP position SHALL become its `@x,y` override, mapped to slide-canvas pixels.
- Nested rectangles SHALL become nested ranges.

For snippet imports these are written as anchor declaration lines (`[!mark:N..M]`, `[!mark:"text"]`); for hand-typed fences, as inline `// [!mark…]` markers. Several marks that need the same line SHALL all be written to it as consecutive markers in that line's trailing comment, ordered so that range ends come first, innermost first, then single-line and substring marks, then range starts. Rectangles that contain no line center, and callouts that can't be paired, SHALL be recorded as losses.

#### Scenario: Nested workflow/job boxes on YAML
- **WHEN** a YAML code shape is overlaid by an outer rectangle spanning all lines labeled "WORKFLOW" and an inner rectangle spanning the job's lines labeled "JOB"
- **THEN** the importer produces a range highlight with comment "WORKFLOW" covering all lines, and a nested range highlight with comment "JOB" covering the job's lines
- **AND** when both ranges end on the same line of a hand-typed fence, that line carries both `:end` markers and neither range is recorded as a loss

#### Scenario: Callout connected by an arrow to a substring box
- **WHEN** a narrow rectangle surrounds `steps:` on one line and an arrow connects it to a text box "Cada Job se ejecuta en un runner"
- **THEN** a substring highlight covering `steps:` is emitted with that comment and an `@x,y` override matching the text box's mapped position

#### Scenario: Substring mark on a line that also ends a range
- **WHEN** a substring callout and a range end fall on the same line of a hand-typed fence
- **THEN** both are written to that line, and no "another marker already uses that line" loss is recorded

#### Scenario: Misaligned rectangle recorded as a loss
- **WHEN** a highlight rectangle is drawn between two code lines without containing either line's vertical center
- **THEN** no highlight is emitted for it, and a loss "highlight box not aligned to code lines" is recorded for that slide
