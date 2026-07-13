## Purpose

TBD - defines how highlighted code fragments (see `code-highlight-marking`) get connected callout boxes with comment text, auto-placed relative to the code block and each other, joined by elbow-style connector lines, with support for manual position overrides in the layout editor.

## Requirements

### Requirement: Each highlight renders a connected callout box
Every highlight defined via the `code-highlight-marking` capability that has non-empty comment text SHALL render a callout box displaying that comment, connected to its highlighted fragment by an elbow-style (axis-aligned, two- or three-segment) connector line.

#### Scenario: Highlight with comment produces a callout
- **WHEN** a highlight `ctor-dep` has comment text "Injects the DB dependency"
- **THEN** a callout box containing that text is rendered on the slide, with a connector line running from the box to the highlighted fragment

#### Scenario: Highlight without comment produces no callout
- **WHEN** a marker has no trailing comment text
- **THEN** the fragment is still rendered with the highlight style, but no callout box or connector is rendered for it

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

#### Scenario: Dragging a callout overrides auto-placement
- **WHEN** a presenter drags a callout box to a new location in editor mode
- **THEN** the connector redraws to the new position in real time, and reopening the slide after saving shows the callout at the dragged position rather than its auto-placed default

#### Scenario: Editing code does not detach an overridden callout
- **WHEN** a callout's position has been manually overridden and the presenter later edits unrelated lines in the same code block (not changing the highlight's id)
- **THEN** the callout keeps its overridden position and remains connected to the correct highlight
