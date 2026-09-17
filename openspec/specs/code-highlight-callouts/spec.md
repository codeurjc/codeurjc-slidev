## Purpose

TBD - defines how highlighted code fragments (see `code-highlight-marking`) get connected callout boxes with comment text, auto-placed relative to the code block and each other, joined by connector lines in the slide's callout style (straight arrows into the box by default, or elbows), with support for manual position overrides in the layout editor.

## Requirements

### Requirement: Each highlight renders a connected callout box
Every highlight — whether defined via the `code-highlight-marking` capability's inline trailing-comment markers, or via the `external-highlight-anchors` capability's anchor declarations on a `<<<`-imported snippet — that has non-empty comment text SHALL render a callout box displaying that comment, connected to its highlighted fragment by a connector in the slide's callout style: a straight arrow into the box (`arrow`, the default) or an axis-aligned elbow (`elbow`).

#### Scenario: Highlight with comment produces a callout
- **WHEN** a highlight `ctor-dep` has comment text "Injects the DB dependency"
- **THEN** a callout box containing that text is rendered on the slide, with a connector line running from the highlighted fragment to the box

#### Scenario: Highlight without comment produces no callout
- **WHEN** a marker has no trailing comment text
- **THEN** the fragment is still rendered with the highlight style, but no callout box or connector is rendered for it

#### Scenario: Anchor-declared highlight on a file-sourced snippet produces a callout
- **WHEN** a `<<<`-imported snippet has an anchor declaration `[!mark:"this.alumnos = alumnos"] Injects the DB dependency`
- **THEN** a callout box containing that comment is rendered, connected to the matched line by the same connector mechanism used for inline markers

### Requirement: Callouts are auto-placed to avoid the code block and each other
By default, each callout's position SHALL be computed automatically by trying candidate zones relative to the code block — right, left, below, above, in that order — and selecting the first candidate whose bounding box does not overlap the code block or any other already-placed callout on the same slide.

On an `arrow` slide, the auto-placed callouts that end up on the same side of the same code block SHALL then be stacked in the order of their highlights: top to bottom on the right and left sides, left to right above and below. Each box SHALL sit level with its highlight when that doesn't overlap the box before it in the stack, and just past that box otherwise; a stack that would run past the slide's edge SHALL be moved back inside it. Callouts whose click-step ranges share no click SHALL NOT constrain each other in a stack, and callouts with a position override SHALL keep their position and be avoided. On an `elbow` slide, placement SHALL stay as the first paragraph describes.

#### Scenario: Single highlight places callout beside the code
- **WHEN** a code block has one highlight and comment, and horizontal space is available
- **THEN** the callout is placed to the right (or left, if right lacks room) of the code block, not overlapping it

#### Scenario: Multiple highlights avoid overlapping each other
- **WHEN** a code block has two or more highlights with comments
- **THEN** each callout's auto-placed bounding box does not overlap any other callout's bounding box on the same slide

#### Scenario: No candidate zone has room
- **WHEN** none of the right/left/below/above candidates for a callout are collision-free
- **THEN** the callout stacks within the least-crowded candidate zone rather than being omitted, and its connector still routes to the correct highlight

#### Scenario: Boxes follow their highlights' order on an arrow slide
- **WHEN** an `arrow` slide has a code block with highlights on lines 3, 5 and 8, whose callouts all go to the right of the block and would overlap if each sat level with its line
- **THEN** the three boxes are stacked top to bottom in the order line 3, line 5, line 8, without overlapping

#### Scenario: Elbow slides keep greedy placement
- **WHEN** the same code block and highlights are on a slide with `calloutStyle: elbow`
- **THEN** the boxes are placed exactly as the first-fit placement without reordering puts them

### Requirement: Elbow connector never crosses the code block's text area
On an `elbow` slide, the connector between a callout and its highlight SHALL be routed as an axis-aligned elbow (one bend minimum, at most two bends) that does not pass through the code block's bounding box except at the single point where it meets the highlighted fragment. The connector SHALL end in an arrowhead at the highlighted fragment, pointing at the fragment rather than at the callout box, matching how slide callouts point at their anchors on `elbow` slides.

#### Scenario: Connector routes around the code block
- **WHEN** a callout on an `elbow` slide is placed to the right of the code block
- **THEN** the connector's path stays outside the code block's bounding box until it reaches the highlighted fragment's edge

#### Scenario: Arrowhead points at the highlighted fragment
- **WHEN** a callout on an `elbow` slide is connected to a highlighted fragment
- **THEN** an arrowhead is rendered where the connector meets the fragment, oriented towards it, and no arrowhead is drawn at the callout box's end

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

### Requirement: Slides choose a callout connector style
A slide's callouts, both code callouts and slide callouts, SHALL use the connector style named by the slide's `calloutStyle` frontmatter: `arrow` (the default when absent) or `elbow`. A deck-wide default SHALL be settable through the headmatter's `defaults:` (`defaults: { calloutStyle: elbow }`), and a slide's own `calloutStyle` SHALL take precedence over it. Any other value SHALL be treated as `arrow`, with a console warning naming the slide.

#### Scenario: Default style is arrow
- **WHEN** a slide with a code callout has no `calloutStyle` in its frontmatter or in the headmatter's `defaults:`
- **THEN** its connector is drawn in the `arrow` style

#### Scenario: A slide opts into elbow
- **WHEN** a slide's frontmatter declares `calloutStyle: elbow`
- **THEN** its connectors are drawn in the `elbow` style, and other slides keep the `arrow` style

#### Scenario: Deck-wide elbow through defaults
- **WHEN** the headmatter declares `defaults: { calloutStyle: elbow }` and one slide declares `calloutStyle: arrow`
- **THEN** every slide uses `elbow` except that one, which uses `arrow`

### Requirement: Arrow connectors point straight into the box
On an `arrow` slide, a callout's connector SHALL be one straight segment:
- it starts at the highlighted fragment's edge facing the callout box (a slide callout's anchor point);
- it ends on the callout box's border, where the straight line from the box's centre to that start point crosses the border;
- it ends in an arrowhead at the box, pointing into it, larger than the `elbow` style's arrowhead, unless the segment is shorter than 30 pixels, in which case it is drawn as a plain line so the head doesn't cover it;
- it has no marker at the highlight end.

To leave room for the head, auto-placement on an `arrow` slide SHALL keep callout boxes 36 pixels away from the code block or element they're placed around (instead of 12).

#### Scenario: A box pinned right next to its anchor
- **WHEN** a callout's box is pinned so close to its anchor that the connector is shorter than 30 pixels
- **THEN** the connector is drawn as a plain line with no arrowhead

#### Scenario: Arrow from a highlight to its box
- **WHEN** a code callout is placed to the right of its code block on an `arrow` slide
- **THEN** its connector is a single straight segment from the highlight's right edge to the box's border, with the arrowhead at the border pointing into the box and nothing drawn at the highlight end
