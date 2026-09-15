# callout-click-steps

## Purpose

Lets code-highlight markers and anchor declarations carry a `{N}` click-step suffix, so a highlight, its callout and its connector stay hidden until the slide reaches click N. Steps count toward the slide's clicks, keep callout placement stable across clicks, stay fully visible in editor mode, and export as one page per step with `slidev export --with-clicks`.

## Requirements

### Requirement: Inline markers accept a click-step suffix
An inline highlight marker SHALL accept an optional click-step suffix `{N}`, where N is a positive integer. It goes after the marker's role (`:start`/`:end`) and substring range (`(<start>-<end>)`), and before any `@x,y` position override: `// [!mark{2}] comment`, `// [!mark:start{3}]`, `// [!mark(2-16){2}@120,40] comment`. For a `:start`…`:end` range, a suffix on either marker applies to the whole range; if both carry one, the `:start` marker's wins. The suffix SHALL be stripped from the rendered code together with the rest of the marker.

#### Scenario: Whole-line marker with a click step
- **WHEN** a fenced code block contains `this.alumnos = alumnos; // [!mark{2}] Stores the dependency`
- **THEN** a highlight is created for that line with click step 2 and comment "Stores the dependency", and the rendered code shows `this.alumnos = alumnos;` with no marker text

#### Scenario: Range with the step on the start marker
- **WHEN** a block contains `// [!mark:start{3}] Loop` on one line and `// [!mark:end]` three lines later
- **THEN** one range highlight covering those lines is created with click step 3

#### Scenario: Suffix combined with substring range and position override
- **WHEN** a line carries `// [!mark(2-16){2}@120,40] Just the substring`
- **THEN** the highlight covers characters 2–16 of that line, has click step 2, and its callout is pinned at (120, 40)

### Requirement: Anchor declarations accept a click-step suffix
An external anchor declaration line after a `<<<` import SHALL accept the same optional `{N}` suffix. It goes after the anchor target, including any substring range, offset range, or occurrence selector (`#N`/`#*`), and before any `@x,y` override: `[!mark:3{2}] comment`, `[!mark:"text"#2{3}] comment`, `[!mark:"a".."b"{2}@120,40] comment`. With `#*`, every matched highlight SHALL share that click step.

#### Scenario: Line anchor with a click step
- **WHEN** a `<<<` import is followed by `[!mark:5{2}] Returns the average`
- **THEN** line 5 of the rendered snippet is highlighted with click step 2 and comment "Returns the average"

#### Scenario: All-occurrences anchor shares one step
- **WHEN** a `<<<` import is followed by `[!mark:"assertEquals"#*{4}] Assertion`
- **THEN** every occurrence of `assertEquals` is highlighted, each with its own callout, and all of them have click step 4

### Requirement: A stepped highlight is hidden until its click step
A highlight with click step N SHALL render with no highlight styling, no callout box, and no connector while the slide's current click is below N. From click N onward, for the rest of that slide, it SHALL render exactly as an unstepped highlight. Highlights without a suffix SHALL be visible at every click, as before. Highlights sharing a step SHALL appear together.

#### Scenario: Step reveals on its click and stays
- **WHEN** a slide has one code block with an unstepped highlight A, a highlight B at step 1, and a highlight C at step 2, and the presenter advances from click 0 to click 2
- **THEN** at click 0 only A is visible; at click 1, A and B are visible; at click 2, A, B and C are visible

#### Scenario: Two highlights share a step
- **WHEN** highlights B and C both have click step 1
- **THEN** both become visible together on click 1

### Requirement: Callout click steps count toward the slide's clicks
The highest click step used by a slide's highlights SHALL count toward that slide's total number of clicks, together with any other click-driven content on the slide, so the presenter reveals every step before advancing to the next slide.

#### Scenario: Presenter must reveal all steps before the next slide
- **WHEN** a slide has no other click-driven content and its highlights use steps 1, 2 and 3
- **THEN** pressing "next" three times reveals the steps one by one, and only the fourth "next" moves to the following slide

### Requirement: Callout positions stay stable across steps
Auto-placement SHALL position every callout of a code block (stepped and unstepped) as if all were visible, so revealing a step never moves callouts that are already visible.

#### Scenario: Revealing a step doesn't move earlier callouts
- **WHEN** a slide at click 1 shows callout B, and advancing to click 2 reveals callout C next to the same code block
- **THEN** callout B's rendered position is identical at click 1 and click 2

### Requirement: Editor mode shows all callouts regardless of the current click
While the layout editor is active, every highlight and callout on the slide SHALL be visible and draggable, whatever the current click. Dragging a stepped callout SHALL persist its `@x,y` override while keeping its `{N}` suffix unchanged.

#### Scenario: Dragging a stepped callout keeps its step
- **WHEN** the editor is active at click 0 on a slide containing `// [!mark{2}] Note`, and the user drags that callout to (200, 60)
- **THEN** the callout was visible and draggable at click 0, and the marker in the markdown now reads `// [!mark{2}@200,60] Note`

### Requirement: Exporting with clicks shows each step
Exporting the presentation with click steps (`slidev export --with-clicks`) SHALL produce one page per click step of a slide with callout steps, each page showing exactly the highlights visible at that click.

#### Scenario: PDF export pages per step
- **WHEN** a slide with highlights at steps 1 and 2 (and no other click content) is exported with `--with-clicks`
- **THEN** the export contains three pages for that slide: no stepped callouts, then step 1's callout, then both

### Requirement: Malformed click-step suffixes degrade like other malformed markers
A suffix that isn't `{` followed by a positive integer and `}` (e.g. `{0}`, `{x}`, `{}`) SHALL make the marker or anchor declaration unrecognized. It is handled exactly like any other malformed marker or anchor line today, and never produces a highlight with an invalid step.

#### Scenario: Zero step is not accepted
- **WHEN** a code line carries `// [!mark{0}] Note`
- **THEN** no highlight is created from that marker, just as for any other unrecognized marker text
