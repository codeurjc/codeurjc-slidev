## 1. Package scaffolding

- [x] 1.1 Add `packages/vscode-codeurjc-slidev/` to `pnpm-workspace.yaml`
- [x] 1.2 Create the extension's `package.json` (VSCode `engines.vscode`, `activationEvents: onLanguage:markdown`, `contributes` stub) with a `workspace:*` dependency on `codeurjc-slidev-theme`
- [x] 1.3 Set up esbuild bundling for the extension entry point, confirming it can resolve a deep import of `codeurjc-slidev-theme/composables/useCodeHighlights`
- [x] 1.4 Add a `vitest.config.ts` for the package (no-DOM environment, mirroring the theme package's config) and wire its tests into root `pnpm test` alongside the theme package's
- [x] 1.5 Add a separate `test:extension` script (not part of default `pnpm test`) reserved for the extension-host layer

## 2. Theme-detection activation gate

- [x] 2.1 Implement a pure function that reads a markdown document's frontmatter and returns whether `theme: codeurjc-slidev-theme` is set
- [x] 2.2 Unit test: theme-tagged doc → true; no frontmatter → false; different theme → false
- [x] 2.3 Wire the gate into extension activation so parsing/providers no-op for non-matching documents

## 3. Active-buffer marker/anchor/directive parsing glue (vscode-marker-annotations)

- [x] 3.1 Implement fence discovery in a markdown document's raw text (locate fenced code blocks, their language, and document line offsets)
- [x] 3.2 Implement the fence-relative → document-line translation function, and unit test it against `parseCodeHighlights` output shapes
- [x] 3.3 Implement discovery of `<<<` import lines plus their following `[!mark:...]`/`[!source ...]` line runs, reusing `parseSnippetImportLine`/`isAnchorDeclarationLine`/`isSourceDirectiveLine` from `useSnippetImport.ts`
- [x] 3.4 Implement the slice-relative → absolute-target-line translation, unit tested against `resolveSnippetSelector` + `parseExternalHighlightAnchors` output shapes
- [x] 3.5 Unit test all translation functions with fixtures covering: whole-line marker, range marker, substring marker, content anchor, content-range anchor, ambiguous anchor, out-of-range occurrence

## 4. Active-buffer providers (vscode-marker-annotations)

- [x] 4.1 Implement a `DecorationType`-based renderer: dim marker/anchor/directive source lines, box highlighted spans, refresh on document change and active-editor change
- [x] 4.2 Implement a `HoverProvider` for anchor lines (resolved target file/line/comment) and `[!source ...]` directive lines (resolved URL or suppression)
- [x] 4.3 Implement a `DiagnosticCollection` populated from the `onWarn`/`onError` hooks of `parseExternalHighlightAnchors` and the warn callback of `resolveSnippetSelector`, refreshed on relevant document changes
- [x] 4.4 Provider-layer tests (Layer 2: fake `TextDocument`-shaped objects, real `vscode.Range`/`Position`) for decoration ranges, hover contents, and diagnostic placement/severity per spec scenario

## 5. Workspace anchor index (vscode-reference-index)

- [x] 5.1 Implement the pure index-builder function: given an in-memory map of `{path: text}` for theme-tagged markdown files plus their target files, produce `targetAbsPath → [{slideFile, slideLine, comment}]`
- [x] 5.2 Unit test: single reference, multiple references to the same target line, unresolved anchor excluded from the index
- [x] 5.3 Implement the workspace scanner wiring: enumerate theme-tagged `.md` files, read/resolve target files via real fs, populate the index at activation
- [x] 5.4 Implement targeted invalidation: re-resolve only the changed markdown file's contributions on its edit; re-run resolution against current content for a target file's entries on its edit
- [x] 5.5 Invalidation tests confirming stale entries are replaced, not merely appended

## 6. Reference-index CodeLens (vscode-reference-index)

- [x] 6.1 Implement a `CodeLensProvider` for files present in the index, rendering a summary lens per referenced line
- [x] 6.2 Implement the navigation command: open/focus the originating markdown file with the cursor at the anchor line
- [x] 6.3 Provider-layer tests (Layer 2) for lens placement/text and navigation command behavior
- [x] 6.4 Confirm no lens is shown for target files with zero index entries

## 7. Extension-host smoke tests (Layer 3)

- [x] 7.1 Add `@vscode/test-electron` (or equivalent) as a devDependency, scoped to `test:extension` only
- [x] 7.2 Build a fixture workspace (slides.md + code/ file), reusing the shape of `tests/fixtures.ts`'s per-worker fixture pattern
- [x] 7.3 Smoke test: extension activates on the fixture workspace and registers its providers
- [x] 7.4 Smoke test: opening the fixture's slides.md renders at least one decoration; opening the fixture's target file renders at least one CodeLens

## 8. Documentation

- [x] 8.1 Document the new package in root CLAUDE.md's workspace-layout section
- [x] 8.2 Document the VSCode Marketplace publish flow (`vsce publish`) alongside the existing npm publish steps in CLAUDE.md's development-cycle section
