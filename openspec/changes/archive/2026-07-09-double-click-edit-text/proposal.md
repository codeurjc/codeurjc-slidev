## Why

Fixing a typo or rewording a line currently means opening the Content tab and hunting through raw markdown to find the sentence a presenter just spotted rendered on the slide. Double-clicking that rendered text to jump straight to (and select) the matching source removes that hunt, speeding up rehearsal/prep edits.

## What Changes

- Add a `dblclick` listener (in `global-top.vue`, alongside the existing `paste` listener) that fires when a presenter double-clicks rendered slide text.
- On a qualifying double-click: open the SideEditor if closed, switch to the Content tab, and select the raw-markdown range for the block-level element (paragraph, heading incl. the slide title, list item, blockquote, table cell/row, code block, or standalone image) that was clicked, via the Content tab's underlying `<textarea>`.
- Map "which rendered block was clicked" to "which raw-markdown block it came from" by parsing the slide's raw content with `markdown-it` (already a Slidev dependency) to get line-mapped block tokens, then pairing those, in document order, against the block-level elements walked from `.content-inner`.
- Scope the listener so it never activates: while the Layout tab is active (`editor.editing.value === true`), or outside the Slidev dev server (this is a dev/rehearsal aid, not a feature of exported/presented output).
- Graceful degradation: if the DOM-to-source block mapping can't be resolved with confidence (e.g. custom containers, `v-click` wrapper mismatches), still open the editor to the Content tab but leave the existing selection/cursor alone rather than guessing wrong.

## Capabilities

### New Capabilities
- `text-click-to-edit`: Double-clicking rendered slide text in the dev server opens the SideEditor's Content tab with the matching raw-markdown block selected.

### Modified Capabilities
(none — this doesn't change requirements of existing capabilities, it adds a new interaction)

## Impact

- `global-top.vue`: new `dblclick` window listener, following the existing `paste` listener pattern.
- New composable (e.g. `composables/useTextClickToEdit.ts`): raw-markdown block parsing (via `markdown-it`) and DOM block-walk/pairing logic, kept separate from `useEditor.ts` (layout/position concerns) per existing separation of concerns.
- `package.json`: add `markdown-it` (and `@types/markdown-it`) as a dependency if not already transitively available for direct import.
- No changes to `vite.config.ts` middleware or `useEditor.ts`'s position/layout state.
