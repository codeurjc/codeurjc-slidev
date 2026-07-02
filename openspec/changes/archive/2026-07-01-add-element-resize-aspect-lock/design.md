## Context

The layout editor (`composables/useEditor.ts` + `layouts/default.vue` + `_override/SideEditor.vue`) manages four elements — `red-bar`, `logo`, `title`, `content` — each with a `Rect { x, y, w, h }` in shared reactive state. Resize is already wired end-to-end for `title` and `content` (drag handle → `onResize` → CSS var → `cssOutput` → export). `logo` has a resize handle in the template that updates `positions.logo.w/h`, but nothing downstream consumes it: no CSS var, no `cssOutput` width/height, and the `<img>` has hardcoded `height: 48px; width: auto`. `red-bar` is hardcoded to `top:0; left:0; width:100%` and only exposes a bottom (`b`) handle for height.

`hidden` is the existing precedent for per-element boolean state that (a) lives in shared reactive state, (b) is part of the undo `Snapshot`, (c) is restored on mount from a `data-*` attribute, and (d) is persisted by the `/api/save-layout` Vite middleware by rewriting that attribute in the layout `.vue` file. `aspectLocked` follows this exact pattern.

## Goals / Non-Goals

**Goals:**
- Every element (including logo and red-bar) is fully resizable: draggable x/y, resizable w/h, exported to CSS.
- Aspect ratio lock, off by default per element, toggleable from the SideEditor element list.
- Locked resize preserves whatever ratio the element had at the start of the current edit gesture (drag or numeric input) — no separate stored "target ratio."
- Lock state persists across reloads/saves like `hidden` does.
- Logo's resize handle tracks the cursor correctly despite `invertX` (right-anchored) positioning.

**Non-Goals:**
- Not adding aspect-ratio lock to elements added in the future automatically beyond wiring the mechanism generically (any new `ELEMENTS` entry gets a lock flag by defining `initial` — no per-type special-casing needed beyond `invertX`-style flags already in place).
- Not changing how `hidden`/delete works.
- Not migrating existing saved layout files automatically — call out the red-bar breaking change in the proposal; migration is manual (re-open and re-save in the editor).
- Not adding aspect-ratio lock UI to the numeric X/Y inputs (only W/H, and only during a resize gesture) — X/Y don't have a ratio concept.

## Decisions

**1. Ratio is derived live, not stored.** At the start of a resize gesture (`startResize`, or the moment a W/H numeric input changes while `editing`), if `aspectLocked[name]` is true, compute `ratio = p.w / p.h` from current position and stash it in `resizeState` (mirroring how `origW`/`origH` are already stashed). This avoids a second piece of persisted state and automatically "just works" after undo/reset/reload, since it always reads whatever w/h is current. Alternative considered: store a separate `lockedRatio` per element, updated whenever lock is toggled on — rejected because it adds a second source of truth that must be kept in sync with position edits made while locked (e.g., resizing while locked already keeps ratio constant, so a stored ratio would be redundant; the risk is edits made while *unlocked* silently going stale until the next lock-on).

**2. Resize math for locked elements uses dominant-axis selection.** On `se`-handle drag, compute `dx`/`dy` as today; if locked, pick the axis with the larger absolute delta as "driving," compute that dimension normally, then derive the other from `ratio`. For `red-bar`'s handle (single `b`, height-only today) — since red-bar becomes a full `se`-style box per the proposal's breaking change, it gets the same corner handle and math as title/content; no special case remains.

**3. Numeric W/H inputs in SideEditor also respect the lock.** Editing "W" while locked recomputes "H" from the ratio captured at focus-time (and vice versa), using the same "ratio = current w/h" rule, computed fresh each time the input gains focus (not on every keystroke, to avoid feedback loops between two v-model bindings). This keeps the two entry points (drag, numeric) behaviorally consistent.

**4. `invertX`-aware resize.** `onResize` gains the same `invertX` flag `onDrag` already reads from `ELEMENTS[name]`. For `invertX` elements (currently only `logo`), growing width visually should extend from the anchored (right) edge outward to the left, so the handle must be placed at the `sw` corner (not `se`) and `dx` inverted before applying to `w`, matching how `onDrag` already flips `dx` for these elements. Non-invertX elements are unaffected.

**5. Persisted attribute stores exceptions, not the full map.** Since default is `locked: false` for every element, `data-aspect-locked` stores only the *locked* element names (comma-separated) — the opposite convention from `data-hidden` (which stores hidden exceptions against a "visible" default), but the same "store only the exception set" shape. Absence of the attribute means "everything unlocked" (the common case), keeping saved layout files clean.

**6. `Snapshot` interface grows a third field.** `{ positions, hidden, aspectLocked }`. Undo/reset/dirty-check logic extends the same way `hidden` was added alongside `positions` originally — iterate `Object.keys(aspectLocked)` the same way.

## Risks / Trade-offs

- [Red-bar becoming a floating box breaks any saved layout that depended on it always spanning full width] → Called out as **BREAKING** in the proposal; only affects layouts that are re-opened and re-saved through the editor (existing static `.vue` files are untouched until then), and the element remains at `width: 100%` by default (just no longer hardcoded — its stored `w` initializes to the full slide width equivalent) unless someone deliberately resizes it.
- [Dominant-axis selection can feel jumpy near 45° diagonal drags] → Acceptable for a corner-handle drag UX; matches common design-tool behavior (e.g., holding shift in most editors), and this is the "always-on" default here rather than a modifier key.
- [Logo's actual `<img>` aspect ratio may not exactly match its box `w`/`h` ratio if someone unlocks, distorts, then re-locks] → By design: lock always captures *current* box ratio, not the image's intrinsic ratio. Acceptable since the user explicitly chose "whatever w/h it happens to be" as the reference in discovery.
- [Numeric input ratio-lock recompute-on-focus could feel surprising if a user tabs between W and H rapidly] → Recompute only on focus-in of whichever field is being edited, not continuously, to keep behavior predictable and avoid drift.

## Migration Plan

No data migration. Existing layout `.vue` files keep working as-is (red-bar keeps rendering full-width via its currently-saved styles) until a user opens the layout editor and touches that layout again, at which point the new box model and default lock apply going forward.

## Open Questions

None outstanding — scope and defaults were confirmed in discovery (explore mode) before this proposal was written.

## Amendment (post-implementation)

After shipping with `locked: true` as the default, the user reversed the decision to `locked: false` as the default for all elements. All logic that branched on "locked is the default" (initial `_sharedAspectLocked` values, the `data-aspect-locked` attribute's exception-set convention in both the mount-restore code and the `/api/save-layout` middleware — **including the non-symlinked `e2e/vite.config.ts` copy**, per the earlier gotcha) was flipped accordingly.

Separately, the logo appeared visibly squished even with no user resizing. Root cause: `ELEMENTS.logo.initial` was `{ w: 120, h: 48 }` (ratio 2.5:1), but `public/images/logo.png` is actually 774×467px (ratio ≈1.66:1). Forcing the `<img>` to explicit `width`/`height` (this change's own doing — previously it was `height: 48px; width: auto`, which preserved the image's real ratio) stretched it to the mismatched box ratio. Fixed by correcting `initial` to `{ w: 80, h: 48 }` (matching the real ratio) and adding `object-fit: contain` on the `<img>` as a safety net so future logo-asset swaps or manual resizes can't reintroduce distortion.
