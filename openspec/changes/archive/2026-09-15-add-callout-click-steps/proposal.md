## Why

The CodeURJC decks often explain a piece of code step by step: the same code repeats on consecutive slides, each adding one more highlight and callout. Slidev reproduces that inside one slide with click steps, and `slidev export --with-clicks` keeps each step as its own PDF page. But this theme's code-highlight callouts are always fully shown, so they can't take part in click steps. Presenters (and the upcoming ODP importer) are left duplicating whole slides.

## What Changes

- A click-step suffix `{N}` (N ≥ 1) on code highlights:
  - Inline markers: `// [!mark{2}] comment`, `// [!mark:start{2}]`, `// [!mark(3-9){2}@120,40] comment`.
  - External anchor declarations on `<<<` imports: `[!mark:3{2}] comment`, `[!mark:"text"#2{3}] comment`.
  - The suffix goes after the role, substring range or occurrence selector, and before any `@x,y` position override.
- A stepped highlight (its highlight styling, callout box and connector) stays hidden until the slide reaches click `N`, then stays visible for the rest of the slide. Highlights without a suffix are always visible, as today.
- Several highlights can share a step and appear together, which is why steps are numbered explicitly rather than implied by marker order.
- The slide's total click count includes its callout steps. Steps are declared when the markdown is processed, not after mount, because Slidev ignores click registrations made after a slide mounts.
- Callout placement runs over *all* callouts, including hidden ones, so revealing a step never moves callouts already shown.
- In editor mode (Layout tab), all callouts show regardless of the current click, so they can be dragged.
- Dragging a stepped callout rewrites only its `@x,y` override and keeps the `{N}` suffix.
- `slidev export --with-clicks` shows each step as its own page.

## Capabilities

### New Capabilities
- `callout-click-steps`: the `{N}` suffix grammar for inline markers and anchor declarations, reveal behavior, click-count registration, stable placement across steps, editor-mode visibility, and export behavior.

### Modified Capabilities
<!-- None: the new suffix is additive; existing inline-marker, anchor and callout requirements keep their current behavior for unstepped highlights. -->

## Impact

- `packages/codeurjc-slidev-theme/composables/useCodeHighlights.ts`:
  - `MARKER_RE` and the anchor-declaration parser accept `{N}`;
  - `CodeHighlight` gains an optional `click` field;
  - `serializeMarkerOverride` keeps the suffix;
  - `injectHighlightSpans` emits the step on highlight spans.
- `packages/codeurjc-slidev-theme/setup/transformers.ts`: the `codeblocks` stage emits static click-step registration elements inside the code block wrapper.
- `packages/codeurjc-slidev-theme/layouts/default.vue`: shows and hides stepped callouts, connectors and highlight styling based on the slide's current click (`useSlideContext().$clicks`); always shows them in editor mode.
- `packages/codeurjc-slidev-theme/composables/__tests__/`: grammar, serializer and span-injection unit tests.
- `tests/`: e2e coverage for step reveal, click count and export.
- `packages/vscode-codeurjc-slidev/`: no parsing changes expected, since it reuses the theme's parsers. Verify its marker decorations and anchor diagnostics accept the suffix.
- `CLAUDE.md`: grammar tables for inline markers and anchor declarations gain the `{N}` form.
- Prerequisite for `add-odp-import`.
