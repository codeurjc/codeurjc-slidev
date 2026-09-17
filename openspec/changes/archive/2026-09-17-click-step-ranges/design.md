## Context

A click step is a single number at every layer:
- **Grammar:** `MARKER_RE`'s `\{([1-9]\d*)\}` for inline markers, and `parseAnchorLine`'s `{N}` for `<<<` anchors.
- **Data:** `CodeHighlight.click?: number`, and `SlideCallout.step: number | null` from frontmatter.
- **Clicks:** `setup/transformers.ts` emits one hidden `<span v-click="N">` per distinct step, inside the code block for markers and in a hidden block for slide callouts (`slideCalloutStepBlock`).
- **Rendering:** `layouts/default.vue` reads `data-highlight-click` / `item.click`, and `isStepHidden(click)` hides while `$clicks < click`.
- **Placement:** `computeCallouts` pushes every callout rect into one `placed` array, so a hidden callout still reserves its slot.
- **Write-back:** `serializeMarkerOverride` keeps the marker prefix, including `{N}`, when it inserts `@x,y`.
- **Importer:** `buildups.ts` merges a run only when each slide is a superset of the previous one. It stamps `{k}` (the slide index in the run) on added code marks, `<v-click at>` on added paragraphs and `<img v-click>` on added images. Pairs that aren't supersets are skipped without a notice.
- **VS Code:** `clickModel.ts` registers marker/anchor/callout steps as absolute clicks, and `stepBadges.ts` formats `▸N`.

A corpus probe over the 20 ODPs in `odp/` found 5 non-superset pairs with identical code where only the highlight moves (Tema 1.2 ODP 112→114, Entrega Continua 13→14 and 16→17, Integración Continua 10→11). It also found about 25 pairs where only an image changes.

## Goals / Non-Goals

**Goals:**
- One step-range type, parsed, validated, formatted and evaluated in one place, and shared by the theme, the importer (bundled) and the VS Code extension.
- A range's visibility and clicks behave identically for markers, anchors and slide callouts.
- Callouts that are never visible together don't push each other away, while revealing or hiding never moves a visible callout.
- Walk-through build-ups from ODP merge into one slide, and near build-ups that can't merge are reported.

**Non-Goals:**
- Converting image swaps.
- An "only at N" shorthand beyond `{N-N}`.
- Ranges on native Slidev elements (`v-click="[a, b]"` already exists there).
- Changing Slidev's own `{1|3}` fence ranges.

## Decisions

### 1. A shared `StepRange` module

`composables/stepRange.ts` holds the shared step-range logic:

```text
interface StepRange { from?: number, to?: number }   // at least one side for a range; {from} alone = {N}
parseStepRange(text)        // "2", "2-", "2-4", "-1", "-0" → StepRange | null (validation lives here)
formatStepRange(range)      // shortest form: {from} → "2", {to} → "-1", both → "2-4"
isVisibleAt(range, click)   // from ?? 0 <= click && (to === undefined || click <= to)
rangeRegistrations(range)   // clicks to register with Slidev: from (if any), to + 1 (if any)
rangesOverlap(a, b)         // share at least one click (for placement)
```

- **Validation:** `from` ≥ 1; `to` ≥ `from`, or ≥ 0 when `from` is absent.
- **Canonical form:** `{2-}` parses to `{from: 2}` and formats back as `2`. A writer that preserves the authored text (write-back) keeps `2-`.

The marker regex and the anchor parser capture the braces' content with a permissive `\{([^}@]*)\}` and delegate validation to `parseStepRange`, so both grammars stay in lockstep with one definition. `CodeHighlight.click` becomes `click?: StepRange`, and `SlideCallout.step` becomes `StepRange | null`. `slideCalloutClickSteps` returns registration clicks. YAML reads `step: 2` as a number and `step: 2-4` or `-1` as a string, or as a number `-1`, which `parseStepRange(String(value))` handles uniformly.

*Alternative considered:* separate `click` and `clickEnd` fields. Rejected: every consumer would re-implement the open-start and visibility logic.

### 2. Registration: start and end + 1

`clickStepRegistrations` takes the distinct union of `rangeRegistrations` over the block's (or the slide's callouts') ranges and emits one hidden `v-click="N"` per click, as today. Absolute clicks add no offset, so the rest of the slide's relative clicks are unaffected. The highlight's DOM carries `data-highlight-click="<formatted range>"` and the layout parses it back with `parseStepRange`, so there is one attribute and one format.

### 3. Rendering by range

`isStepHidden(range)` becomes `range && !editor.editing.value && !isVisibleAt(range, $clicks)`. It is used for code-highlight spans, code callouts and slide callouts alike. Editor mode still shows everything.

### 4. Interval-aware placement

`PlacementInput.placed` becomes a list of `{ rect, range?: StepRange }`, and `placeCallout` receives the new callout's own range. A placed rect is an obstacle only when `rangesOverlap(newRange, placedRange)`. No range means always visible, which overlaps everything.

- **Order:** callouts are still placed in one deterministic order, the same pass for every click. So a visible callout's rect never depends on the current click.
- **Shelf-stacking:** the "same side already occupied" check uses the same filter.
- **Editor mode:** overlapping boxes can coexist on screen, since all callouts are shown there. That's acceptable, because they're distinguishable by drag.

*Alternative considered:* re-placing per click. Rejected: callouts would jump between clicks.

### 5. `serializeMarkerOverride` keeps the authored step text

The prefix it preserves is textual, so a range survives unchanged. Only its regex needs the permissive brace capture from decision 1.

### 6. Importer: runs with removals

`analyzePair` distinguishes:
- **common:** in both slides;
- **added** / **removed:** by kind.

A pair is convertible when:
- all non-code differences are convertible additions, as today;
- code blocks are identical in text and selector;
- removed shapes are only code annotation shapes: highlight rects, and the callout texts/connectors consumed by annotations.

`mergeRun` computes, for each mark across the run's code blocks (matched by `sameMark` on the same block position), the slide indexes it appears on:
- **Contiguous** `[a, b]`: the step range is none if `a = 0` and `b = last`; `{from: a}` if `b = last`; `{to: b}` if `a = 0`; otherwise `{from: a, to: b}`.
- **Non-contiguous:** the run is split there, with a warning.

The merged slide's code marks are the union across the run, each with its range, rendered by `markerSuffix` through `formatStepRange`. Marks keep their document order: block position, then line, then the existing ordering rules.

**Near build-up warnings.** For a pair that isn't merged but has the same role, hidden flag, title lines and heading, the importer computes the difference kinds. If every difference is a highlight, callout, list item or image (added or removed), it warns with the reason:
- `an image is removed or replaced`;
- `a list item is removed`;
- `a highlight appears again after it was removed`;
- or the existing unconvertible-addition kinds.

These go to the same `warnings`, so they reach the console and the import report's notices.

### 7. VS Code

- **Click model:** `clickModel.ts` registers `rangeRegistrations` for markers, anchors and callouts. The callout `step:` regex reads the whole scalar, including ranges.
- **Badges:** they format with the authored-form text from `formatStepRange` (`▸2-4`). Several ranges on one line are sorted by first click (open start = 0).
- **Hovers:** "revealed at click N", "visible at clicks N–M", "visible until click M".
- **Ground-truth deck:** gains a range slide, and a walk-through slide with `{-0}`/`{1-1}`/`{2}`, to confirm the totals in real Slidev.

## Risks / Trade-offs

- **[A range adds a click authors didn't expect]** A last-step `{3-3}` makes the slide one click longer. → This is documented, the VS Code badge shows the total, and the importer uses an open end on a run's last slide.
- **[Overlapping callouts in editor mode]** With interval-aware placement, callouts from different steps can overlap while all are shown in the editor. → This is accepted: the editor exists to move them, and the presentation itself never shows them together.
- **[Grammar ambiguity with `@x,y`]** The permissive brace capture must stop before `@`. → The capture excludes `@` and `}`, and unit tests cover `{2-3}@120,40`.
- **[Importer over-merging]** Removing highlights could merge slides the author meant as distinct explanations. → A merge still requires identical code, title, heading and all other shapes. The corpus test pins the expected merges (Tema 1.2 ODP 112–114).

## Open Questions

None.
