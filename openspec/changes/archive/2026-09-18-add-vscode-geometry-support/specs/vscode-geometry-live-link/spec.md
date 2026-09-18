## ADDED Requirements

### Requirement: The extension links an open document to a running dev server
The extension SHALL be able to attach to a Slidev dev server serving the deck the author is editing, and SHALL verify that the server is serving that same deck before linking a document to it. A slide number is meaningless across decks, so the extension SHALL NOT send or act on slide-addressed messages while the served deck and the open document disagree.

#### Scenario: Attaching to a server serving this deck
- **WHEN** the author opens `tema1.md` and a dev server is serving `tema1.md`
- **THEN** the extension links that document to that server

#### Scenario: The server serves a different deck
- **WHEN** the author opens `tema2.md` and the running dev server is serving `tema1.md`
- **THEN** the extension reports that the preview is showing a different deck and does not send slide-addressed messages for `tema2.md`

#### Scenario: No server is running
- **WHEN** no dev server is reachable
- **THEN** the live-link features are unavailable and every server-free feature of the extension keeps working

### Requirement: The cursor highlights the geometry entry it sits on
While a document is linked, placing the cursor inside a `geometry` entry SHALL request that the corresponding element be highlighted in the preview, and moving the cursor out of every geometry entry SHALL clear the highlight.

#### Scenario: Cursor enters an entry
- **WHEN** the cursor moves onto the `geometry.elements[2]` entry of slide 14 in a linked document
- **THEN** the extension requests a highlight of that entry, and the element it positions is highlighted in the open preview

#### Scenario: Cursor leaves geometry
- **WHEN** the cursor then moves to ordinary slide content
- **THEN** the highlight request is cleared

### Requirement: A drag in the preview is applied to the live document
While a document is linked and the extension holds control of geometry writes, a drag emitted by the theme SHALL be applied to the open VSCode document rather than to the file on disk. The entry SHALL be located by the stable key carried in the drag event, not by list position. The edit SHALL be applied as a single undoable document edit, so the author can undo a drag with the editor's own undo.

#### Scenario: Applying a drag
- **WHEN** a drag naming slide 14, key `id: flow`, and a new rect arrives for a linked document
- **THEN** that entry's rect in the document is replaced with the new rect

#### Scenario: A drag is undoable
- **WHEN** a drag has been applied and the author invokes undo in the editor
- **THEN** the document returns to its state before the drag

#### Scenario: The rect the drag came from no longer matches
- **WHEN** the arriving drag's original rect differs from the rect currently in the document, because the preview was rendering an older version of the file
- **THEN** the new rect is applied anyway, since the drag expresses where the author put the element

#### Scenario: The entry has been removed
- **WHEN** the arriving drag names a key that no longer appears in the document
- **THEN** no edit is made and the author is warned that the entry is no longer in the file

#### Scenario: Slide identity has drifted
- **WHEN** the document's slide boundaries differ from those the preview was rendering, so the drag's slide number may not name the same slide
- **THEN** no edit is made and the author is warned that the preview is stale and asked to re-sync

### Requirement: Applying a drag saves the document
Applying a drag SHALL save the document, so the dev server reloads the deck and the preview reflects the new rect. The drag edit and any changes the author had not yet saved SHALL be saved together in a single write, rather than being saved before and after the drag. Because saving a document in VSCode saves the whole file, this also commits the author's unrelated pending edits and triggers any configured format-on-save; the extension SHALL provide a setting to turn saving on drag off.

#### Scenario: Dragging with unsaved changes elsewhere
- **WHEN** the author has unsaved edits on slide 3 and drags an element on slide 14 in the preview
- **THEN** the drag is applied to the document and the document is saved once, committing both the drag and the slide 3 edits

#### Scenario: Dragging with a clean document
- **WHEN** the author drags an element in the preview and the document has no unsaved changes
- **THEN** the drag is applied and the document is saved

#### Scenario: Saving on drag is disabled
- **WHEN** the setting to save on drag is turned off and the author drags an element
- **THEN** the drag is applied to the document and the document is left unsaved

### Requirement: The official Slidev extension is reused, not required
The extension SHALL reuse the official Slidev extension's preview rather than providing a preview webview of its own, and SHALL declare it as a recommended companion rather than a hard dependency. Features that need a preview SHALL prompt to install it when it is absent; every feature that does not need one SHALL keep working without it.

#### Scenario: The companion extension is missing
- **WHEN** the author invokes a geometry inspection command and the official Slidev extension is not installed
- **THEN** the author is prompted to install it, with an action that does so

#### Scenario: Server-free features without the companion
- **WHEN** the official Slidev extension is not installed and the author opens a deck
- **THEN** geometry diagnostics, completions, quick fixes, and all pre-existing extension features work normally
