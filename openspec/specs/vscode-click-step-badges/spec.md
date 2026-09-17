# vscode-click-step-badges

## Purpose

Shows, in the VS Code editor, at which click each code highlight and each native fence line-range segment of a theme-tagged deck appears: `▸N of M` badges at the end of stepped lines, step information in hovers and in the reference CodeLens, all computed by a per-slide click model that counts clicks the way Slidev does, and declines to give a number when a slide contains a click source it can't count.

## Requirements

### Requirement: Per-slide click model matches Slidev
The extension SHALL compute each slide's click registrations and total the way Slidev does, from the slide's text alone. It SHALL recognise:
- theme code-highlight steps (`{N}` on inline markers and `<<<` anchor lines) and slide callout steps (`step:` in a `default`-layout slide's `callouts` frontmatter) as absolute clicks;
- fence line ranges (`{a|b|c}`) with a relative or literal numeric `at` option, and a literal `startLine`;
- `v-click`, `v-click-hide` and `v-after` attributes, and `<v-click>`/`<v-after>` elements, with no value, `+N`, `-N`, `N` or `[a, b]`;
- `<v-clicks>` around a single markdown list, with literal `depth`, `every` and `at`;
- `<VClickGap>`/`<v-click-gap>` with a literal size;
- frontmatter `clicks:`.

A relative source SHALL start after the relative clicks registered before it, and an absolute one SHALL not shift later sources. The total SHALL be the highest click any source reaches, unless frontmatter `clicks:` sets it.

#### Scenario: Fence ranges after a v-click
- **WHEN** a slide has a bullet with `v-click` followed by a fence with `{1|3|5}`
- **THEN** the fence's second and third segments are at clicks 2 and 3, and the slide total is 3

#### Scenario: Absolute markers don't shift relative sources
- **WHEN** a slide has a code marker `// [!mark{4}]` followed by a fence with `{1|2}`
- **THEN** the fence's second segment is at click 1, and the slide total is 4

#### Scenario: Numeric at on a fence
- **WHEN** a fence is written as ```` ```ts {1|2|3} {at: 5} ````
- **THEN** its segments are at clicks 5 and 6, whatever comes before it

#### Scenario: Slide callout steps count
- **WHEN** a `default`-layout slide's frontmatter declares a callout with `step: 2` and the slide has no other clicks
- **THEN** the slide total is 2

#### Scenario: Frontmatter clicks override
- **WHEN** a slide's frontmatter declares `clicks: 7`
- **THEN** the slide total is 7

#### Scenario: Agrees with a running Slidev deck
- **WHEN** a fixture deck covering every recognised source is rendered by Slidev
- **THEN** each slide's total and each fence segment's first click match the model

### Requirement: Uncountable click sources
A slide containing a source that can register clicks but that the model can't count SHALL be marked uncountable at that source. That covers:
- a bound or non-literal value;
- `<v-switch>`;
- a magic-move fence;
- a custom component: a PascalCase tag that isn't a click-free Slidev built-in, or a kebab-case tag naming a component in the project's `components/` directory;
- `v-mark` and `v-motion`;
- MDC `{v-click}` attribute blocks and KaTeX line ranges, which the running deck showed no reliable click registration for;
- `<v-click>`/`<v-after>`/`<v-clicks>` containing another click source;
- `<v-clicks>` around anything but a single list.

The slide's total SHALL then be unknown, unless frontmatter `clicks:` sets it. Absolute registrations SHALL stay exact, and relative registrations SHALL stay exact only when no uncountable source comes before them.

#### Scenario: Custom component before a fence
- **WHEN** a slide has `<MyStepper />` followed by a fence with `{1|3}` and a marker `// [!mark{2}]`
- **THEN** the slide total is unknown, the marker's step is still 2, and the fence's segment step is unknown

#### Scenario: KaTeX ranges are not counted
- **WHEN** a slide contains `$$ {1|2}` followed by a KaTeX block
- **THEN** the slide total is unknown

#### Scenario: Custom component after a fence
- **WHEN** a slide has a fence with `{1|3}` followed by `<MyStepper />`
- **THEN** the fence's segment is still at click 1 and the slide total is unknown

### Requirement: Step badges on stepped lines
In a theme-scoped markdown document, the extension SHALL paint a badge after the end of each line carrying an exact click step, without moving any code:
- **Manual fence marker:** the marker's line; a `:start`/`:end` range uses its `:start` line.
- **`<<<` anchor line:** that line.
- **Native fence range segment after the first:** the first line of that segment's first range; an `all`/`*` segment uses the fence's opening line.

The badge SHALL read `▸` followed by the step. Several steps on one line SHALL be merged in ascending order without duplicates (`▸1,3`). Lines with no step, and steps that aren't exact, SHALL get no badge.

#### Scenario: Marker with a step
- **WHEN** a fence line ends with `// [!mark{2}] Injects`
- **THEN** that line shows a `▸2` badge after its end

#### Scenario: Range marker badge on its start line
- **WHEN** a range is written `// [!mark:start{3}]` ... `// [!mark:end]`
- **THEN** only the `:start` line shows `▸3`

#### Scenario: Anchor line with a step
- **WHEN** an anchor line `[!mark:"float suma"{3}] Sums up` follows a `<<<` import
- **THEN** the anchor line shows a `▸3` badge

#### Scenario: Native fence ranges
- **WHEN** a fence is written with `{2|4-5|all}` on a slide with no other clicks
- **THEN** the fence's code line 4 shows `▸1`, the fence's opening line shows `▸2`, and code line 2 shows no badge

#### Scenario: Two steps on one line
- **WHEN** a line carries `# [!mark(4-10){1}] a [!mark{3}] b`
- **THEN** that line shows a single `▸1,3` badge

#### Scenario: Unstepped marker
- **WHEN** a fence line ends with `// [!mark] Always visible`
- **THEN** no badge is shown for that line

### Requirement: Slide total in badges and its setting
When a slide's total is known and the setting `codeurjcSlidev.stepBadges.showTotal` is `true` (the default), each badge SHALL append ` of N`, N being the slide's total (`▸2 of 3`). When the total is unknown, or the setting is `false`, badges SHALL show the step only. Changing the setting SHALL update open editors without reopening them.

#### Scenario: Default shows the total
- **WHEN** a slide's highest step is 3 and a marker on it has step 2
- **THEN** the marker's badge reads `▸2 of 3`

#### Scenario: Setting disabled
- **WHEN** the user sets `codeurjcSlidev.stepBadges.showTotal` to `false`
- **THEN** the open document's badges update to `▸2`

#### Scenario: Unknown total hides it
- **WHEN** a slide is uncountable and has no frontmatter `clicks:`
- **THEN** its badges show the step only, even with the setting enabled

### Requirement: Step information in hovers
Hovering a manual fence marker line or a `<<<` anchor line with a step SHALL say at which click its highlight appears, including the total when it is known and the setting is enabled ("revealed at click 2 of 3"). When a step or the total is hidden because of an uncountable source, the hover SHALL name that source and its line.

#### Scenario: Hover on a stepped anchor line
- **WHEN** the user hovers `[!mark:"float suma"{3}] Sums up` on a slide whose total is 3
- **THEN** the hover includes "revealed at click 3 of 3"

#### Scenario: Hover explains a hidden total
- **WHEN** the user hovers a stepped marker on a slide containing `<MyStepper />` on line 12
- **THEN** the hover gives the step, without a total, and names `<MyStepper>` on line 12 as the reason

### Requirement: Step information in the reference CodeLens
The reference-index CodeLens in a referenced code file SHALL add each reference's click step to its slide label when the referencing anchor line has an exact step: `Slide 4 ▸3 of 3`, or `Slide 4 ▸3` when the total is unknown or the setting is disabled. A reference without a step SHALL keep its plain `Slide N` label.

#### Scenario: Stepped and unstepped references
- **WHEN** a line of `code/Foo.java` is referenced by a stepped anchor on slide 4 (total 3) and an unstepped anchor on slide 7
- **THEN** its CodeLens reads `📽 2 references — Slide 4 ▸3 of 3, Slide 7`

### Requirement: Test hook for applied badges
The extension's `activate()` SHALL return an exports object exposing, for a document URI, the badges it last applied (line and text). The hook SHALL be read-only and SHALL NOT change any behaviour.

#### Scenario: Smoke test reads badges
- **WHEN** the extension-host test opens a fixture document with stepped markers and reads the extension's exports
- **THEN** it receives the badge lines and texts currently painted in that document
