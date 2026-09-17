## ADDED Requirements

### Requirement: Preset selection writes the slide's geometry
Selecting a preset SHALL save immediately by writing the current slide's `geometry` frontmatter: `geometry.content` set to the preset's content rect, and a `geometry.images` entry keyed by the pasted image's `src` (see slide-image-references) set to the preset's image rect. An existing entry for that same image SHALL be replaced; every other `geometry.images` entry SHALL be kept as written. The write SHALL NOT create or modify any layout file, SHALL NOT change the slide's `layout`, and SHALL NOT reload the page: the slide re-renders with the new geometry in place. (On the first slide, whose frontmatter is the deck's headmatter, Slidev itself reloads the page after the write.)

#### Scenario: First preset choice on a slide
- **WHEN** a user pastes `/images/paste-1.png` on a `default` slide other than the first, with no `geometry`, and selects "Right"
- **THEN** the slide's frontmatter gains `geometry.content` and `geometry.images: [{ src: /images/paste-1.png, … }]`, the slide still uses `layout: default`, no file under `layouts/` is created or modified, and the page is not reloaded

#### Scenario: Changing the preset replaces the entry
- **WHEN** a user selects "Right" for a pasted image and then, in the same popover, selects "Below"
- **THEN** the slide keeps a single `geometry.images` entry for that image, with the "Below" rect

#### Scenario: Pasting onto a slide that already has geometry
- **WHEN** a slide declares `geometry.images: [{ src: /images/screenshot.png, … }]` and the user pastes `/images/paste-2.png` and selects "Below"
- **THEN** the screenshot's entry is unchanged and a second entry for `/images/paste-2.png` is added

#### Scenario: Several pasted images on one slide
- **WHEN** a user pastes two images on the same slide, choosing a preset for each
- **THEN** both images are positioned by their own `geometry.images` entries

## MODIFIED Requirements

### Requirement: Position preset popover after paste
After a pasted image is inserted into a `default`-layout slide and the slide has re-rendered with it, a transient popover SHALL appear anchored to that image, offering "Below" (pre-selected/default) and "Right" presets. The pasted image SHALL be identified by its authored `src` (the uploaded path), so the popover appears whether or not the slide already declares `geometry`, and whichever position the image takes in the content. The popover SHALL stay open after a preset is chosen, so the other preset can be tried, until it is dismissed.

#### Scenario: Popover appears after paste
- **WHEN** an image paste completes and the slide re-renders with the new `<img>` visible
- **THEN** a popover appears anchored to the image's rendered position, with "Below" and "Right" options

#### Scenario: Popover on a slide with geometry
- **WHEN** an image is pasted onto a slide whose frontmatter already declares `geometry.images` for another picture
- **THEN** the popover appears anchored to the pasted image

#### Scenario: Popover does not block on a slow or missing re-render
- **WHEN** the slide does not re-render with the new image within a bounded time
- **THEN** the popover is skipped silently; the image still renders inline in normal flow

### Requirement: Below preset
Selecting "Below" SHALL reset the content box to full width at its current top, and SHALL split the height between the content box's top and the bottom of the slide canvas between the content and the image:
- the content box's height SHALL be the content's rendered text height, clamped between 30% and 60% of that available height;
- the image SHALL be centred horizontally below the content box with a 24 px gap, sized to fit the remaining height and at most 80% of the canvas width while keeping its aspect ratio.

The image SHALL lie entirely within the slide canvas.

#### Scenario: Choosing Below after previously choosing Right
- **WHEN** a slide's content box was previously narrowed by a "Right" selection, and the user selects "Below"
- **THEN** the content box returns to full width and the image is centred beneath it

#### Scenario: Below keeps the image on the slide
- **WHEN** a slide's content box is at its default top with a 400 px height and two lines of text, and the user selects "Below" for a landscape image
- **THEN** the content box's height shrinks towards its text (no less than 30% of the available height), and the image's bottom edge is inside the 551 px canvas

#### Scenario: Long content keeps room for the image
- **WHEN** the content's text is taller than 60% of the available height and the user selects "Below"
- **THEN** the content box takes 60% of the available height and the image fits in the remaining space

### Requirement: Right preset
Selecting "Right" SHALL position the image in the right portion of the content box's bounds and shrink the content box's width so the two do not overlap. The content box used SHALL be the slide's effective one: its `geometry.content` when declared, otherwise the layout's content position.

#### Scenario: Choosing Right narrows the content box
- **WHEN** a user selects "Right" for a pasted image
- **THEN** the content box's width shrinks to make room, and the image occupies the freed right-hand portion at the content box's original height

## REMOVED Requirements

### Requirement: Pasted image is extracted into a draggable layout element
**Reason**: Only the last `<img>` of a slide without `geometry` could be positioned, through a layout-level element that forced a layout fork to persist. Per-slide `geometry.images` positions any number of images, keyed by `src`, without touching layout files.
**Migration**: Images stay in normal content flow unless `geometry.images` positions them. Choose a paste preset, or add a `geometry.images` entry (`{ src, x, y, w, h }`), to position an image; drag it from the Layout tab afterwards. Slides already on a `layout-<ts>` fork keep their previous behaviour, since the fork is a full copy of the layout.

### Requirement: New image elements default to aspect-locked
**Reason**: The layout-level `image` element no longer exists.
**Migration**: Frontmatter-positioned images (`geometry.images`) already default to aspect-locked in the Layout tab (see slide-geometry).

### Requirement: Preset selection auto-saves via a per-slide layout fork
**Reason**: Forking copies the whole layout into the project, so the slide stops receiving theme fixes, and it required a page reload.
**Migration**: Presets now write the slide's `geometry` frontmatter (see "Preset selection writes the slide's geometry"). Existing `layout-<ts>` files and the slides pointing at them are left untouched.
