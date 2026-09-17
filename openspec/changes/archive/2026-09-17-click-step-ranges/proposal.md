## Why

A click step (`{N}`) can only make a highlight or callout appear, never disappear. Presenters walking through code want each highlight to show for a few clicks and then give way to the next one. The ODP decks do exactly that: in Tema 1.2 (ODP 112 → 113 → 114) the highlight moves from line 3 to line 5 to line 8. The importer can't express that, so those slides stay separate, and they don't even get a warning.

## What Changes

- **Step ranges.** Everywhere a click step is accepted, it can now be a range:

  | Form | Visible |
  |---|---|
  | `{N}` or `{N-}` | from click N on (unchanged) |
  | `{N-M}` | clicks N through M, hidden from M+1 |
  | `{-M}` | from the start of the slide through click M (`{-0}`: only before the first click) |

  This covers inline markers (`// [!mark{2-4}]`), `<<<` anchor lines (`[!mark:3{-1}]`), and slide callouts as a YAML string (`step: 2-4`, `step: -1`). A given start is ≥ 1, an end is ≥ its start (or ≥ 0 with an open start); anything else is malformed and degrades like any malformed marker.
- **The disappearance is a click.** A range registers its end + 1 with Slidev, so the slide's total includes the click that hides it.
- **Callout placement is interval-aware.** Callouts avoid only the callouts visible at the same time as them. So walk-through callouts sit beside their own highlight instead of shelf-stacking as if all were visible at once. Placement still runs once for every click, so revealing or hiding a step never moves a visible callout.
- **ODP build-ups can remove highlights.** Consecutive slides with the same code may also drop highlights and their callouts. Each one gets the range of slides it appears on (click k for the run's k-th slide after the first: `{-0}` for the first slide only, an open end on the last). Removed or swapped images are still not converted.
- **ODP near build-ups warn.** Consecutive same-title slides that differ only in highlights, callouts, list items or images, but can't be merged, now produce a console warning (and an import report notice) naming the slides and the reason, instead of being skipped silently.
- **VS Code.** The click model counts a range's disappearance click. Badges show the range as written (`▸2-4 of 5`, `▸-1 of 3`), and hovers say "visible at clicks 2–4".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `callout-click-steps`: the step suffix accepts ranges on markers and anchors; a highlight's visibility follows its range; the slide's clicks include a range's end + 1; callout placement is interval-aware; editor drag keeps the range; malformed ranges degrade.
- `slide-callouts`: `step` accepts the range forms as a YAML string, with the same visibility and click counting.
- `odp-import`: build-ups may remove highlights and callouts on the same code; near build-ups that can't be merged warn.
- `odp-code-conversion`: merged code build-ups give highlights step ranges from the slides they appear on.
- `vscode-click-step-badges`: the click model, badges and hovers handle ranges.

## Impact

- **Theme** (`packages/codeurjc-slidev-theme/`):
  - `composables/useCodeHighlights.ts`: step range grammar for markers and anchors; `CodeHighlight.click` becomes a range; `serializeMarkerOverride` keeps it.
  - `composables/useSlideCallouts.ts`: `step` parsing and serialization.
  - A new shared step-range module: parsing, formatting, visibility, the clicks to register.
  - `setup/transformers.ts`: placeholders for start and end + 1.
  - `layouts/default.vue`: visibility by range, and interval-aware `placed`.
  - `composables/useHighlightLayout.ts`: placement input carries visibility intervals.
- **Importer** (`packages/create-codeurjc-slidev/src/odp/`): `buildups.ts` (removals, ranges, near build-up warnings), `annotations.ts`/`draft.ts` (writing range suffixes).
- **VS Code** (`packages/vscode-codeurjc-slidev/`): `clickModel.ts`, `stepBadges.ts`, the ground-truth deck.
- **Tests:**
  - theme unit tests: grammar, visibility, placement intervals;
  - e2e: range visibility, click totals, callouts not colliding over time, export with clicks;
  - importer: synthetic walk-through ODPs, plus corpus expectations for Tema 1.2 and the GitHub Actions decks;
  - VS Code: unit tests and the ground-truth deck.
- **Docs:** `AGENTS.md` (marker grammar, anchors, slide callouts, ODP build-ups, VS Code) and the tutorial's click-steps slide.
