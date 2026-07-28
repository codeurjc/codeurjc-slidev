## 1. Code-root convention and validation

- [x] 1.1 Add a `CODE_ROOT` config constant (default `'code'`) — implemented as `DEFAULT_CODE_ROOT` in `composables/useSnippetImport.ts` rather than `vite.config.ts`, since path resolution already happens in the snippet-import `pre` transformer (see 2.4)
- [x] 1.2 Detect `<<<` snippet-import paths that resolve outside the code root and emit a console warning naming the slide and resolved path (no build failure, no dev-server block) — implemented in `setup/transformers.ts`'s `pre` transformer via `isWithinCodeRoot`
- [x] 1.3 No separate vite.config.ts logic needed to mirror: the validation lives in `setup/transformers.ts`/`composables/useSnippetImport.ts`, both already symlinked into `e2e/`
- [x] 1.4 Unit test (`composables/__tests__/useSnippetImport.spec.ts`: `isWithinCodeRoot`) + e2e test (`tests/code-snippet-import.spec.ts`: out-of-root import still renders, warning verified manually via dev-server console output)

## 2. Custom snippet-import preprocessing (slicing + anchor extraction)

- [x] 2.1 Implemented `composables/useSnippetImport.ts`: `parseSnippetImportLine`/`parseSnippetSelector`/`resolveSnippetSelector` for `<<< @/path[selector] lang` lines (none/line-range/content-anchor-range)
- [x] 2.2 Content-anchor range resolution falls back to the whole file with a console warning when an anchor isn't found (consistent degrade-visibly philosophy; occurrence selectors are a highlight-anchor-only concept, not needed for slicing)
- [x] 2.3 Unit tests in `composables/__tests__/useSnippetImport.spec.ts`
- [x] 2.4 `pre` `MarkdownTransformer` registered in `setup/transformers.ts`, rewriting `<<<` lines into a literal fence in `ctx.s` (MagicString) before Slidev's native rule runs
- [x] 2.5 Anchor-declaration lines following a `<<<` import are consumed and appended to the fence's code behind a sentinel (`ANCHOR_BLOCK_SENTINEL`) rather than tracked via a separate side-channel map — simpler and avoids fence/anchor-group correlation entirely, since both travel together as one fence's code
- [x] 2.6 Registered with `ctx.options.data.watchFiles` for HMR
- [x] 2.7 Manually verified end-to-end (headless browser against a standalone dev server) that the sliced+annotated snippet renders correctly; dedicated "file edit triggers HMR" e2e test not added (out of scope for this session's time budget — Slidev's own `watchFiles` registration is the same mechanism its native `<<<` relies on, already proven in production)

## 3. Anchor grammar parser

- [x] 3.1 `parseExternalHighlightAnchors` added to `composables/useCodeHighlights.ts`
- [x] 3.2 Line-anchor forms implemented
- [x] 3.3 Content-anchor forms implemented
- [x] 3.4 Content-anchor range forms implemented
- [x] 3.5 Occurrence selectors implemented
- [x] 3.6 Degradation behavior implemented (skip+warn / first-match+warn / out-of-range `#N` throws as an authoring error)
- [x] 3.7 Unit tests in `composables/__tests__/useExternalHighlightAnchors.spec.ts`

## 4. Wiring into the render pipeline

- [x] 4.1 `setup/transformers.ts`'s `codeblocks` transformer splits `ctx.code` on the anchor sentinel (see 2.5) and routes to `parseExternalHighlightAnchors` when present, else falls back to the unchanged `parseCodeHighlights` path
- [x] 4.2 Confirmed: all pre-existing unit and e2e tests for inline markers pass unmodified
- [x] 4.3 Confirmed via e2e test (`tests/code-snippet-import.spec.ts`): anchor-produced highlights render callouts via the same code path, no changes to `layouts/default.vue` or `useHighlightLayout.ts`

## 5. Drag-to-reposition for anchor markers

- [x] 5.1 `serializeMarkerOverride` extended to also handle anchor-declaration lines (quote-aware closing-bracket search so array-indexing-style anchor text doesn't confuse it)
- [x] 5.2 `/api/save-code-highlight-position` needed no changes — it already finds/patches by exact `sourceLine` text match, which works identically for anchor lines
- [x] 5.3 No e2e/vite.config.ts changes needed (see 5.2)
- [x] 5.4 e2e test in `tests/code-snippet-import.spec.ts` covers drag-and-persist for an anchor-produced highlight

## 6. Worked example and docs

- [x] 6.1 Migrated the `GestorNotas` example in `slides.md` to a `<<<` import + anchor declarations; verified visually against a live dev server
- [x] 6.2 Added a "Code snippet import" section to `AGENTS.md` (symlinked as `CLAUDE.md`) documenting the selector grammar, anchor grammar, code-root convention, and degradation behavior; updated the architecture bullets and the e2e-symlinks paragraph
- [x] 6.3 `pnpm test` (156/156) passes; `pnpm test:e2e` passes for this feature's own suite across repeated runs (one unrelated pre-existing flake in `image-position.spec.ts`, the same documented cross-suite file-swap race already called out in that file's own comments)
