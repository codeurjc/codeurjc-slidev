# image-position

## Purpose

Lets a pasted image in a slide's content become its own draggable/resizable layout element, with a quick post-paste preset popover ("Below" or "Right") that positions the image and adjusts the content box, saved via a per-slide layout fork.

## Requirements

### Requirement: Pasted image is extracted into a draggable layout element
The most recently pasted image in a slide's content (the last `<img>` in document order) SHALL be extracted out of normal content flow into its own positioned overlay element (`image`) in the layout editor, with independent `x/y/w/h`, drag, resize, and aspect-lock support equivalent to the existing `red-bar`, `logo`, `title`, and `content` elements.

#### Scenario: Single pasted image becomes draggable
- **WHEN** a slide's content contains exactly one pasted `<img>`
- **THEN** that image is positioned via the `image` element's `x/y/w/h`, and dragging/resizing it in the Layout tab behaves like any other element

#### Scenario: Multiple pasted images track only the last one
- **WHEN** a slide's content contains more than one pasted `<img>`
- **THEN** only the last image in document order is extracted into the draggable `image` element; earlier images remain plain inline images with no overlay

#### Scenario: No image present
- **WHEN** a slide's content contains no pasted image
- **THEN** the `image` element is hidden and does not appear in the Layout tab's element list

### Requirement: New image elements default to aspect-locked
Unlike the other four layout elements (which default to unlocked), an `image` element SHALL default to `aspectLocked: true` when first created, using the pasted image's natural pixel aspect ratio.

#### Scenario: Freshly pasted image starts locked
- **WHEN** an image is pasted and positioned for the first time on a slide
- **THEN** its `aspectLocked` value is `true` and its initial `w`/`h` reflect the image's natural aspect ratio

### Requirement: Position preset popover after paste
After a pasted image is inserted and the slide has re-rendered with it, a transient popover SHALL appear anchored to the image, offering "Below" (pre-selected/default) and "Right" presets.

#### Scenario: Popover appears after paste
- **WHEN** an image paste completes and the slide re-renders with the new `<img>` visible
- **THEN** a popover appears anchored to the image's rendered position, with "Below" and "Right" options

#### Scenario: Popover does not block on a slow or missing re-render
- **WHEN** the slide does not re-render with the new image within a bounded time
- **THEN** the popover is skipped silently; the image still renders inline in normal flow

### Requirement: Below preset
Selecting "Below" SHALL position the image horizontally centered beneath the content box, and reset the content box to full width.

#### Scenario: Choosing Below after previously choosing Right
- **WHEN** a slide's content box was previously narrowed by a "Right" selection, and the user selects "Below"
- **THEN** the content box returns to full width and the image is centered beneath it

### Requirement: Right preset
Selecting "Right" SHALL position the image in the right portion of the content box's bounds and shrink the content box's width so the two do not overlap.

#### Scenario: Choosing Right narrows the content box
- **WHEN** a user selects "Right" for a pasted image
- **THEN** the content box's width shrinks to make room, and the image occupies the freed right-hand portion at the content box's original height

### Requirement: Preset selection auto-saves via a per-slide layout fork
Selecting a preset SHALL save immediately, always via the existing "save as new layout" path (auto-generating a new layout file and pointing only the current slide's frontmatter at it), never by overwriting the layout file the slide currently references.

#### Scenario: First preset choice on a slide forks its layout
- **WHEN** a user selects a preset on a slide whose layout is shared with other slides
- **THEN** a new layout file is created reflecting the chosen preset, and only the current slide's frontmatter `layout:` is updated to reference it — other slides using the original layout are unaffected

#### Scenario: Second preset choice on the same slide reuses its fork
- **WHEN** a user changes the preset again on a slide that already forked its own layout from an earlier preset choice
- **THEN** the existing forked layout file is updated in place, without creating another fork
