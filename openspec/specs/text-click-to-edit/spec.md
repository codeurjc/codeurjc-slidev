# text-click-to-edit

## Purpose

Lets a presenter, while running the Slidev dev server, double-click any rendered block of slide content to jump straight into editing it: the custom SideEditor opens (or switches) to the Content tab with the corresponding raw-markdown text range selected in the textarea. This shortcuts the normal flow of manually locating text in the Content tab's source view. The feature only exists in the dev environment, stays out of the way while the Layout tab is active (which already repurposes clicks/drags for repositioning elements), and degrades gracefully — opening the Content tab without guessing a selection — when a double-clicked element can't be confidently mapped back to source.

## Requirements

### Requirement: Double-click opens the Content tab with the source block selected
Double-clicking a block-level rendered element within a slide's content (paragraph, heading including the slide title, list item, blockquote, table row/cell, code block, or standalone image) SHALL open the SideEditor if it is closed, switch it to the Content tab if another tab is active, and select the raw-markdown text range corresponding to that block in the Content tab's textarea.

#### Scenario: Double-click on a paragraph with the editor closed
- **WHEN** the SideEditor is closed and the presenter double-clicks a rendered paragraph
- **THEN** the SideEditor opens on the Content tab with that paragraph's raw-markdown text selected in the textarea

#### Scenario: Double-click on the slide title
- **WHEN** the presenter double-clicks the rendered slide title
- **THEN** the Content tab's textarea selects the title's raw-markdown line (e.g. `# Title text`)

#### Scenario: Double-click on a list item
- **WHEN** the presenter double-clicks a rendered list item, including one nested inside another list
- **THEN** only that list item's raw-markdown text is selected, not the whole list

#### Scenario: Double-click while another tab is active
- **WHEN** the Notes tab is active and the presenter double-clicks rendered slide content
- **THEN** the SideEditor switches to the Content tab and selects the matching block

### Requirement: Feature is inert outside the dev server
This interaction SHALL NOT be present in exported or otherwise built/presented output — it only exists while the Slidev dev server (and its SideEditor) is running.

#### Scenario: Exported presentation
- **WHEN** a presentation has been exported (e.g. to PDF or a static build) and viewed outside the dev server
- **THEN** double-clicking slide text has no special effect beyond the browser's native word-selection behavior

### Requirement: Disabled while the Layout tab is active
Double-click-to-edit SHALL NOT trigger while the Layout tab is active (`editor.editing.value === true`), since that mode already repurposes clicks/drags on slide elements for repositioning.

#### Scenario: Double-click during layout editing
- **WHEN** the Layout tab is active and the presenter double-clicks an element on the slide
- **THEN** no Content-tab switch or text selection occurs; existing layout-editing click/drag behavior is unaffected

### Requirement: Graceful degradation on unresolved mapping
When the double-clicked block cannot be confidently mapped to a raw-markdown range (e.g. it falls inside a Slidev construct the mapping doesn't recognize), the SideEditor SHALL still open to the Content tab, but SHALL NOT change or guess at a text selection.

#### Scenario: Double-click inside an unrecognized construct
- **WHEN** the double-clicked element sits inside a Slidev-specific wrapper the block mapping does not recognize
- **THEN** the SideEditor opens on the Content tab with no new selection applied, leaving prior cursor/selection state untouched
