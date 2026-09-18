## ADDED Requirements

### Requirement: An external controller can attach to the dev server
The theme's Vite plugin SHALL expose a controller channel on the dev server, carrying commands from an external controller to every connected slide client and events back from those clients to the controller. Commands SHALL reach the client over Vite's HMR channel rather than the page URL, so inspection works in any preview surface — including embedded previews whose iframe URL the theme does not control.

#### Scenario: Attaching while a preview is open
- **WHEN** a controller attaches to the dev server of a project whose deck is already open in a preview
- **THEN** the controller receives the identity of the deck being served, and subsequent commands reach that already-open preview without reloading it

#### Scenario: Commands reach an embedded preview
- **WHEN** the deck is displayed inside an embedded preview loaded as `<server>/<n>?embedded=true`, whose URL the controller cannot modify
- **THEN** an inspection command from the controller still takes effect in that preview

#### Scenario: A preview opened after attaching
- **WHEN** a controller has turned inspection on, and a preview of the deck is opened or reloaded afterwards
- **THEN** that preview shows the inspection state the controller asked for, without the controller resending it

#### Scenario: No controller attached
- **WHEN** no controller is attached to the dev server
- **THEN** the deck renders and behaves exactly as it does today, with no inspection overlay and no change to geometry write-back

### Requirement: Inspection mode outlines every geometry entry over the real render
While inspection mode is on, a `default`-layout slide SHALL draw a labelled outline over its rendered content for each entry in its `geometry` frontmatter. Each outline SHALL identify the entry it came from, including its collection and index. Entries that resolved to a target and entries that resolved to nothing SHALL both be reported, since an unresolved entry produces no visible difference in the render on its own.

#### Scenario: A resolved element entry
- **WHEN** inspection mode is on and a slide declares `geometry.elements: [{id: flow, x: 510, y: 390, w: 440, h: 140}]` matching a mermaid fence tagged `{id: 'flow'}`
- **THEN** a labelled outline identifying `elements[0]` is drawn over that diagram at its positioned rect

#### Scenario: An entry that matched nothing
- **WHEN** inspection mode is on and a slide declares `geometry.elements: [{id: missing, …}]` that matches no element on the slide
- **THEN** the entry is reported as unresolved, distinguishably from a resolved entry, rather than being silently absent

#### Scenario: Inspection shows drag handles
- **WHEN** inspection mode is turned on while the Layout tab is closed
- **THEN** editor mode turns on with it, so every positioned element has a drag handle, and turning inspection off restores the editor state the Layout tab had

#### Scenario: Inspection does not alter the rendered slide
- **WHEN** inspection mode is turned on and then off for a slide
- **THEN** the slide's own layout, positions, and content are identical before and after, with only the overlay added and removed

### Requirement: The controller can highlight a single entry
The controller SHALL be able to request that one geometry entry, named by slide and by its collection and index, be highlighted distinctly from the other outlines. Requesting a highlight for an entry that does not exist SHALL leave the overlay unchanged rather than failing.

#### Scenario: Highlighting an entry
- **WHEN** the controller requests a highlight for `elements[2]` of slide 14 while inspection mode is on
- **THEN** that entry's outline is rendered distinctly from the slide's other outlines

#### Scenario: Highlighting a stale entry
- **WHEN** the controller requests a highlight for an entry index the slide no longer has
- **THEN** no entry is highlighted and the overlay otherwise stays as it was

### Requirement: Controlled mode delegates geometry writes to the controller
While a controller is attached and has claimed control of geometry writes, finishing a drag or resize of a frontmatter-positioned element SHALL emit a drag event to the controller instead of writing the slide's `geometry` frontmatter. The event SHALL name the element by its stable key rather than by list position, and SHALL carry both the rect the element was moved from and the rect it was moved to. The theme SHALL keep showing the dragged element at its new position while the write is outstanding.

#### Scenario: A drag under controlled mode
- **WHEN** a controller has claimed geometry writes and the user drags the element positioned by `{id: flow, x: 510, y: 390, w: 440, h: 140}` to x 300, y 200
- **THEN** a drag event naming that slide, the key `id: flow`, the original rect, and the new rect is emitted to the controller, and the theme does not patch the slide's frontmatter itself

#### Scenario: Control is released
- **WHEN** the controller detaches or releases control of geometry writes, and the user then drags a positioned element
- **THEN** the theme writes the new rect into the slide's `geometry` frontmatter itself, as it does with no controller present

#### Scenario: The element stays where it was dropped
- **WHEN** a drag under controlled mode has been emitted and the controller has not yet applied it
- **THEN** the dragged element continues to render at the position it was dropped at, rather than snapping back
