## Context

`packages/vscode-codeurjc-slidev/` previews the theme's grammar without the dev server:
- `markerDecorations.ts` returns plain `dims`/`highlights` for manual fences, and `extension.ts` paints them. `HighlightSpan` drops the parsed `click`.
- `importAnalysis.ts` resolves each `<<<` anchor line on its own, for hovers, diagnostics and the import CodeLens. Anchor lines get no decorations.
- `referenceIndex/codeLens.ts` titles lenses in `code/` files as `📽 N references — Slide a, Slide b`.
- `documentScan.ts` finds fences (language only, no range or options), import blocks, and slide numbers.

Slidev's click counter, as implemented in `@slidev/client` 52:
- **Registration.** Every click source registers `{ max, delta }` with the slide's `ClicksContext`:
  - `v-click`/`v-after`/`v-click-hide` directive `mounted` hooks;
  - `CodeBlockWrapper`/`KaTexBlockWrapper`/`ShikiMagicMove` `onMounted`;
  - `VClickGap` `onMounted`.
- **Resolving `at`** (`calculateSince`):
  - a relative value (`+N`/`-N`, default `+1`) starts at `currentOffset + N` with `delta = N + size - 1`, where `currentOffset` is the sum of the deltas registered so far;
  - a number starts exactly there, with `delta = 0`.
- **Total.** The total is `max` over all registrations, unless frontmatter `clicks:` overrides it. `clicksStart` shifts the lower bound.
- **Fences.** The wrapper transformer turns ```` ```lang [title] {r0|r1|…} {options} ```` into `<CodeBlockWrapper :ranges>` with `size = ranges.length - 1`. Segment `k` shows from click `start + k - 1`, and segment 0 is the initial state.
- **Theme markers.** Code-highlight steps are emitted as `<span v-click="N">`, which is absolute.

## Goals / Non-Goals

**Goals:**
- One pure, unit-tested click model per slide, shared by fence decorations, anchor lines, hovers and the reference CodeLens.
- Numbers that are either exactly what Slidev does or not shown.
- A ground-truth test against real Slidev, so the model can't drift silently.
- Smoke coverage of the painted badges, through a test hook.

**Non-Goals:**
- Slide callouts' `step:` frontmatter, and `v-motion`.
- Running Slidev or evaluating Vue expressions in the extension.
- Diagnostics for gaps or duplicates in step numbering.
- Resolving `src:`-imported slides, which the extension doesn't scan today.

## Decisions

### 1. A registration-list click model

`src/clickModel.ts` exposes `computeSlideClicks(slideText, slideStartLine)`. It returns:
- **`registrations`:** a list of `{ line, kind, start, size, exact }` in Slidev's registration order;
- **`total`:** `number | null` (null when uncountable, unless frontmatter `clicks:` fixes it);
- **`uncountable`:** a list of `{ line, reason }`.

The model walks the slide's sources and reproduces `calculateSince`, keeping a running `offset`:

| Source | Recognised form | Registration |
|---|---|---|
| Theme marker / anchor step | `{N}` via `parseCodeHighlights` / `parseExternalHighlightAnchors` | absolute `N` |
| Fence line ranges | ```` ``` ```` info `{a\|b\|c}` + optional `{at: 3}` / `{at: '+2'}` / `{startLine: N}` literal | `size = segments - 1` |
| `v-click` / `v-click-hide` / `v-after` attribute, `<v-click>` / `<v-after>` element | no value, `"+N"`, `"-N"`, `"N"`, `"[a, b]"` | as `normalizeSingleAtValue`/range (`v-after` = `+0`) |
| `<v-clicks>` | around one markdown list; literal `depth`, `every`, `at` | one per counted item + trailing gap, as `VClicks.ts` |
| `<VClickGap size="N">` / `<v-click-gap>` | literal size | relative `+N` |
| Frontmatter | `clicks: N` | total override |

Anything else that can register clicks makes the source **uncountable**: every registration after it gets `exact: false`, and `total` becomes `null`. That covers:
- bound values (`:at=`, `v-click="expr"`);
- `<v-switch>`;
- magic-move fences;
- PascalCase or unknown kebab-case components (they may register clicks);
- `<v-clicks>` over anything but a single list;
- MDC `{v-click}` attributes and KaTeX `$$ {ranges}`: the ground-truth deck showed Slidev registering no clicks for any spelling tried, which isn't something to rely on, so no number is given.

Absolute registrations keep `exact: true` wherever they are, because they don't depend on the offset.

**Order.** Slidev registers in `mounted` order: children before parents, siblings in document order. For flat slide content that is document order, which the model uses. A click source nested inside another click-bearing element is registered child first. The model applies that rule for `<v-click>`/`<v-clicks>` wrappers it parses, and the ground-truth test (decision 6) is the arbiter.

*Alternative considered:* counting only theme markers plus fence ranges. Rejected: a single `v-click` bullet before a fence shifts the fence's clicks, so badges would be wrong without any warning.

### 2. Badges are derived per line

`markerDecorations.ts` gains `badges: { line, steps: number[], total: number | null }[]`, computed from the model:
- **Marker highlights:** on `startLine`, the `:start` marker line, with the step from `click`.
- **Fence range segment `k ≥ 1`:** on the first document line of that segment's first range. `all`/`*`, or a segment that resolves to no line, goes on the fence's opening line. The step is `start + k - 1`. Inexact segments are omitted.
- **Anchor lines:** from `importAnalysis.ts`, on the anchor line itself.
- **Merging:** steps on the same line are merged, sorted and de-duplicated.

The text is formatted in one pure function, `formatStepBadge(steps, total, showTotal)`, producing `▸2`, `▸1,3` or `▸2 of 3`. The total is shown only when `showTotal && total !== null`.

*Alternatives considered:*
- **Circled digits:** rejected by the user. They stop at ⑳ and render unevenly.
- **Gutter icons:** they need one decoration type per number and compete with breakpoints and git.

### 3. One badge decoration type, set per range

`extension.ts` adds a decoration type with no styling of its own. Each badge is a `DecorationOptions` whose range is the end of the line, with `renderOptions.after = { contentText, color: ThemeColor('editorCodeLens.foreground'), margin: '0 0 0 1.5em' }`. Both the fence badges and the anchor badges use it.

The setting `codeurjcSlidev.stepBadges.showTotal` is read on every update. `workspace.onDidChangeConfiguration` repaints the visible editors when it changes.

### 4. Hovers and CodeLens reuse the model

- **Marker line hovers.** A new hover source covers manual-fence marker lines, which have no hover today: "Highlight revealed at click 2 of 3".
- **Anchor hovers.** The existing text gains the same suffix.
- **When there's no number.** If the slide can't be counted, the hover omits "of N" and names the first uncountable source (`<MyComponent> on line 12 may add clicks`). A relative badge that was hidden says so as well.
- **CodeLens titles.** `computeCodeLensesForDocument` already reads the slide's markdown to find its slide number. It also runs the model on that slide, so a mention reads `Slide 4 ▸3 of 3` (or `Slide 4 ▸3`), and plain `Slide 7` when the reference has no step. `showTotal` is passed in so the lens follows the setting.

### 5. Exports test hook

`activate()` returns `{ stepBadgesFor(uri: string): { line: number, text: string }[] }`, which reads a `Map` filled in whenever decorations are applied. It exposes plain data only and doesn't affect behaviour. The smoke suite reads it through `vscode.extensions.getExtension('codeurjc.vscode-codeurjc-slidev').exports`.

*Alternative considered:* wrapping `TextEditor.setDecorations` from the test. Rejected: editor objects in the extension host are frozen, and each extension gets its own API instances.

### 6. Ground truth against real Slidev

A new isolated-project e2e spec, `tests/click-model-ground-truth.spec.ts`:
- builds a fixture deck with one slide per source form (and mixes of them);
- reads each slide's real click total from the running deck (through Slidev's nav state, after mounting it);
- for a range fence, reads the click at which a segment first highlights by stepping through clicks.

It then compares these with `computeSlideClicks`, imported from the extension package, which is pure Node. The same fixture's expectations are copied into a vitest table, so a model change that disagrees with Slidev fails fast without a browser.

### 7. The theme's wrapper forwards native ranges

The theme's `codeblocks` transformer runs before Slidev's `wrapper_default`. For any fence with highlights or a source link, it returns `<CodeBlockWrapper title=…>` without `:ranges` or the `{options}` binding, so `{1|3}` on such a fence silently does nothing. `wrapCodeBlock` now parses the info string with the same pattern Slidev's wrapper uses and emits `v-bind="{options}"` and `:ranges='[…]'`, so markers and native ranges work together. The click model can then treat every fence alike.

### 8. Scanning a slide

The model mirrors `@slidev/parser`'s slide split (`splitSlides` in `documentScan.ts`, which also fixes `computeSlideNumber` for slides with their own frontmatter). Within a slide it:
- blanks HTML comments (notes included);
- takes fences, `$$` blocks and `<<<` imports with their anchor lines as block events;
- tokenises the rest for opening and closing tags and MDC `{…}` attribute blocks, skipping inline code.

Events are processed in position order with a tag stack, so an element's directive registers when it closes (post-order).

**Components.**
- `<v-click>`, `<v-after>` and `<v-clicks>` that contain another click source are uncountable, rather than modelling their per-child directives.
- PascalCase components outside Slidev's click-free built-ins are uncountable.
- Kebab-case tags are uncountable only when the project has a matching component under `components/`. Otherwise they are treated as HTML or icons (`<carbon-arrow-right />`), which are far more common in decks.
- `v-mark` and `v-motion` are uncountable.

**Anchors.** Anchor steps come from resolving the imported file when a resolver is available, as the theme does: an anchor that matches nothing registers nothing. Without a resolver, the step is read from the anchor syntax.

## Risks / Trade-offs

- **[Registration order differs from document order in nested markup]** → The model follows Slidev's child-first `mounted` order for the wrappers it parses. The ground-truth spec has explicit nested cases; any other nesting of a click source inside a click-bearing element is treated as uncountable.
- **[Slidev changes its click internals]** → The ground-truth e2e fails on the Slidev bump that changes them, pointing at the model table.
- **[False "uncountable" from harmless custom components]** → The total is hidden more often than strictly needed, but it is never wrong. Absolute badges still show. An allow-list of the theme's and Slidev's click-free built-ins (`<img>`, `<Tweet>`, `<Youtube>`, …) keeps the common cases counted.
- **[Badges add visual noise]** → They only appear on lines with a step, in the CodeLens colour, and "of N" can be turned off.
- **[Performance on large decks]** → The model runs per slide on the text that decoration updates already scan. The CodeLens runs it only for slides that reference the open file.

## Open Questions

None.
