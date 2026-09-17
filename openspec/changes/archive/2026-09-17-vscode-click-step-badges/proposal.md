## Why

A code highlight's click step (`// [!mark{2}]`, `[!mark:"text"{2}]`) is only visible as a few characters inside marker text the extension dims to 40% opacity. The order in which a slide reveals its highlights can't be read at a glance. Slidev's own fence line ranges (`{1|3}`) share the same click counter, so the real reveal order is even harder to follow without running the deck.

## What Changes

- **Step badges.** A `▸N` badge is painted at the end of each line that carries a click step, as an after-line decoration that never shifts code:
  - a manual fence marker line (a range's badge goes on its `:start` line);
  - a `<<<` anchor line;
  - every segment of a native fence range after the first (an `all`/`*` segment's badge goes on the fence's opening line).

  Several steps on one line merge (`▸1,3`).
- **Slide total.** Badges read `▸2 of 3`, where N is the slide's total number of clicks. A new setting, `codeurjcSlidev.stepBadges.showTotal` (default `true`, applied live), turns the "of N" part off. This is the extension's first contributed setting.
- **Per-slide click model.** A pure module counts a slide's clicks the way Slidev does:
  - theme markers and anchors (absolute clicks);
  - fence line ranges, with a relative or numeric `at`;
  - `v-click`/`v-after`/`v-click-hide` and `<v-click>`/`<v-after>` with literal values;
  - `<v-clicks>` around a markdown list;
  - `<VClickGap>`;
  - frontmatter `clicks:`.
- **Uncountable slides.** When a slide contains a click source the model can't count (a bound value, a custom component, magic-move fences, MDC `{v-click}` attributes, KaTeX line ranges, …):
  - the "of N" total is hidden for the whole slide;
  - absolute badges, and relative badges with nothing uncountable before them, stay;
  - a relative badge whose start depends on the unknown count is hidden.
- **Hovers.** Marker-line and anchor-line hovers say at which click the highlight appears ("click 2 of 3"), or why no number is shown.
- **Reference CodeLens.** The lens in `code/` files adds each reference's step to its slide label, e.g. `📽 2 references — Slide 4 ▸3 of 3, Slide 7`.
- **Theme fix: native ranges on marked fences.** The theme wraps any fence carrying markers or an inline `// [!source]` link itself, and that wrapper drops Slidev's `{1|3}` ranges and `{at: …}` options, so those ranges neither highlight nor count as clicks. The wrapper now forwards them the way Slidev's own wrapper does.
- **Test hook.** `activate()` returns an exports object exposing the badges last applied per document, so the extension-host smoke test can check decorations (VS Code's API can't read them back).

## Capabilities

### New Capabilities

- `vscode-click-step-badges`: the per-slide click model, step badges on marker lines, anchor lines and native fence ranges, the "of N" total and its setting, uncountable-slide handling, step information in hovers and in the reference CodeLens title, and the test hook.

### Modified Capabilities

- `callout-click-steps`: native fence line ranges and fence options keep working on fences the theme wraps because of markers or a source link.

Existing VS Code decorations, hovers and CodeLens keep their behaviour; this change only adds to them.

## Impact

- **Code** (`packages/vscode-codeurjc-slidev/`):
  - new `src/clickModel.ts`;
  - `src/markerDecorations.ts` (steps and badges);
  - `src/importAnalysis.ts` (anchor badges and hover text);
  - `src/referenceIndex/codeLens.ts` (lens titles);
  - `src/documentScan.ts` (slide ranges and fence info strings);
  - `src/extension.ts` (badge decoration type, setting listener, exports hook);
  - `package.json` (`contributes.configuration`).
- **Theme:** `setup/transformers.ts` (`wrapCodeBlock` forwards ranges and options), and `useCodeHighlights.ts` exports its anchor-line parser. The model reuses `parseCodeHighlights`/`parseExternalHighlightAnchors`, which already expose `click`.
- **Tests:**
  - vitest for the model, decorations, anchors, hovers and lens titles;
  - a new isolated-project e2e test comparing the model with real Slidev's click totals on a fixture deck;
  - extension-host smoke tests for badges, hover, CodeLens and the setting.
- **Docs:** the extension README and `AGENTS.md`'s VS Code section.
