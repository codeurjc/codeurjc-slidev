## MODIFIED Requirements

### Requirement: Every layout element is fully resizable
Every layout editor element (`red-bar`, `logo`, `title`, `content`) SHALL support both dragging (x/y) and resizing (w/h) via a corner (`se`, or `sw` for right-anchored elements) handle, with width and height values rendered into the slide via CSS custom properties and included in the exported CSS output.

#### Scenario: Resizing the logo updates its rendered size
- **WHEN** a user drags the logo's resize handle
- **THEN** the `<img>` element's rendered width and height change to match `positions.logo.w` / `positions.logo.h`

#### Scenario: Resizing the red bar changes both dimensions
- **WHEN** a user drags the red bar's resize handle
- **THEN** both the red bar's width and height change (it is no longer locked to `width: 100%`)

#### Scenario: Exported CSS includes logo and red-bar dimensions
- **WHEN** a layout is saved
- **THEN** the exported CSS for `.logo` and `.red-bar` includes explicit `width` and `height` declarations reflecting their current position/size

#### Scenario: No layout-level image element
- **WHEN** a slide's content contains images and the Layout tab is open
- **THEN** the element list shows only the four fixed elements plus any per-slide entries (such as "Image N (this slide)" for `geometry.images`), with no layout-level "Image" element

### Requirement: Per-element aspect-ratio lock defaults to off
Each element SHALL have an independent `aspectLocked` boolean, toggleable via a lock/unlock button rendered next to that element's row in the SideEditor's element list. This defaults to `false` for `red-bar`, `logo`, `title`, and `content`. Per-slide image entries (`geometry.images`) are the exception and default to `true` (see slide-geometry).

#### Scenario: New non-image element starts unlocked
- **WHEN** the layout editor loads with no prior saved lock state
- **THEN** every fixed element has `aspectLocked` value `false`

#### Scenario: Toggling the lock button
- **WHEN** a user clicks an element's lock button in the SideEditor element list
- **THEN** that element's `aspectLocked` value flips, and only that element is affected

### Requirement: Editor position/hidden/lock records support dynamic per-slide keys
In addition to the fixed element set (`red-bar`, `logo`, `title`, `content`), the editor's `positions`, `hidden`, and `aspectLocked` records SHALL support an arbitrary number of additional dynamically-keyed entries scoped to the current slide (for example, one per code-highlight callout, keyed as `callout:<highlight-id>`), without changing the drag, resize, undo, or save behavior already defined for the fixed elements.

#### Scenario: Fixed elements unaffected by dynamic keys
- **WHEN** a slide has zero, one, or many dynamically-keyed callout entries in addition to the four fixed elements
- **THEN** the fixed elements' drag, resize, aspect-lock, and save behavior is identical to a slide with no dynamic entries

#### Scenario: Dynamic entries persist across saves and reloads
- **WHEN** a dynamically-keyed entry's position is set (e.g. by dragging a callout) and the layout is saved
- **THEN** reopening the slide restores that entry's position from the saved markup, the same way the fixed elements' positions are restored

#### Scenario: Dynamic entries participate in undo
- **WHEN** a dynamically-keyed entry's position changes and the presenter presses undo
- **THEN** that entry's position reverts along with any fixed-element changes at the same point in the undo stack

#### Scenario: Dynamic entries are not required to expose lock/hide UI
- **WHEN** a dynamically-keyed entry (e.g. a callout) has no lock or hide toggle rendered in the SideEditor
- **THEN** its underlying `aspectLocked`/`hidden` record values simply remain at their default and are not toggled, without errors
