## Why

Adding an image to a slide today means manually saving a file into `public/images/` and hand-writing the markdown `![]()` reference — a manual asset pipeline the README's roadmap calls out as friction to remove. The first, highest-leverage slice of that roadmap item is letting a user paste an image straight from their clipboard while editing and have it show up in the slide's markdown immediately, with no manual file handling and no dependency on the layout editor (positioning/cropping is a later slice).

## What Changes

- New always-on paste listener (mounted in `setup/global-top.vue`, not scoped to the side editor) that detects an image in clipboard data on `paste` and intercepts it.
- New Vite dev-server middleware `/api/save-image` (in `vite.config.ts`, mirrored into `e2e/vite.config.ts`) that writes the pasted image blob to `public/images/paste-<timestamp>.<ext>`.
- Markdown insertion behavior differs by editor state:
  - **Side editor open**: splice `![](/images/paste-<timestamp>.<ext>)` directly into the content textarea's live model (found via a marker attribute added in `_override/SideEditor.vue`), at the cursor if focused, so it rides the existing dirty → throttled `save()` → `update()` pipeline.
  - **Side editor closed**: append the markdown to the current slide's content directly via Slidev's `useNav()` / `useDynamicSlideInfo()` `update()` API (the same API `_override/SideEditor.vue` already calls), since there is no in-flight unsaved buffer to protect.
- No changes to the layout editor, positioning, cropping, or resizing — pasted images land as plain inline markdown images only.

## Capabilities

### New Capabilities
- `image-paste`: Detecting a pasted image on the clipboard while a presentation is open in the dev server, persisting it to `public/images/`, and inserting a markdown image reference into the current slide's content, working whether the side editor panel is open or closed.

### Modified Capabilities
(none — no existing capability's requirements change)

## Impact

- `setup/global-top.vue` — gains a global paste listener (currently an empty stub).
- `_override/SideEditor.vue` — gains a marker attribute on the content textarea so the global listener can find it while the panel is open.
- `vite.config.ts` / `e2e/vite.config.ts` — gains `/api/save-image` middleware, kept in sync manually per existing project convention.
- `public/images/` — new pasted-image files written here at runtime.
- New unit tests for the insertion/upload logic; one new e2e test for the full paste flow.
