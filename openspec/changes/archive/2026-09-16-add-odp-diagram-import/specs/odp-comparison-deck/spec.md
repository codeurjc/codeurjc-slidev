## MODIFIED Requirements

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
When at least one slide has losses and LibreOffice is available, the importer SHALL write `comparison.md` next to `slides.md`, using the theme. For each converted slide with losses, in order, it SHALL contain:
1. An information slide showing the rendered original (when one exists), the slide's losses, and an indicator of the converted slide it relates to, using that slide's Slidev slide number (the number shown when presenting `slides.md`, which doesn't count hidden slides).
2. Followed by the converted slide itself, imported from `slides.md` with `src:`.

Slides without losses SHALL NOT appear, including slides that only have info notes. When no slide has losses, no `comparison.md` SHALL be written.

#### Scenario: One slide with losses
- **WHEN** only the converted slide presented as slide 14 in `slides.md` has losses (two arrows omitted)
- **THEN** `comparison.md` contains an information slide stating it relates to slide 14, listing the two omitted arrows and showing the original, followed by that converted slide imported from `slides.md`, and no other slides

#### Scenario: Import without losses
- **WHEN** every slide converts without losses
- **THEN** no `comparison.md` is created, and the console reports that nothing was lost

#### Scenario: Hidden slide with losses
- **WHEN** a hidden ODP slide has losses
- **THEN** its information slide lists the losses and notes that the original isn't rendered because the slide is hidden, and no converted slide follows it (Slidev doesn't load hidden slides)

#### Scenario: Slide with only info notes
- **WHEN** a slide's only report is the note `diagram embedded as an SVG image (not editable)`
- **THEN** that slide doesn't appear in `comparison.md`
