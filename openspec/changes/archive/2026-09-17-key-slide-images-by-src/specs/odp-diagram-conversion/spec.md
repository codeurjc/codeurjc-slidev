## MODIFIED Requirements

### Requirement: Other diagrams are embedded as SVG cropped from LibreOffice's export
An SVG candidate SHALL become an SVG image built from LibreOffice's SVG export of the deck when LibreOffice ≥ 7.4 is available and the slide is not hidden. The image replaces the candidate's own images, callouts and paragraphs. The image SHALL contain only the candidate's members, including its images, with its view box set to the union of those members' bounding boxes plus a small margin. It SHALL NOT include the master page, the background, or the slide's title, body, code, tables, links or other converted content, even where they overlap the diagram's area. Each member SHALL be matched to its shape in the export by bounding box. Other shapes without a role (not title, body, code, table or link) lying fully inside the diagram's bounding box SHALL be included too when the export has them; this covers decorations the importer can't classify, such as a curved arrow drawn as a path.

The image SHALL be written under `public/images/`, referenced from the slide, and given a `geometry.images` entry keyed by its `src` at the candidate's mapped bounding box.

#### Scenario: UML class diagram embedded as an image
- **WHEN** a slide has "Chat", "User" and "WebSocketUser" class boxes with compartment lines, an association line with a "*" label and an inheritance line ending in a triangle shape, and LibreOffice 25.8 is available
- **THEN** the converted slide references an SVG image under `public/images/` positioned by `geometry.images` where the diagram was, the image shows those boxes, lines, triangle and "*", and it doesn't show the slide's "Ejercicio 8" bullet even though that bullet overlaps the diagram's area

#### Scenario: Hexagonal architecture embedded as an image
- **WHEN** a slide has a diagram image with two hexagons, four rotated trapezoids labelled as ports and text labels drawn on top of it, and LibreOffice 25.8 is available
- **THEN** the converted slide references one SVG image containing the picture and all those shapes, has no callouts for those labels, and none of those shapes is reported as a loss

#### Scenario: Diagram image doesn't disturb other image references
- **WHEN** a slide has a screenshot with a callout on it and, elsewhere on the slide, an SVG-tier diagram
- **THEN** the callout's anchor and the screenshot's `geometry.images` entry reference the screenshot by `src`, and the diagram image has its own `src`-keyed entry
