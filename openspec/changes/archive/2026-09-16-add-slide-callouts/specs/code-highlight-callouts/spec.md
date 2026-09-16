## MODIFIED Requirements

### Requirement: Elbow connector never crosses the code block's text area
The connector between a callout and its highlight SHALL be routed as an axis-aligned elbow (one bend minimum, at most two bends) that does not pass through the code block's bounding box except at the single point where it meets the highlighted fragment. The connector SHALL end in an arrowhead at the highlighted fragment, pointing at the fragment rather than at the callout box, matching how slide callouts point at their anchors.

#### Scenario: Connector routes around the code block
- **WHEN** a callout is placed to the right of the code block
- **THEN** the connector's path stays outside the code block's bounding box until it reaches the highlighted fragment's edge

#### Scenario: Arrowhead points at the highlighted fragment
- **WHEN** a callout is connected to a highlighted fragment
- **THEN** an arrowhead is rendered where the connector meets the fragment, oriented towards it, and no arrowhead is drawn at the callout box's end
