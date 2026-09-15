## 1. Grammar

- [x] 1.1 Add `click?: number` to `CodeHighlight` in `composables/useCodeHighlights.ts`
- [x] 1.2 Extend `MARKER_RE` with an optional `\{([1-9]\d*)\}` group after the role and substring range and before `@x,y`, and carry it through `parseMarkerLine`/`parseCodeHighlights`. For `:start`/`:end` pairs, the start marker's step wins, falling back to the end's
- [x] 1.3 Extend the anchor-declaration parser to accept `{N}` after the anchor target (including substring range, `+N` offset, `..` range, `#N`/`#*`) and before `@x,y`; with `#*`, give every produced highlight the same step
- [x] 1.4 Make malformed suffixes (`{0}`, `{}`, `{x}`) leave the marker or anchor unrecognized, through the existing malformed-marker paths
- [x] 1.5 Update `serializeMarkerOverride` to insert or replace `@x,y` after an existing `{N}` suffix, for both inline markers and anchor declarations
- [x] 1.6 Check `findMarkerSpan` still covers the whole marker including the suffix
- [x] 1.7 Unit tests: every inline form with a suffix, range precedence, anchor forms (line, range, content, substring, offset, occurrence, `#*`), malformed suffixes, serializer round-trips keeping `{N}`

## 2. Click registration in the transformer

- [x] 2.1 In `injectHighlightSpans`, add `data-highlight-click="N"` to spans of stepped highlights
- [x] 2.2 In `setup/transformers.ts`'s `wrapCodeBlock`, emit one zero-size, `aria-hidden` `<span v-click="N" class="code-callout-step" data-click-step="N"></span>` per distinct step used in the block
- [x] 2.3 Early e2e check: a slide whose only click content is a code block with steps `{1}` and `{2}` needs exactly two clicks before advancing (confirms the directives compile and register before mount)

## 3. Layout reveal behavior

- [x] 3.1 In `layouts/default.vue`, read the current click from `useSlideContext().$clicks`, carry each callout's step in `CalloutItem`, and derive per-callout visibility (`click == null || $clicks >= click`)
- [x] 3.2 Apply a `step-hidden` class (`visibility: hidden`, highlight styling removed) to hidden steps' callout boxes, connector paths and `[data-highlight-id]` spans; keep `computeCallouts()` placing all callouts regardless of step
- [x] 3.3 While `editor.editing.value` is true, never apply `step-hidden`
- [x] 3.4 (Not needed: the print-with-clicks e2e showed `$clicks` is reliable per print page, so no fallback was implemented.) If 2.3 or the export test shows `$clicks` is unreliable in print/export contexts, switch visibility to reading the `slidev-vclick-hidden` state of the `code-callout-step` placeholders

## 4. Tests, extension check, docs

- [x] 4.1 E2e: step reveal order (unstepped always visible; `{1}` at click 1; `{2}` at click 2; shared step appears together)
- [x] 4.2 E2e: a visible callout's position is identical before and after a later step is revealed
- [x] 4.3 E2e: in editor mode at click 0, stepped callouts are visible, and dragging one rewrites the marker to `[!mark{N}@x,y]`; restore fixtures in `afterAll`
- [x] 4.4 E2e: an anchor-declared stepped highlight on a `<<<` import reveals on its click
- [x] 4.5 (Two e2e checks: a real `slidev export --with-clicks --format png` produces one page per step, using the root `playwright-chromium` devDependency; and the dev server's browser exporter, `/export?print=clicks`, shows exactly the matching callouts on each per-click page.) Export check: `slidev export --with-clicks` on a stepped fixture produces one page per step, with the expected callouts per page (Playwright PDF page count or per-click screenshots)
- [x] 4.6 VSCode extension: add unit cases confirming marker decorations and anchor diagnostics accept suffixed markers without new warnings
- [x] 4.7 Update `CLAUDE.md`'s inline-marker and anchor grammar tables with the `{N}` form, its placement rule, and a note that it interacts with Slidev's native `{1|2}` fence ranges only through the author's own click numbering

## 5. Verification

- [x] 5.1 `pnpm lint && pnpm typecheck`
- [x] 5.2 `pnpm test`
- [x] 5.3 `pnpm test:e2e`
