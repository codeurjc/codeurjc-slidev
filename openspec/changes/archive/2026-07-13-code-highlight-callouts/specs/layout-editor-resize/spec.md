## ADDED Requirements

### Requirement: Editor position/hidden/lock records support dynamic per-slide keys
In addition to the fixed element set (`red-bar`, `logo`, `title`, `content`, `image`), the editor's `positions`, `hidden`, and `aspectLocked` records SHALL support an arbitrary number of additional dynamically-keyed entries scoped to the current slide (for example, one per code-highlight callout, keyed as `callout:<highlight-id>`), without changing the drag, resize, undo, or save behavior already defined for the fixed elements.

#### Scenario: Fixed elements unaffected by dynamic keys
- **WHEN** a slide has zero, one, or many dynamically-keyed callout entries in addition to the five fixed elements
- **THEN** the fixed elements' drag, resize, aspect-lock, and save behavior is identical to a slide with no dynamic entries

#### Scenario: Dynamic entries persist across saves and reloads
- **WHEN** a dynamically-keyed entry's position is set (e.g. by dragging a callout) and the layout is saved
- **THEN** reopening the slide restores that entry's position from the saved markup, the same way `image`'s position is restored today

#### Scenario: Dynamic entries participate in undo
- **WHEN** a dynamically-keyed entry's position changes and the presenter presses undo
- **THEN** that entry's position reverts along with any fixed-element changes at the same point in the undo stack

#### Scenario: Dynamic entries are not required to expose lock/hide UI
- **WHEN** a dynamically-keyed entry (e.g. a callout) has no lock or hide toggle rendered in the SideEditor
- **THEN** its underlying `aspectLocked`/`hidden` record values simply remain at their default and are not toggled, without errors
