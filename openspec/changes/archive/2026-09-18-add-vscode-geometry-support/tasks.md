## 1. Candidate scanning from markdown

- [x] 1.1 Extend `src/documentScan.ts` to report markdown and HTML tables, `<div id="…">` wrappers and their only element child, authored image srcs (markdown images and raw `<img>`), and element ids of every other kind, all in document order within a slide
- [x] 1.2 Add a pure `src/geometry/candidates.ts` assembling a slide's `ElementCandidate[]`, `srcs[]`, and `otherIds` from the scan, matching the ordering `layouts/default.vue` produces from the DOM
- [x] 1.3 Add a `src:`-include detector so slides whose content comes from another file can be excluded from resolution diagnostics
- [x] 1.4 Unit-test the candidate builder against fixtures covering fences with `{id: '…'}`, titled fences, `<<<` imports, mermaid blocks, wrapped tables, repeated image srcs, and wrong-kind ids

## 2. Geometry diagnostics

- [x] 2.1 Add the `yaml` dependency to `packages/vscode-codeurjc-slidev` and a helper mapping a geometry field path to a document range via `parseDocument` CST ranges
- [x] 2.2 Add pure `src/geometry/diagnostics.ts` running `parseSlideGeometry` and `resolveGeometryElements` per slide and mapping each returned warning to a document range
- [x] 2.3 Suppress resolution diagnostics (keeping grammar-level ones) on slides detected as `src:` includes
- [x] 2.4 Unit-test every diagnostic scenario in `specs/vscode-geometry-intellisense`: malformed rect, unmatched key, ambiguous key, wrong-kind id, double-claimed target, valid geometry, and the include-suppression pair
- [x] 2.5 Wire the diagnostics into `src/extension.ts`'s existing diagnostic collection and document-change handling

## 3. Completions and quick fixes

- [x] 3.1 Add pure `src/geometry/completions.ts` offering `code:`, `id:`, `src:`/`image:`, and `fit:` values from the slide's own candidates, writing image references in shortest unambiguous form via `imageRefFor`
- [x] 3.2 Add pure `src/geometry/quickFixes.ts` producing the "add `{id: '…'}` to this fence" fix for an unmatched `id:` entry, quoting the id
- [x] 3.3 Extend it with the "position this element" fix on an unkeyed fence, mermaid block, or table, emitting both the fence id edit and the frontmatter entry
- [x] 3.4 Unit-test the completion and quick-fix scenarios, including the repeated-image reference case and the quoted-id requirement
- [x] 3.5 Register the completion and code-action providers in `src/extension.ts`

## 4. Theme: controller channel

- [x] 4.1 Add a pure `composables/useInspectProtocol.ts` defining the command and event message shapes (attach, deck identity, inspect on/off, highlight entry, drag event) with parsing and validation
- [x] 4.2 Add a fourth `configureServer` hook in `vite.config.ts`: an HTTP endpoint for controller commands, a server-sent-events stream for events back to the controller, and relaying between that and Vite's HMR custom events
- [x] 4.3 Report the served deck's identity on attach so a controller can verify it matches the document it is linking
- [x] 4.4 Unit-test the protocol module's parsing and validation
- [x] 4.5 Verify no behaviour changes when no controller is attached

## 5. Theme: inspection overlay and controlled writes

- [x] 5.1 Give `editor.editing` in `composables/useEditor.ts` a second writer that the controller channel can drive, keeping one underlying state shared with the Layout tab
- [x] 5.2 Render labelled outlines in `layouts/default.vue` for every `geometry` entry, marking resolved and unresolved entries distinguishably
- [x] 5.3 Implement highlight-one-entry, ignoring requests for entries the slide no longer has
- [x] 5.4 Add controlled mode: when the controller has claimed geometry writes, emit `{slideNo, key, from, to}` on drag settle instead of patching frontmatter, keeping the element at its dropped position
- [x] 5.5 Add e2e coverage that inspection outlines appear for resolved and unresolved entries and that the slide renders identically with inspection off
- [x] 5.6 Add e2e coverage that a drag under controlled mode emits an event and leaves the frontmatter untouched, and that releasing control restores direct writes

## 6. Extension: live link

- [x] 6.1 Add `src/geometry/devServer.ts`: discover a running dev server, attach, verify the served deck matches the open document, and read the event stream
- [x] 6.2 Refuse slide-addressed messages while the served deck and the open document disagree, surfacing that state to the author
- [x] 6.3 Send highlight requests as the cursor enters and leaves a geometry entry, reusing the existing slide-number computation
- [x] 6.4 Add pure `src/geometry/applyDrag.ts`: locate an entry by key in the document text, produce the rect replacement edit, and classify the blocking cases (key gone, slide boundaries drifted)
- [x] 6.5 Unit-test `applyDrag` for all five drag scenarios in `specs/vscode-geometry-live-link`, including the `from`-mismatch-still-applies rule
- [x] 6.6 Wire it up in `src/extension.ts` as a single undoable `workspace.applyEdit` followed by one save

## 7. Packaging and companion extension

- [x] 7.1 Add `extensionPack` with `antfu.slidev`, plus a runtime check that prompts to install it with an action when a preview-dependent command is invoked
- [x] 7.2 Verify every server-free feature still works with the companion absent
- [x] 7.3 Add the save-on-drag setting (default on) and honour it in the drag write-back
- [x] 7.4 Register the new commands in `package.json`

## 8. Validation and documentation

- [x] 8.1 Run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- [x] 8.2 Run `xvfb-run -a pnpm test:extension` and extend the smoke suite with a geometry diagnostic and a quick fix
- [x] 8.3 Manually verify inspection and drag write-back inside the official Slidev extension's preview webview, and in a plain browser tab
- [x] 8.4 Update `CLAUDE.md` with the controller channel, the inspection/controlled modes, and the extension's geometry modules
- [x] 8.5 Run `openspec validate --change add-vscode-geometry-support`
