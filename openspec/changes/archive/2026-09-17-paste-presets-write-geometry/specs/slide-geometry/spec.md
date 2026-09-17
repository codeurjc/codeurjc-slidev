## ADDED Requirements

### Requirement: Images without geometry stay in normal content flow
A `default`-layout slide's images SHALL only be taken out of normal content flow by `geometry.images` entries. On a slide with no `geometry.images`, every image SHALL render inline in the content, and no image SHALL be positioned by a layout-level element.

#### Scenario: Slide with images and no geometry
- **WHEN** a slide's content contains two images and its frontmatter declares no `geometry`
- **THEN** both images render in normal content flow, and neither is absolutely positioned

## REMOVED Requirements

### Requirement: Frontmatter image geometry replaces single tracked-image extraction
**Reason**: The single tracked-image extraction (last `<img>` into a layout-level `image` element) no longer exists, so there is nothing for `geometry.images` to replace.
**Migration**: None needed for slides with `geometry.images`. Slides that relied on the automatic placement of their last image get the same effect with a `geometry.images` entry, or by choosing a paste preset.
