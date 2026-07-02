## Why

The layout editor's resize handle already exists on every element (including the logo), but resizing is only partially wired up: the logo's width/height are never rendered or exported, and the red bar is hardcoded to a full-width strip that can only change height. Freely stretching any element (especially the logo image) also risks distorting it, since there's no way to preserve its aspect ratio while resizing. This change makes every element genuinely and consistently resizable, and adds a per-element aspect-ratio lock (off by default) so drags can be locked to proportional when explicitly enabled.

## What Changes

- Wire the logo's width/height through the same pipeline title/content already use: CSS custom properties, `rootStyle`, `VAR_MAP`, `cssOutput`, and the `<img>` styling (replacing the hardcoded `height: 48px; width: auto`).
- **BREAKING**: Red Bar becomes a fully positionable/resizable box like Title/Content (draggable x/y, resizable w/h via a corner handle) instead of a pinned `top:0; left:0; width:100%` strip with height-only resize. Existing saved layouts that rely on the red bar always spanning full width will need to be re-saved/re-adjusted after this change if they're edited again.
- Add an `aspectLocked` boolean per element (default `false` for all four elements: red-bar, logo, title, content), toggleable via a new lock/unlock button next to each row in the SideEditor's element list.
- When locked, resizing (via handle drag or the numeric W/H inputs) preserves the aspect ratio captured from the element's current w/h at the start of the edit gesture — no separately stored "locked ratio," it's just derived live each time.
- Persist `aspectLocked` state the same way `hidden` is persisted today: a `data-aspect-locked` attribute (storing the locked exceptions, since unlocked is the default) round-tripped through `useEditor`'s snapshot/undo system and the `/api/save-layout` middleware.
- Give the logo's resize handle proper `invertX`-aware resize math (mirroring the existing drag behavior) so the handle visually tracks the cursor instead of staying glued to the screen-fixed right edge.

## Capabilities

### New Capabilities
- `layout-editor-resize`: Resizing behavior for layout editor elements — per-element aspect-ratio lock (default off), proportional resize math, right-anchored (`invertX`) handle tracking, and full w/h/x/y resizability for every element including the logo image and the red bar.

### Modified Capabilities
(none — no existing specs yet in this project)

## Impact

- `composables/useEditor.ts`: `ELEMENTS` config (logo/red-bar `cssOutput`, `initial` rects), `_sharedAspectLocked` state, `Snapshot` interface, `startResize`/`onResize`/`onDrag` math, `rootStyle`, undo/reset/snapshot logic.
- `layouts/default.vue` (and its e2e symlink counterpart): `VAR_MAP`, red-bar template markup (handle type, drag wiring), logo `<img>` CSS, restore-on-mount logic for `data-aspect-locked`.
- `_override/SideEditor.vue`: element list UI (lock/unlock button per row), numeric W/H inputs respecting the lock.
- `vite.config.ts`: `/api/save-layout` middleware — extend `VAR_MAP` for red-bar/logo w/h, persist `data-aspect-locked`.
- Existing saved layout `.vue` files that used the red bar as a fixed full-width strip.

## Amendment (post-implementation)

Default flipped from locked to **unlocked** for all elements, based on follow-up feedback after initial implementation. The logo's default box size (`120x48`) was also corrected to `80x48` to match the actual `public/images/logo.png` intrinsic ratio (774x467 ≈ 1.66:1) — the mismatch caused the logo to render visibly stretched even without any user resizing, since the `<img>` was given explicit `width`/`height` instead of the previous `height: 48px; width: auto`. The `<img>` now also uses `object-fit: contain` as a safety net against future logo-asset swaps reintroducing distortion.
