## MODIFIED Requirements

### Requirement: Every layout element is fully resizable
Every layout editor element (`red-bar`, `logo`, `title`, `content`, `image`) SHALL support both dragging (x/y) and resizing (w/h) via a corner (`se`, or `sw` for right-anchored elements) handle, with width and height values rendered into the slide via CSS custom properties and included in the exported CSS output. The `image` element only exists (and only appears in the element list) when the current slide has a trackable pasted image.

#### Scenario: Resizing the logo updates its rendered size
- **WHEN** a user drags the logo's resize handle
- **THEN** the `<img>` element's rendered width and height change to match `positions.logo.w` / `positions.logo.h`

#### Scenario: Resizing the red bar changes both dimensions
- **WHEN** a user drags the red bar's resize handle
- **THEN** both the red bar's width and height change (it is no longer locked to `width: 100%`)

#### Scenario: Exported CSS includes logo and red-bar dimensions
- **WHEN** a layout is saved
- **THEN** the exported CSS for `.logo` and `.red-bar` includes explicit `width` and `height` declarations reflecting their current position/size

#### Scenario: Resizing the image element updates its rendered size
- **WHEN** a user drags the `image` element's resize handle
- **THEN** the extracted `<img>`'s rendered width and height change to match `positions.image.w` / `positions.image.h`

### Requirement: Per-element aspect-ratio lock defaults to off
Each element SHALL have an independent `aspectLocked` boolean, toggleable via a lock/unlock button rendered next to that element's row in the SideEditor's element list. This defaults to `false` for `red-bar`, `logo`, `title`, and `content`. The `image` element is an exception: it defaults to `true` when first created (see the `image-position` capability), using the pasted image's natural aspect ratio.

#### Scenario: New non-image element starts unlocked
- **WHEN** the layout editor loads with no prior saved lock state
- **THEN** every element other than `image` has `aspectLocked` value `false`

#### Scenario: Toggling the lock button
- **WHEN** a user clicks an element's lock button in the SideEditor element list
- **THEN** that element's `aspectLocked` value flips, and only that element is affected
