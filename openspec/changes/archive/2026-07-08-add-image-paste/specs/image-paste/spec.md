## ADDED Requirements

### Requirement: Paste image while side editor is open
While the Slidev dev server is running and the side editor panel is open, pasting an image from the clipboard SHALL save the image to `public/images/` and insert a markdown image reference into the current slide's content at the content textarea's cursor position, without requiring the layout editor.

#### Scenario: Paste with cursor focused in content textarea
- **WHEN** the side editor's content tab textarea has focus and the user pastes an image from the clipboard
- **THEN** the image is written to `public/images/paste-<timestamp>.<ext>` and `![](/images/paste-<timestamp>.<ext>)` is inserted into the content at the cursor position, and the change is persisted to the slide's markdown file via the existing autosave flow

#### Scenario: Paste while side editor open but a different tab is active
- **WHEN** the side editor is open, the Notes or Layout tab is currently active (not Content), and the user pastes an image
- **THEN** the image is written to `public/images/` and the markdown reference is appended to the content textarea's live value (not re-read from disk), without discarding any unsaved edits already present in that textarea

### Requirement: Paste image while side editor is closed
While the Slidev dev server is running and the side editor panel is closed, pasting an image from the clipboard SHALL save the image to `public/images/` and append a markdown image reference to the current slide's content.

#### Scenario: Paste with side editor closed
- **WHEN** the side editor panel is closed and the user pastes an image from the clipboard
- **THEN** the image is written to `public/images/paste-<timestamp>.<ext>` and `![](/images/paste-<timestamp>.<ext>)` is appended to the current slide's markdown content, persisted immediately via Slidev's slide-update API

### Requirement: Image file persistence
Pasted images SHALL be written as files under `public/images/` with a filename derived from the paste timestamp and an extension derived from the clipboard item's MIME type.

#### Scenario: Supported image type
- **WHEN** a pasted clipboard item has MIME type `image/png`, `image/jpeg`, `image/webp`, or `image/gif`
- **THEN** the image is written to `public/images/paste-<timestamp>.<ext>` using the matching extension (`.png`, `.jpg`, `.webp`, `.gif` respectively)

#### Scenario: Unsupported or missing image data
- **WHEN** the clipboard paste event contains no recognized image MIME type
- **THEN** no file is written and no markdown is inserted, and any non-image clipboard content is left to the browser's default paste handling

#### Scenario: Multiple images in one paste
- **WHEN** a paste event's clipboard data contains more than one image item
- **THEN** only the first recognized image item is saved and inserted
