## Context

`geometry` frontmatter positions a slide's content box, images, and keyed elements. It is parsed and resolved by two pure, DOM-free functions in `composables/useSlideGeometry.ts`:

```
parseSlideGeometry(frontmatter)          → ParsedSlideGeometry (+ warnings)
resolveGeometryElements(geometry,        → { targets, imageIndexes, warnings }
                        candidates,        candidates: ElementCandidate[]
                        srcs,              srcs:       authored image srcs
                        otherIds)          otherIds:   ids of the wrong kind
```

`resolveGeometryElements` takes a *summary* of the slide's content, not a DOM. `layouts/default.vue` builds that summary by walking the rendered DOM; nothing stops a different caller from building the same summary from raw markdown. That is the single fact this change is built on: all 22 warning conditions and their exact wording come for free, with no grammar reimplementation, which is the same reuse contract `vscode-codeurjc-slidev` already has with `useCodeHighlights`/`useSnippetImport`.

Today those 22 warnings reach the author only through one `console.warn` in `layouts/default.vue`. An entry that resolves to nothing leaves its element in normal flow, which looks much like a successfully positioned one — the failure has no pixels.

Three investigations constrain the design:

1. **The official Slidev extension already provides the preview.** `antfu.slidev` ships a preview webview, a dev-server launcher, a slides tree, and a cursor-sync toggle. Building a second one duplicates a webview, a server lifecycle, and a cursor sync to arrive at the same picture.
2. **Its preview cannot be parameterised by us.** Its `PreviewProvider.ts` builds the iframe src itself as `${serverAddr}${idx}?embedded=true`, and its webview relays only `target: 'slidev'` messages, which `@slidev/client`'s `useEmbeddedCtrl.ts` handles (`navigate`, `css-vars`, `color-schema`). None of that protocol knows anything about the theme, and we cannot add a query parameter to turn inspection on.
3. **The theme's editor cannot be reached from inside an embedded preview.** `editor.editing` is a module-local `ref(false)` in `useEditor.ts:96`, written only by `_override/SideEditor.vue:133` when the Layout tab is picked. That tab is reached through the "Show editor" button in `NavControls.vue`, which sits inside `<template v-if="!isEmbedded">` (lines 90–145) and is therefore hidden in every embedded preview. The `showEditor` flag is a `useLocalStorage`, but Chromium partitions storage by top-level site, so a webview iframe's `localhost:3030` storage is a different partition from a browser tab's, and it is declared `{ listenToStorageChanges: false }` besides.

Together these mean the activation path must be a channel the theme listens on regardless of its URL — which is what makes the HMR route not merely elegant but the only option.

## Goals / Non-Goals

**Goals:**
- Make every geometry failure visible, both as editor diagnostics and as an overlay on the real render.
- Make `geometry.elements` keys writable by tooling, closing a loop the browser Layout tab deliberately leaves open.
- Keep the extension's architecture intact: pure logic in vitest, a thin `extension.ts` adapter, a deliberately thin extension-host smoke layer.
- Work in whatever preview the author already has open, without owning one.

**Non-Goals:**
- A preview webview inside `vscode-codeurjc-slidev`. Deferred to `antfu.slidev`.
- Reimplementing any part of the geometry grammar in the extension.
- A box-diagram approximation of the slide. Fidelity comes from the real renderer; a static diagram cannot show text reflow, autofit scaling, a mermaid diagram's natural size, or a code block's rendered metrics.
- Changing how `geometry` is authored, parsed, or resolved. This change adds tooling around the existing grammar.
- Any support for the ODP importer's generated decks beyond what falls out for free.

## Decisions

### Drive inspection over the dev server's HMR channel, not the page URL

The theme's `vite.config.ts` already registers three `configureServer` hooks and owns middleware on the dev server. A fourth carries the controller channel: HTTP (plus server-sent events back to the extension) on the server side, Vite HMR custom events on the client side, with `layouts/default.vue` listening via `import.meta.hot`.

*Alternatives considered.* A query parameter (`?geometry=outline`) is impossible — investigation 2. Extending `useEmbeddedCtrl`'s `postMessage` protocol would require an upstream Slidev change and would only work inside an embedding host. The HMR channel needs neither, and works in the official preview, in a plain browser tab, and in both at once.

### The extension owns no webview

It posts to the dev server and reacts to events from it. Consequence: the only impure surface added to the extension is one HTTP client plus an SSE reader, so diagnostics, completions, quick fixes, candidate scanning, and the drag-application logic all stay unit-testable in the existing vitest layer.

### Reuse the theme's resolver against a markdown-built candidate summary

`documentScan.ts` already finds fences (with info strings) and `<<<` import blocks. It gains tables, `<div id>` wrappers, authored image srcs, and the ids of other elements, which is enough to assemble `ElementCandidate[]`, `srcs`, and `otherIds` in document order. Diagnostics are then the warnings the theme's own functions return.

*Alternative considered.* Reimplementing the matching rules in the extension — rejected for the reason `vscode-codeurjc-slidev` exists in its current shape: the grammar has exactly one home, and adding a small new form to the theme should not require touching the extension's parsing.

### Take a YAML dependency

Geometry is nested maps inside lists, and a diagnostic must point at an individual field. `clickModel.ts`'s `calloutSteps` reads `step:` by regex-scanning raw frontmatter lines; that technique does not extend to per-field ranges inside nested structures, and hand-rolling it would be the worst code in the package. `yaml`'s `parseDocument` gives CST node ranges (offsets → document positions) and supports surgical edits that preserve formatting and comments, which the drag write-back also needs.

*Alternative considered.* Coarse whole-block diagnostic ranges with no dependency — rejected: it degrades the primary feature (pointing at the bad field) to save one well-scoped dependency in a bundled extension.

### Address drags by stable key, never by index

The drag event carries `{ slideNo, key, from, to }` where `key` is the entry's own `code:`/`id:`/`image:` reference (or `content`). This mirrors two decisions already made in this codebase: `geometry.elements` matches "by a stable key, never by position", and the callout position write-back is "addressed rather than searched for". Key-addressing makes index drift a non-issue, and makes a `from` mismatch harmless rather than a conflict.

*Alternative considered.* Sending the entry's list index — rejected: it breaks whenever the author has added or removed an entry since the preview last rendered, which is precisely the case the write-back has to survive.

### Apply the drag into the dirty buffer, then save once

The theme currently writes frontmatter through the dev server, which writes `slides.md` from the *server's* copy — racing any unsaved editor state. Under controlled mode the extension becomes the single writer: it applies the rect to the open document with `workspace.applyEdit` and then saves.

Applying into the possibly-dirty buffer and saving once is preferred over saving first and then applying: it is one write, one HMR round trip, and no intermediate re-render, and it leaves the drag as a single undoable edit so the editor's own undo reverses a drag.

A `from` mismatch means only that the preview was rendering an older file; the drag states where the author put the element, so the new rect wins with no prompt. Only two conditions block the edit, both structural: the key is gone from the document, or the slide boundaries have drifted so the slide number may name a different slide.

*Alternative considered.* A three-way text merge between last-saved, server-written, and buffer contents — rejected as solving the wrong problem: with key-addressing the dangerous divergence is identity drift, not textual conflict.

### Companion, not dependency

`extensionPack` plus a runtime `extensions.getExtension('antfu.slidev')` check, rather than `extensionDependencies`. Everything the extension does today — marker decorations, click badges, import hovers, the reference index, path completion — works with no dev server and no preview. A hard dependency would force a second extension on authors who never open one.

### Settled during implementation

- **Candidates are grouped by kind, not document order.** The layout's `collectElementCandidates` queries code wrappers, then `.mermaid`, then `table`, so the markdown-built summary does the same; ambiguity warnings name elements in that order.
- **Deck identity comes from the page.** Vite's resolved `config.slidev` is the theme-facing plugin options, not Slidev's resolved entry, so the server can't report the deck. It broadcasts `whichDeck` on attach and each page answers with slide 1's source file — the same "the client reports its file" convention the callout write-back uses.
- **The server keeps and replays state, and releases it.** A page that loads after the controller attached asks for the current state (`INSPECT_SYNC_EVENT`) rather than relying on a broadcast it may have missed. When the last controller detaches, the server releases control and inspection, so pages never keep emitting drags nobody applies.
- **The stream writes an SSE comment on attach.** Node sends no headers until the first body write, so with no page open a controller's attach would never complete.
- **`useInspectProtocol.ts` has no imports.** `vite.config.ts` loads it, and pulling the geometry grammar into the config's import graph trips Vite's native config loader; the drag-key derivation lives in `useInspectKeys.ts`.
- **Drift is detected by content, not by comparing against the saved file.** The key found on another slide means identity drifted; found nowhere means gone. No false alarm when an unsaved slide is merely appended at the end.
- **Slide 1 writes reload the page.** Its frontmatter is the headmatter; the state replay covers the reload.

## Risks / Trade-offs

- **`src:`-included slides cannot be resolved statically** → The entry lives in the including slide's frontmatter while its target lives in another file, so every entry would be reported as matching nothing. Detect the include and suppress resolution diagnostics for that slide, keeping grammar-level ones. Biasing toward silence is deliberate: false positives would destroy trust in the diagnostics faster than missing ones.
- **The dev server serves one entry deck, but a course is one deck per lecture** → A slide number means nothing across decks. Verify the served deck's identity before linking a document, and refuse slide-addressed messages while they disagree, rather than silently addressing the wrong slide.
- **Saving on drag is whole-file** → It commits the author's unrelated pending edits and triggers any format-on-save, so a drag could reformat the whole deck. Provide a setting to disable saving on drag; consider warning when a markdown formatter is configured.
- **The preview renders the last saved file** → With saving on drag disabled, the render and the frontmatter diverge visibly until the author saves. Acceptable, because the setting is opt-in and the theme keeps the dragged element at its dropped position.
- **The theme gains a second writer for `editor.editing`** → Two activation paths for editor mode could disagree (Layout tab on, controller off). Keep the underlying state single and let both paths write it, rather than tracking two independent flags.
- **A new dependency in a bundled extension** → `yaml` adds to the esbuild bundle. Small and well-scoped against the alternative of hand-rolled nested-YAML range tracking.
- **Coupling to another extension's internals** → We depend on `antfu.slidev` only for *having* a preview, not for any API of it. The channel is to the dev server, which is Slidev's own documented surface, so their webview internals can change without breaking this.

## Migration Plan

No data or format migration: `geometry` frontmatter is unchanged, and every existing deck keeps rendering identically.

Deployment is sequenced so each stage is independently useful:

1. **Extension text intelligence** ships first. It needs no theme change and no dev server, so it can be released and validated on its own.
2. **Theme inspection and controlled mode** ship next, as a theme version bump. With no controller attached the theme behaves exactly as before — the spec requires it — so this is inert for every existing consumer.
3. **Extension live link** ships last, gated on both a running server and an attached controller.

Rollback for stage 1 is an extension version revert. Stages 2 and 3 are independently revertible because the theme's default (no controller) path is the current behaviour, and the extension's live-link features are already required to degrade to the server-free feature set.

The theme change requires a peer floor bump only if it depends on Slidev APIs newer than the current `^52.17.1`; the HMR custom-event channel does not, so no floor change is expected.

## Open Questions

- Should the extension detect a configured markdown format-on-save and warn once, or leave that entirely to the author's setting?
- When several previews are connected at once (a browser tab and the official extension's webview), should a highlight go to all of them or only the most recently active?
- ~~Does inspection mode need to imply editor mode?~~ **Resolved: yes.** Turning inspection on also turns on `editor.editing`, so drag handles appear alongside the outlines; turning it off restores whatever editor state the Layout tab had.
- Should the `id:` quick fix offer a generated id when the entry is being created from an unkeyed element, or always prompt the author to name it?
