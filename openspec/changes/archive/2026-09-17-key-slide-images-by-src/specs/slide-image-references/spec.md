## ADDED Requirements

### Requirement: A slide refers to one of its images by src, optionally with an occurrence
Wherever slide frontmatter refers to one of the slide's images, a reference SHALL be accepted in two forms:
- a **src reference**: a string with the image's `src` exactly as written in the slide's markdown or HTML (e.g. `/images/a.png`), optionally followed by `#N` (N ≥ 1) to pick the Nth image with that `src` in document order;
- a **positional reference**: a non-negative whole number, the image's position among the slide's content images in document order, as before.

Only a trailing `#` followed by digits SHALL count as an occurrence, so other fragments stay part of the `src` (`/images/icons.svg#logo` is a plain `src`). `#0`, or `#` with no digits, SHALL be an invalid reference.

#### Scenario: Reference by src
- **WHEN** a slide shows `![](/images/a.png)` and `![](/images/b.png)`, and a reference is `/images/b.png`
- **THEN** it resolves to the second image

#### Scenario: Second occurrence of a repeated picture
- **WHEN** a slide shows `/images/a.png` twice, and a reference is `/images/a.png#2`
- **THEN** it resolves to the second of those two images

#### Scenario: Fragment that isn't an occurrence
- **WHEN** a slide shows `<img src="/images/icons.svg#logo">` and a reference is `/images/icons.svg#logo`
- **THEN** it resolves to that image

#### Scenario: Positional reference still works
- **WHEN** a reference is `1`
- **THEN** it resolves to the slide's second content image, whatever its `src`

### Requirement: References resolve against the authored src, not the bundled URL
The theme SHALL resolve a src reference against each image's `src` as the author wrote it, for markdown images (`![](…)`) as well as HTML `<img>` tags, in both the dev server and a built deck. That holds even though markdown image URLs are turned into bundled asset URLs when rendered. Inserting, removing or reordering other images on the slide SHALL NOT change which image a src reference resolves to.

#### Scenario: Built deck
- **WHEN** a deck with `![](/images/a.png)` and a `geometry.images` entry `{ src: /images/a.png, … }` is built with `slidev build`
- **THEN** the built slide positions that image by the entry, although the image's rendered URL differs from `/images/a.png`

#### Scenario: Image inserted before a referenced one
- **WHEN** a slide's frontmatter positions `/images/b.png` and has a callout anchored in it, and the author inserts `![](/images/new.png)` before `/images/b.png` in the content
- **THEN** the geometry and the callout still apply to `/images/b.png`, and the new image stays in normal content flow

### Requirement: Unresolvable and ambiguous references warn instead of re-targeting
A src reference naming a `src` that no image on the slide has, or an occurrence past the number of images with that `src`, SHALL resolve to nothing and log a console warning naming the slide and the reference. A src reference without `#N` whose `src` appears more than once on the slide SHALL resolve to the first occurrence and log a console warning suggesting `#N`. A reference that resolves to nothing SHALL leave every image in its normal state, never falling back to another image.

#### Scenario: Renamed file
- **WHEN** a slide's `geometry.images` entry references `/images/old.png` and the content now shows `/images/renamed.png`
- **THEN** no image is positioned by that entry, `/images/renamed.png` stays in normal content flow, and a console warning names `/images/old.png`

#### Scenario: Repeated src without occurrence
- **WHEN** a slide shows `/images/a.png` twice and a callout anchors at `{ image: /images/a.png, … }`
- **THEN** the callout points into the first occurrence and a console warning suggests `/images/a.png#1` or `#2`

### Requirement: Writers generate the shortest unambiguous src reference
Every writer of image references SHALL write a src reference: the layout editor, callout authoring and the ODP importer. The reference SHALL be the bare `src` when that `src` appears once on the slide, and `src#N` when it repeats. A writer SHALL write a positional reference only for an image that has no `src`.

#### Scenario: Unique picture
- **WHEN** the editor writes a reference to the only image with `src` `/images/a.png` on the slide
- **THEN** it writes `/images/a.png`

#### Scenario: Repeated picture
- **WHEN** the editor writes a reference to the second of two images with `src` `/images/a.png`
- **THEN** it writes `/images/a.png#2`
