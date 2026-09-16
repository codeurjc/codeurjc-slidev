## MODIFIED Requirements

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
