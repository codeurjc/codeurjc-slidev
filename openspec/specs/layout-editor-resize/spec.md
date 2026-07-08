## ADDED Requirements

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

### Requirement: Locked resize preserves current aspect ratio
When an element's `aspectLocked` is `true`, resizing it (via handle drag or the numeric W/H inputs) SHALL preserve the aspect ratio equal to that element's width divided by height at the start of the resize gesture (or at focus-in for numeric inputs), deriving the non-driving dimension from that ratio rather than allowing width and height to change independently.

#### Scenario: Dragging a locked element's corner handle
- **WHEN** a user drags the resize handle of an element with `aspectLocked: true`
- **THEN** the element's width and height both change together, maintaining the ratio captured at the start of the drag

#### Scenario: Dragging an unlocked element's corner handle
- **WHEN** a user drags the resize handle of an element with `aspectLocked: false`
- **THEN** width and height change independently based on cursor movement, as today

#### Scenario: Editing the numeric width field while locked
- **WHEN** a user changes the "W" input for a locked element in the SideEditor Properties panel
- **THEN** the "H" value updates automatically to preserve the ratio captured when the W field was focused

#### Scenario: Ratio reflects the most recent unlocked edit
- **WHEN** an element was resized while unlocked (changing its w/h ratio) and is then locked again
- **THEN** subsequent locked resizes preserve the new current ratio, not any previously locked ratio

### Requirement: Right-anchored elements resize with cursor-tracking handle
For elements positioned relative to a fixed edge other than top-left (currently only `logo`, anchored by `right`), the resize handle SHALL be positioned on the corner that visually moves as the element resizes, and resize deltas SHALL be inverted on that axis so the handle tracks the cursor during drag.

#### Scenario: Resizing the logo tracks the cursor
- **WHEN** a user drags the logo's resize handle horizontally
- **THEN** the handle's screen position follows the cursor continuously, rather than remaining fixed at the container's screen-anchored edge

### Requirement: Aspect-lock state persists across saves and reloads
The `aspectLocked` state for all elements SHALL be included in the editor's undo/reset snapshot, restored on mount from the layout's saved markup, and persisted by the layout-save API by storing only the set of elements whose lock is on (since unlocked is the default).

#### Scenario: Saving a layout with a custom lock state
- **WHEN** a user locks the logo's aspect ratio and saves the layout
- **THEN** the saved layout file records that the logo is locked (e.g. via a `data-aspect-locked` attribute listing locked element names), while other elements remain implicitly unlocked

#### Scenario: Reopening a saved layout restores lock state
- **WHEN** a layout previously saved with the logo locked is reopened in the editor
- **THEN** the logo's lock button shows locked, and all other elements show unlocked

#### Scenario: Undo restores prior lock state
- **WHEN** a user toggles an element's lock, makes further edits, and then presses undo enough times to pass that toggle
- **THEN** the element's `aspectLocked` value reverts along with position/hidden state at that point in the undo stack
