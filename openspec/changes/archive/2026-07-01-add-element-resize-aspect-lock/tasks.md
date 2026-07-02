## 1. `useEditor.ts` — aspect-lock state and Snapshot

- [x] 1.1 Add `_sharedAspectLocked` reactive map, initialized to `true` for every key in `ELEMENTS`.
- [x] 1.2 Extend `Snapshot` interface with `aspectLocked: Record<string, boolean>`; update `clonePositions`-sibling `cloneAspectLocked` helper.
- [x] 1.3 Wire `aspectLocked` into `pushUndoCheckpoint`, `commitUndo` (change detection), `undo`, `resetLayout`, `dirty`, and the initial `snapshot` value, mirroring how `hidden` is threaded through each.
- [x] 1.4 Add `toggleAspectLock(name: string)` and expose `aspectLocked` from the composable's return object.
- [x] 1.5 Add `setAspectLocked(overrides: Record<string, boolean>)` for mount-time restoration, mirroring `setHidden`.

## 2. `useEditor.ts` — resize math

- [x] 2.1 In `startResize`, if `aspectLocked[name]` is true, capture `ratio = p.w / p.h` into `resizeState`.
- [x] 2.2 In `onResize`, when locked, compute `dx`/`dy` as today, pick the axis with larger `Math.abs(delta)` as driving, derive the other dimension from `ratio`, clamping both to existing minimums (20 / 10).
- [x] 2.3 Add `invertX` handling to `onResize` (read `ELEMENTS[name].invertX`) so growing width for right-anchored elements extends from the anchored edge outward (invert `dx` before applying), matching `onDrag`'s existing `xMul` pattern.

## 3. `ELEMENTS` config — logo and red-bar full resizability

- [x] 3.1 Update `logo.cssOutput` to include `width: ${pos.w}px; height: ${pos.h}px;` alongside existing `top`/`right`/`z-index`.
- [x] 3.2 Update `red-bar.initial` to include a real starting `w` (full slide width equivalent) instead of relying on hardcoded `100%`; update `red-bar.cssOutput` to emit `top`, `left`, `width`, `height` from `pos` instead of hardcoded `top:0; left:0; width:100%`.
- [x] 3.3 Add `--ed-logo-w` / `--ed-logo-h` and `--ed-red-w` / `--ed-red-x` / `--ed-red-y` (as needed) to `rootStyle`'s computed CSS var map.

## 4. `layouts/default.vue` — template and CSS

- [x] 4.1 Extend `VAR_MAP` for `logo` (`w`, `h`) and `red-bar` (`x`, `y`, `w`) to match the new exported vars.
- [x] 4.2 Change the logo's resize handle from `se` to `sw` (right-anchored), keep `@mousedown.stop="editor.startResize($event, 'logo')"`.
- [x] 4.3 Change `.logo img` CSS from hardcoded `height: 48px; width: auto` to `width: var(--ed-logo-w, 120px); height: var(--ed-logo-h, 48px)`.
- [x] 4.4 Change red-bar template: replace the `b` (bottom-only) handle with a corner (`se`) handle; ensure `startDrag`/`startResize` wiring stays intact.
- [x] 4.5 Update `.red-bar` CSS from `top:0; left:0; width:100%` to using `--ed-red-y`, `--ed-red-x`, `--ed-red-w` custom properties (with sensible fallbacks matching current visual defaults).
- [x] 4.6 Add `data-aspect-locked` restoration logic in `onMounted`: parse the attribute, call `editor.setAspectLocked(...)`, defaulting unlisted elements to locked.
- [x] 4.7 Add a `watch(editor.aspectLocked, ...)` that writes/removes the `data-aspect-locked` attribute on `rootEl`, mirroring the existing `watch(editor.hidden, ...)`.
- [x] 4.8 Update the root div's default static `style`/`data-styles` attribute strings to include the new red-bar/logo w/h custom properties with their default values, matching the existing pattern for title/content.

## 5. `_override/SideEditor.vue` — lock button and numeric input behavior

- [x] 5.1 Add a lock/unlock icon button to each `.lep-el` row, `@click.stop="editor.toggleAspectLock(name)"` (stop propagation so it doesn't also select the element), showing locked/unlocked icon state from `editor.aspectLocked[name]`.
- [x] 5.2 In the Properties panel, wire the W/H numeric inputs so that on focus of either field while `editor.aspectLocked[selected]` is true, capture the current ratio; on input, if locked, recompute the other dimension from that captured ratio and assign it alongside the edited value.
- [x] 5.3 Add minimal styling for the new lock button consistent with existing `.lep-el` row styling (small icon, doesn't disrupt row layout/click target for selection).

## 6. `vite.config.ts` — persistence middleware

- [x] 6.1 Extend the middleware's `VAR_MAP` constant to match the new `logo`/`red-bar` entries added in `layouts/default.vue`.
- [x] 6.2 Read `body.aspectLocked` from the request; compute the unlocked-name list (elements where `aspectLocked[name] === false`).
- [x] 6.3 Replace/insert a `data-aspect-locked="..."` attribute on the root div in the written layout file content, mirroring the existing `data-hidden` replace/insert logic (strip if empty, i.e. everything locked).
- [x] 6.4 Update `SideEditor.vue`'s `onSaveLayout` to read `data-aspect-locked` from the DOM (same pattern as `data-hidden`) and include `aspectLocked` in the POST body.

## 7. Tests

- [x] 7.1 Unit test (`composables/__tests__/`): resizing a locked element via `onResize` preserves ratio; unlocked resizes width/height independently.
- [x] 7.2 Unit test: `invertX` element (logo) resize inverts dx correctly and handle-relevant state matches expected direction.
- [x] 7.3 Unit test: toggling lock, undo, and snapshot/dirty/reset all correctly include `aspectLocked`.
- [x] 7.4 Unit test: numeric W/H input recompute-on-focus behavior for locked elements.
- [x] 7.5 E2e test (`tests/`): drag-resize the logo in the browser, verify rendered `<img>` width/height change and ratio is preserved by default.
- [x] 7.6 E2e test: toggle lock off for an element, resize non-proportionally, save, reload the layout, verify lock state and size persisted.
- [x] 7.7 E2e test: resize the red bar on both axes (not just height) and verify exported CSS reflects both.
- [x] 7.8 Run `pnpm test && pnpm test:e2e` and confirm all pass, including pre-existing tests unaffected by the red-bar behavior change.

## 8. Cleanup

- [x] 8.1 Verify existing saved layout `.vue` files under `layouts/` still render correctly unmodified (no forced migration).
- [x] 8.2 Update `CLAUDE.md` if the red-bar behavior change or aspect-lock feature warrants a mention in the architecture overview.
