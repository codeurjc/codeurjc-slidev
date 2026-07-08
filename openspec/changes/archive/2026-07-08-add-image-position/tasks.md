## 1. `useEditor.ts`: image element

- [x] 1.1 Add `image` to the `ELEMENTS` registry (label, color, `cssOutput`) alongside `red-bar`/`logo`/`title`/`content`.
- [x] 1.2 Default `hidden.image` to `true` and only surface it in `elementNames`/the SideEditor element list once a slide actually has a trackable image (vs. the other four, which always exist). (Implemented as a runtime-derived value in layouts/default.vue, see task 2 — not a persisted flag; see design.md correction.)
- [x] 1.3 Add the "new image defaults to aspect-locked" exception: when an `image` element is created for the first time on a slide, set `aspectLocked.image = true` and derive initial `w`/`h` from the pasted image's natural aspect ratio (read via `Image()` client-side). (Static default done here; natural-aspect-ratio sizing happens in the preset math, task 3, fed by layouts/default.vue's detection, task 2.)

## 2. `layouts/default.vue`: image extraction and overlay

- [x] 2.1 Add a CSS selector that pulls the tracked image out of normal flow via `position: absolute`, mirroring the existing `h1:first-child` title extraction, driven by new `--ed-image-*` CSS custom properties parallel to `--ed-content-*`. (Uses a JS-assigned `.tracked-image` class rather than `:last-of-type` -- see design.md correction.)
- [x] 2.2 Add the draggable/resizable overlay markup for `image` (drag handle, resize handle, delete button) matching the pattern already used for `content`/`title`/`logo`. (Aspect-lock toggle already lives generically in the SideEditor element list, not per-overlay -- added `image` to its hardcoded label/color maps.)
- [x] 2.3 Guard the overlay and extraction CSS so they only apply when the slide actually has a trackable image (no `image` element rendered/draggable otherwise). (`hidden.image` derived at runtime via the `MutationObserver`-driven `updateTrackedImage`.)

## 3. Preset math

- [x] 3.1 Implement "Below" preset computation: content box resets to full width at its default x; image is horizontally centered beneath the content box's current bottom edge, height derived from aspect ratio.
- [x] 3.2 Implement "Right" preset computation: image width derived from content height + aspect ratio first (capped at half the box width for extreme ratios), content box takes whatever width remains — guaranteeing no overlap by construction rather than a fixed split ratio.
- [x] 3.3 Unit test the preset math functions directly (given a content box and image aspect ratio, assert the computed `x/y/w/h` for both elements under both presets).

## 4. Post-paste popover

- [x] 4.1 After a successful image paste, wait (bounded poll, with a timeout that silently skips the popover on failure) for the new `<img>` to appear in the rendered slide, matched by its upload path (not just any `.tracked-image`, to avoid anchoring to a stale one from an earlier paste).
- [x] 4.2 Build the popover UI: anchored to the image's rendered position, "Below" and "Right" options (plus a dismiss button; "Below" is already the live default applied by `layouts/default.vue`'s detection, so dismissing without choosing leaves that in place unsaved).
- [x] 4.3 Wire preset selection to the preset math (task 3) and the auto-save-as-new-layout flow (task 5).

## 5. Auto-save via per-slide layout fork

- [x] 5.1 On preset selection, reuse the existing `/api/save-layout` "save as new layout" path (auto-generated `layout-<timestamp>.vue` name) rather than overwriting the slide's current layout, and update only the current slide's frontmatter `layout:` to point at the new file — mirroring what the SideEditor's "Save as new layout" checkbox already does today, but triggered automatically.
- [x] 5.2 If the current slide's layout was already forked by an earlier preset choice in this session, update that same forked file in place on subsequent preset changes rather than forking again. (In-memory `Map<slideNo, layoutName>` in `global-top.vue`, reset on reload -- matches the "in this session" scope in design.md.)

## 6. Tests

- [x] 6.1 Unit tests for the aspect-ratio-derived default sizing and the "new image defaults locked" exception in `useEditor.ts`.
- [x] 6.2 Unit tests for preset math (task 3.3, if not already covered).
- [x] 6.3 E2e test: paste an image, confirm the popover appears, select "Right", confirm the image and content box positions update and a new layout file is created with only this slide's frontmatter pointing at it (other slides/layout untouched).
- [x] 6.4 E2e test: select "Below" after "Right" on the same slide, confirm content box returns to full width and no additional layout fork is created. (Implemented as two pastes on the same slide, since the popover only appears right after a paste -- there's no other UI path to re-invoke a preset choice.)
- [x] 6.5 E2e test: paste a second image on the same slide, confirm only the last one is tracked/draggable.

## 7. Verification

- [x] 7.1 `pnpm test && pnpm test:e2e` (65 unit tests + full 30-test e2e suite all pass; a full-suite run hit one environmental flake in image-position.spec.ts after 30 sequential tests on a long-lived shared server, not reproducible when rerun in isolation).
- [x] 7.2 Manually verified: repeatedly against the isolated e2e fixture on separate ports (paste, both presets, layout forking/reuse, aspect-ratio-derived sizing) -- this surfaced and fixed three real bugs (see design.md corrections). Did not repeat against the root project's own `pnpm dev` session, since doing so risks colliding with it on port 3030 (see below).
