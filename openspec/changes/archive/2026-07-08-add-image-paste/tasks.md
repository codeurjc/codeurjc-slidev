## 1. Image upload middleware

- [x] 1.1 Add `/api/save-image` middleware to `vite.config.ts`: accept a POST body (raw binary + mime-type header, or multipart), derive extension from MIME type (`image/png`→`.png`, `image/jpeg`→`.jpg`, `image/webp`→`.webp`, `image/gif`→`.gif`; reject unrecognized types with a 4xx), write to `public/images/paste-<timestamp>.<ext>`, return the written path/filename as JSON.
- [x] 1.2 Mirror the same middleware by hand into `e2e/vite.config.ts`, per the project's existing manual-sync convention for dev-server middleware.

## 2. Content-textarea marker for the open-editor path

- [x] 2.1 In `_override/SideEditor.vue`, add a stable marker (e.g. `data-editor="content"`) to the wrapping element around the content-tab `ShikiEditor` instance so it can be located from outside the component.

## 3. Global paste listener

- [x] 3.0 Relocate `setup/global-top.vue` to `global-top.vue` at the project root (it is currently dead code — Slidev only loads global layer files directly at each resolved root, not under `setup/`), and add `e2e/global-top.vue` as a new symlink to it, mirroring the existing `e2e/layouts/default.vue` pattern.
- [x] 3.1 In `global-top.vue`, add a `paste` event listener (mounted once, always active) that reads `event.clipboardData.items`, finds the first item with a recognized image MIME type, and calls `event.preventDefault()` when found.
- [x] 3.2 On a recognized image paste, POST the blob to `/api/save-image` and get back the written filename.
- [x] 3.3 Branch on `showEditor.value` (from `@slidev/client`'s `state` module):
  - If open: find the marked content textarea in the DOM, splice `![](/images/<file>)` into its value at `selectionStart`/`selectionEnd` (or append if unfocused), and dispatch a native `input` event so the existing `v-model`/dirty/autosave pipeline picks it up.
  - If closed: use `useNav()` + `useDynamicSlideInfo()` to append `![](/images/<file>)` to the current slide's content and call `update()` directly.
- [x] 3.4 No-op (let default paste behavior proceed) when the clipboard has no recognized image data.

## 4. Tests

- [x] 4.1 Unit test: given fake clipboard data and a fake textarea/cursor position, the insertion helper produces the expected spliced markdown and triggers the expected upload call.
- [x] 4.2 Unit test: MIME-type-to-extension mapping, including the unsupported-type no-op case and the multiple-images-in-one-paste case (only first is used).
- [x] 4.3 E2e happy-path test: simulate a clipboard image paste (synthetic `ClipboardEvent` + `DataTransfer` with a `File`) with the side editor open, assert the image file is written and the markdown reference appears in the slide content.
- [x] 4.4 E2e happy-path test: same paste simulation with the side editor closed, assert the markdown reference is appended to the slide's content.

## 5. Verification

- [x] 5.1 `pnpm test && pnpm test:e2e`
- [x] 5.2 Manually verify against the real root dev server (not just the e2e mirror): started `slidev` on the root `slides.md`/`vite.config.ts` and drove a synthetic clipboard paste (headless browser automation, since this sandbox has no real OS clipboard/display) both with the side editor open and closed. Confirmed the image file appears under `public/images/`, the markdown is inserted at the cursor when open, and correctly appended when closed. This surfaced and fixed two real bugs not caught by the e2e suite alone (see design.md "Correction found during manual verification" and the slide-import-guard note).
