# slide-title-carryover

## Purpose

TBD - created by carry-slide-titles change. Update Purpose after archiving to describe the scope of this capability in one or two sentences.

## Requirements

### Requirement: A missing title is carried forward from the nearest preceding default-layout slide
On a slide resolving to the `default` layout, if the slide's content does not begin with a `# ` heading, the rendered title SHALL be the title of the nearest preceding `default`-layout slide that had one (its own explicit title, or itself a carried one), searching backward and skipping over any slides using a different layout. If no earlier `default`-layout slide has a title, no title is rendered.

#### Scenario: Title carries across consecutive slides
- **WHEN** slide 2 (default layout) begins with `# Ejercicios` and slides 3, 4, and 5 (default layout) have no leading `# ` heading
- **THEN** slides 3, 4, and 5 each render "Ejercicios" as their title

#### Scenario: A new explicit title starts a new chain
- **WHEN** slide 6 (default layout) begins with `# Casos de uso`
- **THEN** slide 6 renders "Casos de uso", and any following titleless default-layout slides carry "Casos de uso" instead of "Ejercicios"

#### Scenario: Non-default layout slides are skipped, not treated as breaks
- **WHEN** a slide using the `cover` layout sits between two `default`-layout slides, the first of which sets `# Ejercicios` and the second of which has no leading `# ` heading
- **THEN** the second `default`-layout slide renders "Ejercicios" as its title, ignoring the intervening `cover` slide

#### Scenario: No earlier title exists
- **WHEN** the first `default`-layout slide in the deck has no leading `# ` heading and no prior default-layout slide set one
- **THEN** no title is rendered for that slide

### Requirement: A missing subtitle is carried forward independently of the title
On a `default`-layout slide, if the content's leading heading block does not include a `## ` line immediately following any leading `# ` line (or as the first line, if there is no leading `# ` line), the rendered subtitle SHALL be carried from the nearest preceding `default`-layout slide that had one, using the same backward-search rule as title carry-over. Title and subtitle carry-over are resolved independently: a slide may set its own title while carrying its subtitle, or vice versa.

#### Scenario: Subtitle changes while title carries
- **WHEN** consecutive default-layout slides both omit `# ` (carrying "Dobles" as the title) but each provides its own `## Ejercicio N` line with a different N
- **THEN** each slide renders "Dobles" as the title and its own distinct `## Ejercicio N` as the subtitle

#### Scenario: Title changes while subtitle carries
- **WHEN** a slide provides its own `# ` heading but no leading `## ` line
- **THEN** the slide renders its own new title and the subtitle carried from the nearest preceding default-layout slide that had one

### Requirement: An empty heading resets that level's carry chain going forward
A leading `#` or `##` line with no text after the marker SHALL clear that level's carried value starting at that slide: the slide itself renders nothing at that level, and subsequent default-layout slides also render nothing at that level until one of them provides a new non-empty heading of that level.

#### Scenario: Empty title suppresses carry-over from that slide onward
- **WHEN** a default-layout slide's leading line is a bare `#` (no text), following a run of slides carrying "Ejercicios"
- **THEN** that slide renders no title, and every following default-layout slide also renders no title until one sets an explicit new `# ` heading

#### Scenario: Empty subtitle resets independently of title
- **WHEN** a default-layout slide's leading heading block is `# Ejercicios` followed by a bare `##` (no text)
- **THEN** that slide renders "Ejercicios" as the title and no subtitle, and following titleless/subtitleless slides carry "Ejercicios" as the title but no subtitle until a new `## ` heading appears

### Requirement: A frontmatter flag resets both title and subtitle carry chains at once
The system SHALL support a `default`-layout slide's frontmatter setting a reset flag that clears both the title and subtitle carry chains starting at that slide, equivalent to that slide having both an empty `#` and an empty `##`, without requiring either to be written in the content.

#### Scenario: Frontmatter flag resets both levels
- **WHEN** a default-layout slide's frontmatter sets the reset flag, and the slide's content has no leading headings of its own
- **THEN** that slide renders no title and no subtitle, and following default-layout slides render nothing at either level until a new explicit `# ` or `## ` heading appears for that level

#### Scenario: Frontmatter flag does not prevent the same slide from also setting its own heading
- **WHEN** a default-layout slide's frontmatter sets the reset flag and the slide's content also begins with its own `# New Section`
- **THEN** that slide renders "New Section" as its title, and following slides carry "New Section" forward as normal

### Requirement: Carried titles are reflected in Slidev's own slide.title
The effective (own or carried) title of a `default`-layout slide SHALL be reflected in Slidev's parsed `slide.title`, so that UI surfaces reading it (presenter overview, table of contents, browser tab) show the same title as is rendered on the slide, not blank for slides that only carry a title.

#### Scenario: Presenter overview shows the carried title
- **WHEN** a default-layout slide renders a carried title of "Ejercicios" (no `# ` heading of its own)
- **THEN** Slidev's presenter overview / table of contents entry for that slide reads "Ejercicios", not blank

### Requirement: Carry-over resolution does not depend on transform invocation order
The effective title/subtitle for any slide SHALL be computable independently for each slide from the full parsed slide list, without relying on other slides' transforms having already run in a particular order during the current dev-server session.

#### Scenario: Resolving a later slide first still yields the correct carried title
- **WHEN** the transform for slide 5 runs before the transform for slide 3 has run in the current session (e.g. due to on-demand HMR of an individual slide module)
- **THEN** slide 5 still resolves its carried title correctly, without depending on slide 3's transform having executed first
