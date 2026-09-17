## MODIFIED Requirements

### Requirement: Connectors end in an arrowhead at their anchor
A slide callout's connector SHALL follow the slide's callout style (see code-highlight-callouts): on an `arrow` slide, a straight segment from the anchor to the box's border with its arrowhead pointing into the box; on an `elbow` slide, an elbow ending in an arrowhead at the anchor, pointing at the anchor. A callout with no text (a bare arrow) SHALL, in both styles, end in an arrowhead at the anchor, pointing at it.

#### Scenario: Arrowhead points into the box on an arrow slide
- **WHEN** a callout box on an `arrow` slide is placed above its anchor and connected to it
- **THEN** the connector is a straight segment from the anchor to the box's border, with the arrowhead at the box end pointing into the box

#### Scenario: Arrowhead points at the target on an elbow slide
- **WHEN** a callout box on a slide with `calloutStyle: elbow` is placed above its anchor and connected to it
- **THEN** the connector's arrowhead is rendered at the anchor end, oriented towards the anchor

#### Scenario: A bare arrow points at its anchor in both styles
- **WHEN** a callout with no `text` is declared on an `arrow` slide
- **THEN** its short arrow ends in an arrowhead at the anchor, as on an `elbow` slide

### Requirement: Callouts without a box position are auto-placed
A callout with no `box` SHALL be positioned by the theme's existing callout placement: beside its anchor, avoiding the element the anchor belongs to, the callouts already placed on that slide, and the slide's edges. On an `arrow` slide, the auto-placed callouts on the same side of the same element SHALL be stacked in the order of their anchors, as code callouts are (see code-highlight-callouts). A callout with a `box` SHALL render exactly there.

#### Scenario: Two callouts on one image don't overlap
- **WHEN** a slide declares two callouts anchored on the same image, neither with a `box`
- **THEN** both boxes render outside the image and do not overlap each other

#### Scenario: Callouts on one image follow their anchors' order
- **WHEN** an `arrow` slide declares two callouts on the right side of the same image, the first anchored lower in the image than the second
- **THEN** the second callout's box is above the first one's
