## MODIFIED Requirements

### Requirement: Build-ups merge into click steps when fully convertible
When consecutive ODP slides have the same title, the importer SHALL merge them into one slide with click steps when each slide's content is the previous slide's content with only convertible changes:
- highlights and callouts on the same code, added or removed, which become callout click steps or step ranges;
- trailing list items or images, added only, which become click-revealed elements.

Otherwise the slides SHALL stay separate.

A console warning SHALL name the ODP slides that couldn't be merged and why, whenever consecutive slides with the same title and in-content heading differ only in highlights, callouts, list items or images. That includes slides that add something unconvertible, remove an image or a list item, or show a highlight again after it disappeared. The warning SHALL also appear among the import report's notices.

#### Scenario: Callouts added over the same code
- **WHEN** three consecutive ODP slides show the same YAML workflow, the second adds one labeled highlight box and the third adds two more
- **THEN** `slides.md` contains one slide with that code whose highlights carry click steps `{1}` (the second slide's) and `{2}` (the third slide's)

#### Scenario: A highlight moves across the same code
- **WHEN** two consecutive ODP slides show the same code, the first with a highlight box on line 3 and the second with one on line 5
- **THEN** `slides.md` contains one slide with that code, the line 3 highlight carrying `{-0}` and the line 5 highlight `{1}`

#### Scenario: Unconvertible overlay keeps separate slides
- **WHEN** consecutive slides show the same screenshot and each adds an arrow callout pointing into the image
- **THEN** the slides stay separate in `slides.md`, and the console warns that the build-up couldn't be converted to click steps

#### Scenario: Swapped screenshot warns
- **WHEN** two consecutive ODP slides have the same title and text, and the second shows a different screenshot in place of the first one's
- **THEN** the slides stay separate in `slides.md`, and the console warns that they couldn't be merged because an image is removed
