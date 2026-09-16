## ADDED Requirements

### Requirement: Text anchors reach into rendered diagrams
A `{text: "…"}` anchor SHALL also match text inside open shadow roots within the slide's content, which is where Slidev renders mermaid diagrams. Matches outside shadow roots SHALL be preferred, in document order, over matches inside them. When the matched text is a mermaid node's label, the anchor SHALL resolve to that node's shape, which is also the obstacle placement avoids. Callouts SHALL be re-placed when the content of such a shadow root changes (for example when a diagram finishes rendering), so a callout anchored into a diagram appears without a reload.

#### Scenario: Callout on a mermaid node
- **WHEN** a slide contains a `mermaid` flowchart with the node "Requisitos" and a callout anchors at `{text: Requisitos}`
- **THEN** once the diagram has rendered, the callout's connector points at the "Requisitos" node's box and the callout box doesn't overlap that node

#### Scenario: Plain content wins over diagram text
- **WHEN** a callout anchors at `{text: Cascada}`, a paragraph contains "Cascada" and a mermaid node is also labelled "Cascada"
- **THEN** the callout points at the paragraph

#### Scenario: Diagram renders after the slide mounts
- **WHEN** a slide with a callout anchored to a mermaid node is opened and the diagram renders after the first placement pass
- **THEN** the callout appears at the node without reloading the page, and no missing-text warning remains
