## MODIFIED Requirements

### Requirement: Slide frontmatter declares callouts
A `default`-layout slide's frontmatter SHALL accept a `callouts` list. Each entry SHALL have an `at` anchor, and MAY have `text` (the callout's comment), `box` (`{x, y}` in slide-canvas pixels, pinning the box instead of auto-placing it) and `step` (a click step: a positive integer, or a step range written as a string, `2-4`, `2-`, `-1` or `-0`, with the same meaning as a code highlight's step range). An entry that is not an object, or whose anchor is invalid, SHALL be ignored with a console warning naming the slide and the entry, leaving the slide's other callouts unaffected. An invalid `step` SHALL be reported with a console warning and treated as no step.

#### Scenario: A callout is declared and rendered
- **WHEN** a slide declares `callouts: [{at: {x: 480, y: 210}, text: "Mira aquí"}]`
- **THEN** a callout box reading "Mira aquí" renders on that slide, connected to the point (480, 210)

#### Scenario: One invalid entry doesn't affect the others
- **WHEN** a slide declares two callouts and the first has no `at`
- **THEN** the first is skipped with a console warning, and the second renders normally

#### Scenario: A step range as a YAML string
- **WHEN** a callout declares `step: 2-4`
- **THEN** its step range is clicks 2 through 4

### Requirement: Callouts can be revealed by click step
A callout with a `step` SHALL be hidden — box, connector and arrowhead — outside its step or step range, exactly as a code highlight's suffix behaves: from click N on for `step: N`, clicks N through M for `step: N-M`, and from click 0 through M for `step: -M`. The clicks at which callouts change (each start, and M+1 for a range ending at M) SHALL count toward the slide's total clicks, and `slidev export --with-clicks` SHALL export one page per click.

#### Scenario: Stepped callout appears on its click
- **WHEN** a slide has one unstepped callout and one with `step: 1`, and the presenter advances one click
- **THEN** the first is visible from click 0 and the second appears at click 1

#### Scenario: A callout step is the slide's only click
- **WHEN** a slide's only click source is a callout with `step: 2`
- **THEN** the slide has 2 clicks, and advancing twice reveals the callout before moving to the next slide

#### Scenario: A ranged callout disappears
- **WHEN** a slide's only click source is a callout with `step: -1`
- **THEN** the callout is visible at clicks 0 and 1, hidden at click 2, and the slide has 2 clicks
