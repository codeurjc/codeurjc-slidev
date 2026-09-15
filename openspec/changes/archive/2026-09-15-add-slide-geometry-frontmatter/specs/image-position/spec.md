## MODIFIED Requirements

### Requirement: Pasted image is extracted into a draggable layout element
On a slide whose frontmatter does not declare `geometry.images` (see the `slide-geometry` capability), the most recently pasted image in the slide's content (the last `<img>` in document order) SHALL be extracted out of normal content flow into its own positioned overlay element (`image`) in the layout editor. That element has independent `x/y/w/h`, drag, resize, and aspect-lock support equivalent to the existing `red-bar`, `logo`, `title`, and `content` elements. On a slide that declares `geometry.images`, this extraction SHALL NOT apply.

#### Scenario: Single pasted image becomes draggable
- **WHEN** a slide's content contains exactly one pasted `<img>` and its frontmatter declares no `geometry.images`
- **THEN** that image is positioned via the `image` element's `x/y/w/h`, and dragging/resizing it in the Layout tab behaves like any other element

#### Scenario: Multiple pasted images track only the last one
- **WHEN** a slide's content contains more than one pasted `<img>` and its frontmatter declares no `geometry.images`
- **THEN** only the last image in document order is extracted into the draggable `image` element; earlier images remain plain inline images with no overlay

#### Scenario: No image present
- **WHEN** a slide's content contains no pasted image
- **THEN** the `image` element is hidden and does not appear in the Layout tab's element list

#### Scenario: Slide with frontmatter image geometry skips extraction
- **WHEN** a slide's content contains images and its frontmatter declares `geometry.images`
- **THEN** no image is extracted into the layout-level `image` element, which stays hidden for that slide
