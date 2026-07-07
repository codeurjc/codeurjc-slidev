## Context

The `content` box in `layouts/default.vue` is fixed-geometry: the layout editor drags/resizes it and persists `x/y/w/h` as CSS custom properties (`--ed-content-*`) baked into the `.vue` file (`composables/useEditor.ts`). Today `.content` uses `min-height`, so oversized content simply grows the box past the slide's visible bounds — there is no signal to the author and no attempt to keep text inside the box. Font size is currently a hardcoded `font-size: 1.5rem` on the title only; body content has no explicit sizing logic at all.

Slidev renders each slide at a fixed logical resolution (the `aspectRatio` frontmatter, e.g. 16:9 → 980×552-style canvas) and scales the whole slide via CSS `transform` for viewport fit. That means any measurement done in the slide's own coordinate space (`scrollHeight`, `clientHeight`, etc.) is stable regardless of window size — no need to react to browser resize, only to content/box changes.

Slidev's `v-click` reveals work by toggling visibility (`display`/opacity, depending on directive) of elements within the slot as the presenter advances `$clicks`. This changes the rendered height of `.content` at each step without any navigation event — auto-fit must observe this via DOM mutation, not routing.

## Goals / Non-Goals

**Goals:**
- Keep rendered text within the content box's existing bottom edge at every `v-click` step, without ever resizing the box.
- Use a single default/ceiling font size (24px) when content comfortably fits.
- Shrink font size (real `font-size`, causing rewrap) down to a 12px floor when needed; stop shrinking at the floor and allow vertical overflow to remain visible as a deliberate "box too small" signal.
- Grow back toward 24px when there is slack (e.g. after clicking back to an earlier, shorter reveal state).
- Recompute live and correctly across `v-click` transitions.

**Non-Goals:**
- Resizing or otherwise touching content-box geometry — that remains entirely the layout editor's responsibility.
- Handling horizontal overflow by shrinking — long lines (e.g. unwrapped code) are expected to wrap; this feature does not add horizontal shrink-to-fit.
- Per-region auto-fit (e.g. independently fitting an image-beside-text region vs. a code-beside-text region). The current model has one `content` box; multi-region layouts are a separate, later roadmap item and may require reworking this feature.
- Persisting the computed font size into the `.vue` file the way box geometry is persisted — it is recomputed live at render time in dev, build, and export alike (all three render through a real browser DOM via Slidev/Playwright, so results are consistent without baking in a static value).

## Decisions

### 1. Real font-size stepping, not `transform: scale()`
A visual `transform: scale()` on the whole content box would be cheaper (one measurement, one ratio, no reflow) and would look identical for monospace code blocks, but it does not rewrap text — a paragraph that overflows because lines are too wide would just shrink in place rather than reflowing to use freed horizontal space. The explicit ask is real font-size reduction with genuine reflow, so implementation applies a computed `font-size` (via a CSS custom property, e.g. `--content-font-size`, consumed by `.content`'s own `font-size` and inherited by children in `rem`/`em`-relative units) rather than a `transform`.

**Alternative considered**: `transform: scale()` — rejected because it doesn't rewrap and wasn't what was asked for, despite being cheaper.

### 2. Single font size for the whole `.content` box, not per-child-block
Given the box model still has one `content` region (no sub-regions yet), the computed font size applies uniformly to the whole box rather than fitting each top-level markdown block (list, code, image caption, etc.) independently. This keeps visual consistency within a slide and avoids a more complex per-block layout engine that would likely be thrown away once per-region layout config lands.

**Alternative considered**: per-block auto-fit — deferred; revisit once the layout-config roadmap item introduces regions, since that's the point where "the code block on the right" and "the bullets on the left" plausibly need independent sizing.

### 3. Measurement strategy: binary search over `[12px, 24px]`, measuring against the box's bottom edge
On mount, on `v-click` step change (observed via a `MutationObserver` on the slot's subtree, since Slidev toggles visibility rather than emitting a Vue event auto-fit can hook), and on content change, run a bounded binary search: try a candidate font size, measure the content-inner wrapper's `offsetHeight` against the fixed box height (its bottom edge, derived from `editor.positions.content.h`, i.e. the layout editor's persisted geometry treated as an immutable input), and converge to the largest size in `[12, 24]` that does not overflow. `offsetHeight` (not `getBoundingClientRect`) is required: Slidev renders each slide at a fixed logical resolution and scales the whole slide via a CSS `transform` for responsive display, so `getBoundingClientRect` would return a post-transform (viewport) size while the box height is a pre-transform logical value — comparing the two directly scales the effective shrink threshold by whatever the current transform happens to be (a real bug hit and fixed during implementation, confirmed via a `matrix(1.304, ...)` transform on `.slidev-slide-content`). `offsetHeight` stays in the same logical coordinate space as the box height regardless of viewport size.

**Alternative considered**: iterative 1px-at-a-time stepping — simpler to reason about but does up to 12x more reflows per fit pass than binary search (~4 iterations for the same range); binary search chosen for responsiveness during live `v-click` transitions where jank would be visible to a presenter.

### 4. No debounce/animation on font-size changes across `v-click` steps
Since box geometry is fixed and the presenter explicitly asked for shrink/grow to "just work" across clicks, the recompute fires synchronously on each mutation with no transition animation in this iteration. A CSS `transition: font-size` could be layered on later if abrupt size changes read as jarring in practice, but it's not part of this change's scope.

### 5. Floor behavior: stop, don't clip
At the 12px floor, if `scrollHeight` still exceeds the box height, the implementation does not clip (`overflow: hidden`) or continue shrinking past the floor — it leaves `.content` unclipped so the overflow is visibly apparent to whoever is authoring/rehearsing the slide, functioning as an implicit "this box is too small for this content" signal rather than a silent failure.

## Risks / Trade-offs

- **[Risk]** `MutationObserver`-based `v-click` detection may fire multiple times per step (Vue's reactivity batches DOM updates in microtasks, but attribute/style toggles inside a slot could still produce multiple mutation records) → **Mitigation**: debounce the observer callback within a single animation frame (`requestAnimationFrame`) before running the fit pass, so multiple mutations in the same tick collapse into one measurement/fit cycle.
- **[Risk]** Binary search convergence assumes font-size changes monotonically affect `scrollHeight`; deeply nested flex/grid content or images with intrinsic aspect ratios could behave non-monotonically in edge cases → **Mitigation**: cap iteration count regardless of convergence (defensive bound), accept the closest-fit result found within that budget.
- **[Risk]** This is real-browser-only behavior — `vitest`+`jsdom` cannot exercise it meaningfully (no real text layout, `scrollHeight` unreliable) → **Mitigation**: primary coverage lives in Playwright e2e (`tests/`), with unit tests limited to any pure-arithmetic helper (e.g. the binary-search step function) that can be tested with mocked height inputs.
- **[Trade-off]** Deferring per-region auto-fit means this implementation will very likely need rework once the layout-config roadmap item lands (multi-region slides). Accepted explicitly per proposal — shipping the single-box version now is preferred over blocking on a not-yet-designed layout-config feature.
- **[Trade-off]** Text wrapping is a step function of font size, not continuous — as font size increases, a line can wrap to two lines in one small increment, adding a full line's height at once. When the box height sits just below such a wrap boundary, the largest non-overflowing size found can leave a visually noticeable gap (confirmed: one fixture jumped from 285px tall at 19.5px font to 404px at 20px font, against a 400px box — no valid size in between). This is most dramatic with several similarly-long lines (e.g. near-identical bullet text) wrapping in near-unison. Explicitly kept as strict never-overflow behavior rather than allowing a small overflow tolerance or additionally shrinking line-height/spacing to compensate — both considered and declined to preserve the simple, predictable guarantee.

## Open Questions

- Should there be a way for an author to opt a specific slide out of auto-fit entirely (e.g. a frontmatter flag), for cases where a fixed size is desired regardless of overflow? Not raised during exploration; deferring unless it comes up in review.
