## ADDED Requirements

### Requirement: The comparison deck marks itself in its headmatter
The generated comparison deck's headmatter SHALL include `comparisonDeck: true`, so editor tooling can tell it from a presentable deck. The key SHALL be added to the comparison deck only, never to the deck's own file.

#### Scenario: Marker present
- **WHEN** a comparison deck is generated
- **THEN** its first slide's frontmatter contains `comparisonDeck: true` alongside `theme: codeurjc-slidev-theme`

#### Scenario: The deck itself is unchanged
- **WHEN** the same import writes `tema1.md` and `tema1-comparison.md`
- **THEN** `tema1.md` contains no `comparisonDeck` key
