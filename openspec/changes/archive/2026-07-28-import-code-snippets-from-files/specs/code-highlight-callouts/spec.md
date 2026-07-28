## MODIFIED Requirements

### Requirement: Each highlight renders a connected callout box
Every highlight — whether defined via the `code-highlight-marking` capability's inline trailing-comment markers, or via the `external-highlight-anchors` capability's anchor declarations on a `<<<`-imported snippet — that has non-empty comment text SHALL render a callout box displaying that comment, connected to its highlighted fragment by an elbow-style (axis-aligned, two- or three-segment) connector line.

#### Scenario: Highlight with comment produces a callout
- **WHEN** a highlight `ctor-dep` has comment text "Injects the DB dependency"
- **THEN** a callout box containing that text is rendered on the slide, with a connector line running from the box to the highlighted fragment

#### Scenario: Highlight without comment produces no callout
- **WHEN** a marker has no trailing comment text
- **THEN** the fragment is still rendered with the highlight style, but no callout box or connector is rendered for it

#### Scenario: Anchor-declared highlight on a file-sourced snippet produces a callout
- **WHEN** a `<<<`-imported snippet has an anchor declaration `[!mark:"this.alumnos = alumnos"] Injects the DB dependency`
- **THEN** a callout box containing that comment is rendered, connected to the matched line by the same elbow-connector mechanism used for inline markers
