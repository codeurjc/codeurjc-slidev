## Context

Code highlights come from two parsers in `composables/useCodeHighlights.ts`:
- `parseCodeHighlights`: inline `// [!mark…]` markers, via `MARKER_RE`.
- `parseExternalHighlightAnchors`: `[!mark:…]` declaration lines after a `<<<` import.

Both produce `CodeHighlight` objects. The `codeblocks` transformer in `setup/transformers.ts` renders them as `[data-highlight-id]` spans with `injectHighlightSpans`, then wraps the block with `wrapCodeBlock`. After mount, `layouts/default.vue`'s `computeCallouts()` measures those spans and places a callout box plus elbow connector for each commented highlight. Callouts are layout-level DOM (`calloutItems`), not part of the slide's markdown.

Slidev's click system (`@slidev/client/composables/useClicks.ts`) collects click-driven elements in a per-slide `ClicksContext`. `register()` only takes effect before the slide mounts: afterwards it logs `Unexpected register after mounted`, and `total` is computed from `maxMap` at mount time. The `v-click` directive registers in its `created`/`mounted` hooks, as part of the slide component's own initial render.

`slidev export --with-clicks` renders with `?print=clicks`, one page per click of each slide. It is the default for PPTX exports.

The motivating content comes from the ODP decks. GitHub Actions slides 9–13 and Tema 1.2 slides 111–114 repeat the same code while adding one callout (and sometimes a highlight box) per slide. Several callouts can appear together.

## Goals / Non-Goals

**Goals:**
- An explicit `{N}` click step on both inline markers and anchor declarations.
- Hidden-until-click reveal for a highlight's styling, callout and connector, counted in the slide's total clicks and honored by export with clicks.
- Callouts that don't move as steps reveal, and editor mode that still exposes everything.

**Non-Goals:**
- Click *ranges* (`{2-4}`, disappearing after a later click) and animation presets. `{N}` means "from click N on".
- Relative steps (`{+1}`) or steps implied by marker order. The user chose explicit numbers, since several callouts often share a step.
- Coordinating with Slidev's native `{1|2|3}` line-range highlighting inside the same fence. Both may coexist; how their click numbers interleave is up to the author.

## Decisions

- **Suffix syntax `{N}`, placed before `@x,y`.**
  - Braces echo Slidev's own click notation in fences (`{1|3}`) and can't be confused with existing tokens: `(a-b)` substring ranges, `#N` occurrences, `+N` offset ranges, `@x,y` overrides.
  - Putting it before `@x,y` keeps the rule "the editor always appends/replaces the trailing `@x,y`" valid, so `serializeMarkerOverride` only needs to leave the suffix in place.
  - Rejected alternatives: `click=N` (introduces spaces inside the marker, which the current grammar and `findMarkerSpan` don't allow); `^N` (unfamiliar); a separate directive line (doesn't work for inline markers).
  - `CodeHighlight` gains `click?: number`.

- **Declare steps when the markdown is processed, via static `v-click` elements emitted by the transformer.**
  - For each distinct step N in a code block, `wrapCodeBlock` emits a zero-size, `aria-hidden` element `<span v-click="N" class="code-callout-step" data-click-step="N"></span>` inside the wrapper markup.
  - Because the transformer's HTML is compiled into the slide's Vue template, these directives register during the slide's initial render, before mount, so Slidev's `total` accounts for them. An absolute `v-click="N"` means "active from click N".
  - Rejected: calling `clicksContext.register()` from `default.vue` after `computeCallouts()` (too late — callouts only exist after mount, and the context ignores late registrations); setting `clicks:` in frontmatter (would clobber an author's own count and doesn't compose with other `v-click`s).
  - The `code-callout-step` elements are invisible regardless of their `v-click` state, and `.content-inner :where(.slidev-vclick-hidden) { display: none }` doesn't affect layout because they take no space.

- **Visibility is driven by `$clicks` in the layout, not by reading the placeholders' classes.**
  - `injectHighlightSpans` adds `data-highlight-click="N"` to stepped highlight spans.
  - `default.vue` reads the current click from `useSlideContext().$clicks`. For each callout it compares that value with its step and toggles a `step-hidden` class on the callout box, the connector path and the highlight span(s).
  - `step-hidden` uses `visibility: hidden` (and removes highlight styling), not `display: none`, so geometry measurement is unaffected.
  - Reading `$clicks` directly is simpler and reactive in the presenter view, the overview and `print=clicks`; watching `slidev-vclick-hidden` with a MutationObserver would add indirection without benefit.

- **Place all callouts, then hide.** `computeCallouts()` keeps placing every commented highlight, stepped or not, so positions are identical at every click; only visibility changes. This directly gives the "stable positions" requirement at no extra placement cost.

- **Editor mode overrides visibility.** While `editor.editing.value` is true, `step-hidden` is never applied. Drag end already goes through `/api/save-code-highlight-position` with the marker's original `sourceLine`; `serializeMarkerOverride` is extended to recognize `{N}` so it inserts or replaces `@x,y` after the suffix rather than treating the suffix as part of the comment.

- **Malformed suffixes → unrecognized marker.** The regexes accept only `\{[1-9]\d*\}`. Anything else makes the whole marker or anchor fail to parse, reusing the existing handling (inline: left as code text; anchors: the existing unrecognized-line path). This avoids a separate error category.

## Risks / Trade-offs

- [The transformer's `v-click` spans might not compile as directives if the code-block HTML ends up in a `v-pre` or escaped context] → The existing wrapper already relies on raw HTML attributes reaching the Vue template (mustache-escaping handled in `wrapCodeBlock`). An early e2e test asserts a stepped slide's total clicks before building the layout-side logic.
- [`$clicks` in export/print contexts might not reflect per-page clicks for layout-level DOM] → Covered by an e2e export test (`--with-clicks` page count and per-page visibility). If it fails, fall back to reading the `slidev-vclick-hidden` state of the `code-callout-step` placeholders, which Slidev keeps correct in every mode.
- [Authors mixing Slidev's native `{1|2}` fence ranges with `{N}` callout steps may be surprised by how the counts interleave] → Documented in CLAUDE.md as author-controlled; not normalized.
- [VSCode extension diagnostics could flag the new suffix] → The extension reuses the theme's parsers, so the grammar change carries over. A task verifies marker decorations (`findMarkerSpan`) and anchor diagnostics with suffixed markers.
