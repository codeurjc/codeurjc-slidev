## Purpose

TBD - defines how highlighted code fragments (see `code-highlight-marking`) get connected callout boxes with comment text, auto-placed relative to the code block and each other, joined by elbow-style connector lines, with support for manual position overrides in the layout editor.

## Requirements

### Requirement: Each highlight renders a connected callout box
Every highlight — whether defined via the `code-highlight-marking` capability's inline trailing-comment markers, or via the `external-highlight-anchors` capability's anchor declarations on a `<<<`-imported snippet — that has non-empty comment text SHALL render a callout box displaying that comment, connected to its highlighted fragment by an elbow-style (axis-aligned, two- or three-segment) connector line.

#### Scenario: Highlight with comment produces a callout
- **WHEN** a highlight `ctor-dep` has comment text "Injects the DB dependency"
- **THEN** a callout box containing that text is rendered on the slide, with a connector line running from the box to the highlighted fragment

#### Scenario: Highlight without comment produces no callout
- **WHEN** a marker has no trailing comment text
- **THEN** the fragment is still rendered with the highlight style, but no callout box or connector is rendered for it

#### Scenario: Anchor-declared highlight on a file-sourced snippet produces a callout
- **WHEN** a `<<<`-imported snippet has an anchor declaration `[!mark:"this.alumnos = alumnos"] Injects the DB dependency`
- **THEN** a callout box containing that comment is rendered, connected to the matched line by the same elbow-connector mechanism used for inline markers

### Requirement: Callouts are auto-placed to avoid the code block and each other
By default, each callout's position SHALL be computed automatically by trying candidate zones relative to the code block — right, left, below, above, in that order — and selecting the first candidate whose bounding box does not overlap the code block or any other already-placed callout on the same slide.

#### Scenario: Single highlight places callout beside the code
- **WHEN** a code block has one highlight and comment, and horizontal space is available
- **THEN** the callout is placed to the right (or left, if right lacks room) of the code block, not overlapping it

#### Scenario: Multiple highlights avoid overlapping each other
- **WHEN** a code block has two or more highlights with comments
- **THEN** each callout's auto-placed bounding box does not overlap any other callout's bounding box on the same slide

#### Scenario: No candidate zone has room
- **WHEN** none of the right/left/below/above candidates for a callout are collision-free
- **THEN** the callout stacks within the least-crowded candidate zone rather than being omitted, and its connector still routes to the correct highlight

### Requirement: Elbow connector never crosses the code block's text area
The connector between a callout and its highlight SHALL be routed as an axis-aligned elbow (one bend minimum, at most two bends) that does not pass through the code block's bounding box except at the single point where it meets the highlighted fragment.

#### Scenario: Connector routes around the code block
- **WHEN** a callout is placed to the right of the code block
- **THEN** the connector's path stays outside the code block's bounding box until it reaches the highlighted fragment's edge

### Requirement: Callout position can be manually overridden in editor mode
In layout-editor mode, a presenter SHALL be able to drag a callout box to a new position; the connector SHALL recompute live to follow the moved box, and the overridden position SHALL persist across saves and reloads, taking precedence over auto-placement for that highlight id.

The persisted override SHALL be written to the marker the dragged callout belongs to, identified by the slide the callout is on, which occurrence of that source line within the slide it is, and which marker within that line it is. When a callout's marker cannot be located that way (for example because the markdown changed since the slide was parsed), the override SHALL fall back to the first matching source line in the file, and a failed save SHALL leave the dragged position in effect for the session rather than raising an error to the presenter.

#### Scenario: Dragging a callout overrides auto-placement
- **WHEN** a presenter drags a callout box to a new location in editor mode
- **THEN** the connector redraws to the new position in real time, and reopening the slide after saving shows the callout at the dragged position rather than its auto-placed default

#### Scenario: Editing code does not detach an overridden callout
- **WHEN** a callout's position has been manually overridden and the presenter later edits unrelated lines in the same code block (not changing the highlight's id)
- **THEN** the callout keeps its overridden position and remains connected to the correct highlight

#### Scenario: Dragging one callout of a line that carries two markers
- **WHEN** a line carries two markers and the presenter drags the callout belonging to the second one
- **THEN** the `@x,y` override is written into the second marker, and the first marker is left unchanged

#### Scenario: Identical marked lines in different slides
- **WHEN** two slides in the same markdown file contain an identical marked source line, and the presenter drags the callout on the second slide
- **THEN** the override is written into that slide's own line, and the first slide's callout keeps its position
