## MODIFIED Requirements

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
