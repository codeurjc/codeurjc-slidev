## MODIFIED Requirements

### Requirement: Step badges on stepped lines
In a theme-scoped markdown document, the extension SHALL paint a badge after the end of each line carrying an exact click step, without moving any code:
- **Manual fence marker:** the marker's line; a `:start`/`:end` range uses its `:start` line.
- **`<<<` anchor line:** that line.
- **Native fence range segment after the first:** the first line of that segment's first range; an `all`/`*` segment uses the fence's opening line.

The badge SHALL read `▸` followed by the step as written, without braces: `▸2`, and for step ranges `▸2-4` or `▸-1` (an open end `{2-}` reads `▸2`). Several steps on one line SHALL be merged in ascending order of their first click without duplicates (`▸-0,3`). Lines with no step, and steps that aren't exact, SHALL get no badge.

#### Scenario: Marker with a step
- **WHEN** a fence line ends with `// [!mark{2}] Injects`
- **THEN** that line shows a `▸2` badge after its end

#### Scenario: Marker with a step range
- **WHEN** a fence line ends with `// [!mark{2-4}] Injects` on a slide whose total is 5
- **THEN** that line shows a `▸2-4 of 5` badge

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

### Requirement: Step information in hovers
Hovering a manual fence marker line or a `<<<` anchor line with a step SHALL say at which clicks its highlight is visible, including the total when it is known and the setting is enabled: "revealed at click 2 of 3" for a step, "visible at clicks 2–4 of 5" for a bounded range, and "visible until click 1 of 3" for an open start. When a step or the total is hidden because of an uncountable source, the hover SHALL name that source and its line.

#### Scenario: Hover on a stepped anchor line
- **WHEN** the user hovers `[!mark:"float suma"{3}] Sums up` on a slide whose total is 3
- **THEN** the hover includes "revealed at click 3 of 3"

#### Scenario: Hover on a ranged marker
- **WHEN** the user hovers a line ending with `// [!mark{2-4}] Note` on a slide whose total is 5
- **THEN** the hover includes "visible at clicks 2–4 of 5"

#### Scenario: Hover explains a hidden total
- **WHEN** the user hovers a stepped marker on a slide containing `<MyStepper />` on line 12
- **THEN** the hover gives the step, without a total, and names `<MyStepper>` on line 12 as the reason

### Requirement: Step information in the reference CodeLens
The reference-index CodeLens in a referenced code file SHALL add each reference's click step, written like its badge, to its slide label when the referencing anchor line has an exact step: `Slide 4 ▸3 of 3` or `Slide 4 ▸2-3 of 4`, or without ` of N` when the total is unknown or the setting is disabled. A reference without a step SHALL keep its plain `Slide N` label.

#### Scenario: Stepped and unstepped references
- **WHEN** a line of `code/Foo.java` is referenced by a stepped anchor on slide 4 (total 3) and an unstepped anchor on slide 7
- **THEN** its CodeLens reads `📽 2 references — Slide 4 ▸3 of 3, Slide 7`

## ADDED Requirements

### Requirement: The click model counts step ranges
The click model SHALL treat a marker, anchor or slide-callout step range as absolute clicks at its start (when it has one) and at its end + 1 (when it has an end), matching the theme's registrations, so a slide's total includes the click at which a range disappears.

#### Scenario: A range adds its disappearance click
- **WHEN** a slide's only click source is a marker with `{1-2}`
- **THEN** the model's total for that slide is 3, the same as Slidev's
