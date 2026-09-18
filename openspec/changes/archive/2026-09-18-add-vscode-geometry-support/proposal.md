## Why

Per-slide `geometry` frontmatter fails silently. `useSlideGeometry.ts` has 22 distinct `warnings.push()` sites, and every one of them surfaces only as a `console.warn` from `layouts/default.vue` — invisible unless the author has browser devtools open. Worse, a `geometry.elements` entry that resolves to nothing produces *no pixels at all*: the element just stays in normal flow, which is visually near-indistinguishable from a successfully positioned one. Authors cannot tell a working entry from a dead one by looking at the slide.

`geometry.elements` also matches its target by a stable key only — never by position, by design — so every entry is a `code:`/`id:`/`image:` string that must match exactly, with no fallback. That is a correct design paired with a brutal authoring experience: the keys must be typed by hand, and the Layout tab in the browser deliberately refuses to write `id:` into markdown, leaving nothing that can close the loop.

## What Changes

- The theme gains a **geometry inspection mode**: labelled outlines drawn over the real rendered slide for every `geometry` entry, *including entries that resolved to nothing*, which are otherwise invisible. Activated remotely rather than through the Layout tab, so it works in any preview surface.
- The theme gains a **controlled write mode**: while an external controller is attached, geometry drags stop writing frontmatter through the dev server and are emitted to the controller instead, making the controller the single writer.
- A **custom HMR protocol** over the theme's existing `configureServer` hooks carries inspection commands and highlight requests inbound, and drag events outbound.
- The VSCode extension gains **geometry text intelligence**, all server-free: diagnostics for all 22 geometry warnings, completions for `code:`/`id:`/`src:`/`fit:` drawn from the slide's real content, and quick fixes that add a missing `{id: '…'}` to a fence or scaffold an entry for an unkeyed element.
- The VSCode extension gains a **live link** to a running dev server: moving the cursor onto a geometry entry highlights that element in whatever preview is open, and dragging an element in the preview applies the new rect to the live VSCode document and saves it.
- The extension declares a **soft dependency** on the official Slidev extension (`antfu.slidev`) via `extensionPack` plus a runtime check. Its preview webview is reused rather than reimplemented; every existing extension feature keeps working without it.

## Capabilities

### New Capabilities
- `slide-geometry-inspection`: Theme-side inspection overlay and controlled write mode for `geometry` frontmatter, plus the dev-server protocol that drives them from an external controller.
- `vscode-geometry-intellisense`: Diagnostics, completions, and quick fixes for `geometry` frontmatter in `slides.md`, derived statically from the document with no dev server running.
- `vscode-geometry-live-link`: Bidirectional linking between the VSCode editor and a running dev server's preview — cursor-to-highlight, and drag-to-document write-back with its save policy.

### Modified Capabilities
- `slide-geometry`: The requirement that Layout tab geometry edits are persisted to frontmatter gains an exception — under controlled mode the theme delegates the write to the attached controller instead of patching frontmatter itself.

## Impact

**Theme package** (`packages/codeurjc-slidev-theme/`)
- `composables/useEditor.ts` — `editor.editing` is currently a module-local `ref(false)` whose only writer is `_override/SideEditor.vue:133`; it needs a second, remotely-triggerable writer.
- `layouts/default.vue` — inspection overlay rendering; geometry write-back becomes delegable.
- `vite.config.ts` — a fourth `configureServer` hook for the controller channel (HTTP + server-sent events to the extension, Vite HMR custom events to the client).
- New composable for the protocol's message shapes, kept pure and unit-tested like its siblings.

**VSCode extension** (`packages/vscode-codeurjc-slidev/`)
- New pure modules for the geometry candidate scan, diagnostics, completions, and quick fixes.
- `src/documentScan.ts` — extended to report tables, `<div id>` wrappers, and authored image srcs, so a DOM-free `ElementCandidate[]` can be built from raw markdown.
- `src/extension.ts` — new providers, the dev-server client, and the drag write-back.
- `package.json` — `extensionPack`, new commands, new settings.
- A YAML dependency is required: geometry is nested maps inside lists and diagnostics must point at individual fields, which the existing hand-rolled frontmatter regex scanning (`clickModel.ts`'s `calloutSteps`) cannot do.

**Reused unchanged**
- `resolveGeometryElements()` and `parseSlideGeometry()` are already pure and DOM-free. The extension builds the same candidate summary from markdown that the layout builds from the DOM, so all resolution rules and warning text come for free with no grammar reimplementation.

**Known risks carried into design**
- `src:`-included slides break cursor-to-slide mapping and would produce phantom diagnostics.
- The dev server serves one entry deck while a course is typically `tema1.md`, `tema2.md`, … so a slide number is meaningless without deck identity.
- Saving on drag is whole-file and will trigger any format-on-save the author has configured.
