# odp-comparison-deck

## Purpose

When LibreOffice 7.4 or newer is available, writes a separate `comparison.md` deck for an imported project that pairs each slide with conversion losses with its original rendering (split from LibreOffice's SVG export) and the converted slide, leaving `slides.md` itself clean.

## Requirements

### Requirement: The comparison deck requires LibreOffice 7.4 or newer
The importer SHALL check for a `soffice` executable reporting version 7.4 or newer before generating the comparison deck. When it's missing or older, the import SHALL still complete normally, no comparison deck SHALL be generated, and the console SHALL say that LibreOffice ≥ 7.4 is needed for the comparison deck.

#### Scenario: LibreOffice missing
- **WHEN** an ODP with losses is imported on a machine without `soffice` on the PATH
- **THEN** the project is created with `slides.md`, no `comparison.md` exists, and the console explains that the comparison deck was skipped because LibreOffice ≥ 7.4 wasn't found

#### Scenario: LibreOffice too old
- **WHEN** `soffice --version` reports 7.3.7
- **THEN** no comparison deck is generated, and the console reports the detected version and the 7.4 minimum

### Requirement: Original slides are rendered from LibreOffice's SVG export
When the comparison deck is generated, or when a slide has a diagram to embed as SVG, the importer SHALL export the ODP to SVG with LibreOffice, using an isolated temporary user profile so a running LibreOffice instance doesn't interfere. The export SHALL run at most once per import, and its result SHALL be shared by the comparison deck and diagram embedding. For the comparison deck, it SHALL split the export into one standalone SVG per exported slide, containing the shared definitions, the slide's master page and the slide itself, with the navigation script removed. Only slides with losses SHALL be written, to `public/odp-originals/<ODP slide name>.svg`. Slides SHALL be matched to ODP slides by the slide name the export preserves (e.g. `page16`). A hidden ODP slide, which LibreOffice doesn't export, SHALL have no rendered original.

#### Scenario: Rendered original for a slide with losses
- **WHEN** ODP slide `page16` has losses and LibreOffice 25.8 is available
- **THEN** `public/odp-originals/page16.svg` exists and, opened in a browser, shows that slide including its master page's red bar and logo

#### Scenario: No SVG for slides without losses
- **WHEN** ODP slide `page5` has no losses
- **THEN** no `public/odp-originals/page5.svg` is written

#### Scenario: One export for diagrams and the comparison deck
- **WHEN** a deck has both a slide with losses and a slide with a diagram embedded as SVG
- **THEN** LibreOffice's SVG export is run once, and both the original for the lossy slide and the diagram image are produced from it

#### Scenario: Export for diagrams without losses
- **WHEN** a deck has no losses but has a diagram to embed as SVG
- **THEN** the SVG export runs, the diagram image is written, and no `comparison.md` or `public/odp-originals/` file is written

### Requirement: The comparison deck contains only slides with losses
When at least one slide has losses and LibreOffice is available, the importer SHALL write the deck's comparison file — `comparison.md` next to `slides.md` for a lone default deck (per the `multi-deck-projects` capability's flat-vs-namespaced rule), otherwise `<slug>-comparison.md` next to `<slug>.md` — using the theme. For each converted slide with losses, in order, it SHALL contain:
1. An information slide showing the rendered original (when one exists), the slide's losses, and an indicator of the converted slide it relates to, using that slide's Slidev slide number (the number shown when presenting the deck, which doesn't count hidden slides).
2. Followed by the converted slide itself, imported from the deck's own file (`slides.md` or `<slug>.md`) with `src:`.

Slides without losses SHALL NOT appear, including slides that only have info notes. When no slide has losses, no comparison file SHALL be written.

#### Scenario: One slide with losses
- **WHEN** only the converted slide presented as slide 14 in `slides.md` has losses (two arrows omitted)
- **THEN** `comparison.md` contains an information slide stating it relates to slide 14, listing the two omitted arrows and showing the original, followed by that converted slide imported from `slides.md`, and no other slides

#### Scenario: Import without losses
- **WHEN** every slide converts without losses
- **THEN** no comparison file is created, and the console reports that nothing was lost

#### Scenario: Hidden slide with losses
- **WHEN** a hidden ODP slide has losses
- **THEN** its information slide lists the losses and notes that the original isn't rendered because the slide is hidden, and no converted slide follows it (Slidev doesn't load hidden slides)

#### Scenario: Slide with only info notes
- **WHEN** a slide's only report is the note `diagram embedded as an SVG image (not editable)`
- **THEN** that slide doesn't appear in the comparison file

#### Scenario: A namespaced deck's comparison file is named after its slug
- **WHEN** deck `tema1` (namespaced per the `multi-deck-projects` capability) has losses
- **THEN** the comparison file is written as `tema1-comparison.md`, and its `src:` includes point at `tema1.md#<n>`

### Requirement: The comparison deck leaves slides.md clean and renders converted slides faithfully
Generating the comparison deck SHALL NOT add anything to the deck's own file (`slides.md` or `<slug>.md`). A converted slide imported into the comparison file SHALL render with the same title and subtitle (including carried-over values) as when presenting the deck's own file.

#### Scenario: Carried title in the comparison deck
- **WHEN** converted slide 14 has no `#` heading of its own and carries "Tipos de pruebas" from an earlier slide in `slides.md`
- **THEN** that slide shows "Tipos de pruebas" as its title in both `slides.md` and `comparison.md`
