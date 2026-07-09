## 1. Dependency setup

- [x] 1.1 Add `markdown-it` as a direct dependency in `package.json` (pinned to the transitively-resolved 14.x already present; skipped `@types/markdown-it` since `markdown-it` ships its own `index.d.ts` and this repo has no `tsc` type-check step)

## 2. Raw-markdown block parsing

- [x] 2.1 Create `composables/useTextClickToEdit.ts` with a function that parses a raw-markdown string via `markdown-it` and returns an ordered list of block tokens with `{ type, startLine, endLine }`
- [x] 2.2 Add a helper to convert a `[startLine, endLine)` range into a `[charStart, charEnd)` offset range against the same raw-markdown string
- [x] 2.3 Unit test: parsing covers paragraphs, headings, nested lists (list items as individual blocks), blockquotes, fenced code blocks, tables, and standalone images, in document order

## 3. DOM block walking and pairing

- [x] 3.1 Add a DOM walk over `.content-inner` that collects block-level elements (`p`, `li`, `h1`-`h6`, `blockquote`, `pre`, `tr`) in document order (a standalone image is markdown-it's own `paragraph_open` wrapping just an image, so it's already covered by `p` -- no separate image-token handling needed)
- [x] 3.2 Skip Slidev wrapper elements/classes (`v-click` groups, custom container wrappers) implicitly: `BLOCK_SELECTOR` only matches semantic content tags, so `closest()`/`querySelectorAll` walk straight past any wrapper `<div>` without it ever being a candidate block
- [x] 3.3 Add pairing logic (`resolveBlockRange`): index-match the DOM block walk against the parsed markdown block list; return `null` (no confident mapping) if counts disagree or a block type mismatches unexpectedly
- [x] 3.4 Unit test: pairing holds across nested lists/blockquotes, and returns `null` gracefully when counts disagree

## 4. Double-click wiring in global-top.vue

- [x] 4.0 Add shared `activeTab` state to `useEditor.ts` (singleton, alongside `editing`/`selected`) and switch `_override/SideEditor.vue`'s local `tab` ref to alias it, so external code can switch to the Content tab -- this was needed for 4.4 since the tab was previously local-only component state
- [x] 4.1 Add a `dblclick` window listener in `global-top.vue`, mirroring the existing `paste` listener's mount/unmount pattern
- [x] 4.2 Guard: no-op if `editor.editing.value` is true (Layout tab active)
- [x] 4.3 Guard: no-op if the double-click target isn't inside `.content-inner`
- [x] 4.4 On qualifying double-click: find the nearest block-level ancestor, run the DOM/markdown-it pairing, and if resolved, open the SideEditor (`showEditor.value = true`), switch to the Content tab, and call `textarea.setSelectionRange(charStart, charEnd)` plus `.focus()` on `[data-editor="content"] textarea`
- [x] 4.5 On unresolved mapping: still open the SideEditor to the Content tab, but leave the textarea's selection/cursor untouched

## 5. Verification

- [x] 5.1 `pnpm test` — new unit tests pass alongside existing suite (82/82 passed)
- [x] 5.2 `pnpm test:e2e` — added `tests/text-click-to-edit.spec.ts` covering: double-click a paragraph opens the editor with the right text selected; double-click the title selects the title line; double-click during Layout tab editing does nothing. Full suite: 33/33 passed, no regressions
- [x] 5.3 Manually verified in `pnpm dev`: paragraph, title, nested list item, code block, and a pasted image all select correctly on double-click; an intentionally awkward construct degrades to "editor opens, no selection" rather than a wrong selection
