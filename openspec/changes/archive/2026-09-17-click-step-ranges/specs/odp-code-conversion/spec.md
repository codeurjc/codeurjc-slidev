## MODIFIED Requirements

### Requirement: Code build-ups become callout click steps
When the build-up rule merges consecutive slides showing the same code, each highlight and its callout SHALL get the step of the merged slides it appears on, where slide k of the run is click k (0 for the first slide, 1 for the second, …):
- on every slide of the run: no step;
- from slide a (a ≥ 1) to the last slide: `{a}`;
- from the first slide to slide b, not the last: `{-b}`;
- from slide a (a ≥ 1) to slide b, not the last: `{a-b}`.

A highlight that is missing from a slide between two slides that show it SHALL prevent the merge.

#### Scenario: Three-slide code build-up
- **WHEN** three consecutive slides show the same code, the second adds one callout and the third adds another
- **THEN** the merged slide's callout from the second slide carries `{1}` and the one from the third slide carries `{2}`

#### Scenario: Three-slide walk-through
- **WHEN** three consecutive slides show the same code with one callout each, on lines 3, 5 and 8 in that order
- **THEN** the merged slide's callouts carry `{-0}` (line 3), `{1-1}` (line 5) and `{2}` (line 8), and the slide has 2 clicks

#### Scenario: A highlight that returns keeps the slides apart
- **WHEN** three consecutive slides show the same code, and a callout on line 3 is on the first and third slides but not the second
- **THEN** the slides are not merged into one, and the console warns that the build-up couldn't be converted
