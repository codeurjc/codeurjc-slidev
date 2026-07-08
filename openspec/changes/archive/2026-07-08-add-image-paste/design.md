## Context

Slidev's side editor (`node_modules/@slidev/client/internals/SideEditor.vue`, patched at dev-server time via our `_override/SideEditor.vue`) is mounted with `v-if="SideEditor && showEditor"` in `@slidev/client`'s `pages/play.vue` — it is fully destroyed when the panel is closed. Any listener attached only inside that component dies with it. The user explicitly wants pasting to work whether or not the side editor panel is open, so the listener must live somewhere that is always mounted: `setup/global-top.vue`, a Slidev convention file currently an empty stub, rendered globally regardless of slide/layout/editor state.

**Correction found during implementation**: `setup/global-top.vue` (an empty `<div />` stub at the time of writing) is not actually loaded by Slidev at all. Slidev's global-layer resolution (`templateGlobalLayers` in `@slidev/cli`) looks for `global-top.vue` directly at each resolved root — the same directory as the entry markdown file — not inside a `setup/` subfolder. `setup/` is a separate, unrelated convention reserved for config-style setup modules (`setup/shiki.ts`, `setup/katex.ts`, etc.), loaded via a different code path (`loadSetups()`, which explicitly does `resolve(root, "setup", filename)`). So the existing `setup/global-top.vue` has always been dead code. This change relocates it to `global-top.vue` at the project root (and adds `e2e/global-top.vue` as a new symlink, mirroring the existing `e2e/layouts/default.vue` pattern) so it actually renders.

Inside the content tab, Slidev's own editor for slide markdown (`ShikiEditor.vue`) is a plain native `<textarea>` (transparent, overlaid on a Shiki-highlighted `<pre>`) using `v-show` — not `v-if` — to switch between the content/notes tabs in `SideEditor.vue`. That means whenever the side editor is open, the content textarea's DOM node and its reactive model exist and stay live even while the user is looking at the Notes or Layout tab.

The existing `/api/save-layout` Vite middleware (in `vite.config.ts`) establishes the pattern for adding new dev-server-only endpoints, and the CLAUDE.md-documented duplication between `vite.config.ts` and `e2e/vite.config.ts` (a standalone, non-symlinked copy) is a known constraint that must be manually respected for any new middleware.

## Goals / Non-Goals

**Goals:**
- Detect an image on the clipboard during a `paste` event anywhere in the app while the dev server is running.
- Persist the image to `public/images/paste-<timestamp>.<ext>` via a new Vite middleware.
- Insert `![](/images/paste-<timestamp>.<ext>)` into the current slide's markdown content, whether the side editor is open or closed.
- When the side editor is open, insert at the content textarea's cursor position without disturbing any in-flight unsaved edits.
- When the side editor is closed, append the markdown to the slide's content via Slidev's own `update()` API.

**Non-Goals:**
- No image cropping, resizing, or positioning UI (later roadmap slice; explicitly out of scope here).
- No drag-and-drop image support (separate roadmap bullet).
- No layout-editor involvement of any kind.
- No orphaned-image cleanup/garbage collection for images no longer referenced in markdown.
- No support in the exported/built static site or presenter window — this is a dev-server-only editing affordance, same scope as the layout editor.

## Decisions

**Listener location: `setup/global-top.vue`, not `_override/SideEditor.vue`.**
`SideEditor.vue` is `v-if`-mounted only while the panel is open, so a listener scoped there cannot satisfy "works even when the side editor is closed." `global-top.vue` is mounted unconditionally for the lifetime of the presentation view, matching Slidev's own convention for global, always-on setup code.

**Insertion path branches on `showEditor.value` (imported from `@slidev/client`'s shared `state` module, the same ref `_override/SideEditor.vue` already watches):**
- **Open**: locate the content textarea via a marker attribute (`data-editor="content"`) added to the wrapping element around the content `ShikiEditor` instance in `_override/SideEditor.vue`, since two `ShikiEditor` instances exist (content, notes) and both are simultaneously present in the DOM once mounted. Splice the markdown into the textarea's value at `selectionStart`/`selectionEnd` (or append if unfocused) and dispatch a native `input` event so Vue's `v-model` (via `useIME`) picks up the change, flows into `content`/`contentRef`, sets `dirty`, and rides the existing throttled `save()` → `update()` pipeline. Chosen over `document.execCommand('insertText', …)`: simpler, avoids a deprecated API, and the existing throttled-save pipeline already provides its own recovery point, so preserving native textarea undo/redo across the paste is not essential.
- **Closed**: no textarea exists to splice into. Call Slidev's `update()` API directly (via `useNav()` + `useDynamicSlideInfo()`, the same composables `_override/SideEditor.vue` already uses) to append the markdown to the current slide's `contentRaw`. Safe because with the editor closed there is no unsaved local buffer that could be clobbered — the last `update()` call is the source of truth.
- Editor open but content tab not focused/not active tab is treated the same as "open": we still target the live content textarea DOM node (found via the marker attribute) rather than re-reading from disk, specifically to avoid racing an unsaved edit sitting in a tab the user isn't currently viewing.

**Filename scheme: `paste-<timestamp>.<ext>`**, matching the existing `layout-${Date.now()}.vue` convention used by `/api/save-layout`, rather than content-hashing. Consistency with the existing convention was preferred over dedup; duplicate pastes creating duplicate files is an accepted trade-off for this slice.

**New middleware: `/api/save-image`**, mirrored by hand into `e2e/vite.config.ts` per the existing documented convention (no shared-module extraction in this slice — the team decided to keep the current manual-sync practice rather than refactor it now).

**Extension detection**: derive from the clipboard item's MIME type (`image/png` → `.png`, `image/jpeg` → `.jpg`, `image/webp` → `.webp`, `image/gif` → `.gif`); reject/no-op on unrecognized image types rather than guessing.

**Multiple clipboard items**: if the clipboard paste event contains more than one image item, only the first is used. Rare in practice (typical paste sources like screenshot tools and browsers put a single image on the clipboard).

**Correction found during manual verification**: the closed-editor path originally read `info.value?.source.contentRaw` from `useDynamicSlideInfo`'s own reactive ref, populated by an async fetch triggered on that composable's own mount. If a paste happens before that fetch resolves (e.g. shortly after page load), `info.value` is still `null`, and the append would silently degrade into an overwrite of the slide's entire existing content. Fixed by fetching `/__slidev/slides/<no>.json` directly at paste time instead of trusting the reactive ref's timing, guaranteeing a fresh read exactly when needed. The append logic itself (blank-line separator only when there's existing non-whitespace content) was extracted into a testable `appendImageMarkdown()` helper in `composables/useImagePaste.ts`.

Also found and fixed during implementation: Vue's `transformAssetUrl`-style compilation of markdown images converts `![](/images/x.png)` into `import _imports_0 from '/images/x.png'`, and Slidev's own `slidev:slide-import-guard` plugin rejects that specifier — even for a long-existing public file, not just newly-pasted ones — because it resolves as a literal filesystem-root path rather than through `publicDir`. Verified independently of this feature (a plain `![](/images/logo.png)` reference fails identically). Worked around with a narrow `resolve.alias` in both `vite.config.ts` and `e2e/vite.config.ts` mapping the `/images/` prefix to the real `public/images` directory, rather than disabling Vite's `server.fs.strict` project-wide.

## Risks / Trade-offs

- **[Risk]** Splicing directly into the textarea DOM value and dispatching a synthetic `input` event is somewhat implicit/fragile compared to a directly-owned reactive ref → **Mitigation**: rely on the marker attribute for a stable selector, and cover this path with both a unit test (given a fake textarea + clipboard data, assert resulting value) and an e2e happy-path test against the real Slidev editor.
- **[Risk]** `e2e/vite.config.ts` duplication grows with a second manually-mirrored middleware, increasing the chance the e2e environment silently drifts from the real one → **Mitigation**: accepted per user decision; call out explicitly in tasks.md as a step, not left implicit.
- **[Risk]** Appending via `update()` while the editor is closed assumes no other unsaved state exists for that slide → **Mitigation**: scoped as a Non-Goal concern; since closing the editor doesn't currently leave any pending unsaved buffer in this codebase (throttled autosave fires within 500ms and the panel isn't shown at all if never opened), this is safe under current behavior; would need revisiting if a future change introduces a longer-lived unsaved-edit buffer that outlives the panel's mount.
- **[Trade-off]** Duplicate files on repeated identical pastes (timestamp-based naming) — accepted for consistency with the existing layout-saving convention; dedup can be revisited later if it becomes a real problem.

## Open Questions

- None blocking; cropping/resizing and drag-and-drop are explicitly deferred to later roadmap slices.
