## ADDED Requirements

### Requirement: Click steps accept ranges
Wherever a click step is accepted, it SHALL accept these forms:

| Form | Visible at |
|---|---|
| `{N}` | click N and every later click (unchanged) |
| `{N-}` | the same as `{N}` |
| `{N-M}` | clicks N through M inclusive; hidden again from click M+1 |
| `{-M}` | click 0 through click M; hidden from click M+1 (`{-0}`: only before the first click) |

N SHALL be a positive integer. M SHALL be a positive integer with M ≥ N when N is given, and a non-negative integer in the open-start form `{-M}`. The range SHALL take the place of `{N}` in the marker and anchor grammars, in the same position.

#### Scenario: Bounded range on an inline marker
- **WHEN** a code line carries `// [!mark{2-3}] Note`
- **THEN** a highlight is created whose step range is clicks 2 through 3

#### Scenario: Open start on an anchor line
- **WHEN** a `<<<` import is followed by `[!mark:3{-1}] First`
- **THEN** line 3 of the snippet is highlighted with a step range from click 0 through click 1

#### Scenario: Visible only before the first click
- **WHEN** a code line carries `// [!mark{-0}] Starting point`
- **THEN** the highlight is visible at click 0 and hidden from click 1

#### Scenario: Open end is the same as a single step
- **WHEN** one line carries `// [!mark{2-}] A` and another `// [!mark{2}] B`
- **THEN** both highlights have the same step range, from click 2 on

### Requirement: A ranged highlight disappears after its range
A highlight whose step range ends at click M SHALL render with no highlight styling, no callout box and no connector from click M+1 onward, and exactly as an unstepped highlight within its range.

#### Scenario: Walk-through of three highlights
- **WHEN** a code block has highlight A at `{-1}`, B at `{2-2}` and C at `{3}`, and the presenter advances from click 0 to click 3
- **THEN** A is visible at clicks 0 and 1, only B at click 2, and only C at click 3

## MODIFIED Requirements

### Requirement: Inline markers accept a click-step suffix
An inline highlight marker SHALL accept an optional click-step suffix: `{N}`, or a step range (see "Click steps accept ranges"). It goes after the marker's role (`:start`/`:end`) and substring range (`(<start>-<end>)`), and before any `@x,y` position override: `// [!mark{2}] comment`, `// [!mark:start{3-4}]`, `// [!mark(2-16){-1}@120,40] comment`. For a `:start`…`:end` range, a suffix on either marker applies to the whole range; if both carry one, the `:start` marker's wins. The suffix SHALL be stripped from the rendered code together with the rest of the marker.

#### Scenario: Whole-line marker with a click step
- **WHEN** a fenced code block contains `this.alumnos = alumnos; // [!mark{2}] Stores the dependency`
- **THEN** a highlight is created for that line with click step 2 and comment "Stores the dependency", and the rendered code shows `this.alumnos = alumnos;` with no marker text

#### Scenario: Range with the step on the start marker
- **WHEN** a block contains `// [!mark:start{3}] Loop` on one line and `// [!mark:end]` three lines later
- **THEN** one range highlight covering those lines is created with click step 3

#### Scenario: Suffix combined with substring range and position override
- **WHEN** a line carries `// [!mark(2-16){2-3}@120,40] Just the substring`
- **THEN** the highlight covers characters 2–16 of that line, is visible at clicks 2 through 3, and its callout is pinned at (120, 40)

### Requirement: Anchor declarations accept a click-step suffix
An external anchor declaration line after a `<<<` import SHALL accept the same optional suffix: `{N}` or a step range. It goes after the anchor target, including any substring range, offset range, or occurrence selector (`#N`/`#*`), and before any `@x,y` override: `[!mark:3{2}] comment`, `[!mark:"text"#2{3-4}] comment`, `[!mark:"a".."b"{-2}@120,40] comment`. With `#*`, every matched highlight SHALL share that step or range.

#### Scenario: Line anchor with a click step
- **WHEN** a `<<<` import is followed by `[!mark:5{2}] Returns the average`
- **THEN** line 5 of the rendered snippet is highlighted with click step 2 and comment "Returns the average"

#### Scenario: All-occurrences anchor shares one range
- **WHEN** a `<<<` import is followed by `[!mark:"assertEquals"#*{4-5}] Assertion`
- **THEN** every occurrence of `assertEquals` is highlighted, each with its own callout, and all of them are visible at clicks 4 through 5

### Requirement: A stepped highlight is hidden until its click step
A highlight whose step starts at click N SHALL render with no highlight styling, no callout box, and no connector while the slide's current click is below N. From click N it SHALL render exactly as an unstepped highlight, until the end of its range if it has one (see "A ranged highlight disappears after its range"), otherwise for the rest of that slide. A range with an open start (`{-M}`) SHALL be visible from click 0. Highlights without a suffix SHALL be visible at every click, as before. Highlights sharing a step SHALL appear together.

#### Scenario: Step reveals on its click and stays
- **WHEN** a slide has one code block with an unstepped highlight A, a highlight B at step 1, and a highlight C at step 2, and the presenter advances from click 0 to click 2
- **THEN** at click 0 only A is visible; at click 1, A and B are visible; at click 2, A, B and C are visible

#### Scenario: Two highlights share a step
- **WHEN** highlights B and C both have click step 1
- **THEN** both become visible together on click 1

### Requirement: Callout click steps count toward the slide's clicks
Every click at which a slide's highlights change SHALL count toward that slide's total number of clicks, together with any other click-driven content on the slide: the start of each step, and, for a range with an end M, click M+1 at which it disappears. The presenter SHALL go through every change before advancing to the next slide.

#### Scenario: Presenter must reveal all steps before the next slide
- **WHEN** a slide has no other click-driven content and its highlights use steps 1, 2 and 3
- **THEN** pressing "next" three times reveals the steps one by one, and only the fourth "next" moves to the following slide

#### Scenario: The disappearance of a range is a click
- **WHEN** a slide's only click-driven content is a highlight with `{1-2}`
- **THEN** the slide has 3 clicks, and the highlight is hidden at click 3

### Requirement: Callout positions stay stable across steps
Auto-placement SHALL position every callout of a slide, stepped and unstepped, in one pass that covers every click, so revealing or hiding a step never moves callouts that are visible. Two callouts whose step ranges share no click SHALL NOT be treated as obstacles for each other; callouts that can be visible at the same click SHALL avoid each other.

#### Scenario: Revealing a step doesn't move earlier callouts
- **WHEN** a slide at click 1 shows callout B, and advancing to click 2 reveals callout C next to the same code block
- **THEN** callout B's rendered position is identical at click 1 and click 2

#### Scenario: Walk-through callouts don't stack
- **WHEN** a code block has three highlights on different lines at `{-1}`, `{2-2}` and `{3}`, each with a callout of the same size and no position override
- **THEN** each callout is placed beside its own highlight as if it were the only callout, rather than stacked away from the lines of the later ones

### Requirement: Editor mode shows all callouts regardless of the current click
While the layout editor is active, every highlight and callout on the slide SHALL be visible and draggable, whatever the current click. Dragging a stepped callout SHALL persist its `@x,y` override while keeping its step suffix, including a range, unchanged.

#### Scenario: Dragging a stepped callout keeps its step
- **WHEN** the editor is active at click 0 on a slide containing `// [!mark{2-3}] Note`, and the user drags that callout to (200, 60)
- **THEN** the callout was visible and draggable at click 0, and the marker in the markdown now reads `// [!mark{2-3}@200,60] Note`

### Requirement: Exporting with clicks shows each step
Exporting the presentation with click steps (`slidev export --with-clicks`) SHALL produce one page per click of a slide with callout steps, each page showing exactly the highlights visible at that click.

#### Scenario: PDF export pages per step
- **WHEN** a slide with highlights at steps 1 and 2 (and no other click content) is exported with `--with-clicks`
- **THEN** the export contains three pages for that slide: no stepped callouts, then step 1's callout, then both

#### Scenario: PDF export of a walk-through
- **WHEN** a slide with highlights at `{-1}`, `{2-2}` and `{3}` (and no other click content) is exported with `--with-clicks`
- **THEN** the export contains four pages for that slide, showing the first highlight on the first two pages, then only the second, then only the third

### Requirement: Malformed click-step suffixes degrade like other malformed markers
A suffix that isn't a valid step or step range (e.g. `{0}`, `{x}`, `{}`, `{0-2}`, `{3-2}`, `{-}`, `{2-3-4}`) SHALL make the marker or anchor declaration unrecognized. It is handled exactly like any other malformed marker or anchor line today, and never produces a highlight with an invalid step.

#### Scenario: Zero step is not accepted
- **WHEN** a code line carries `// [!mark{0}] Note`
- **THEN** no highlight is created from that marker, just as for any other unrecognized marker text

#### Scenario: Reversed range is not accepted
- **WHEN** a code line carries `// [!mark{3-2}] Note`
- **THEN** no highlight is created from that marker
