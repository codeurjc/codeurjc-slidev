## Context

`layouts/default.vue` positions its four elements two different ways:

- `red-bar`, `logo`, `title`: `position: absolute`, driven directly by `--ed-{el}-y`/`-x`/`-w`/`-h` CSS custom properties that the editor (`composables/useEditor.ts`) writes.
- `content`: normal document flow (`margin-top`/`margin-left` for position, `width`/`min-height` for size, plus its own `padding: 0 24px 24px`).

Slidev's shipped base stylesheet (`@slidev/client/styles/layouts-base.css`) applies `px-14 py-10` (56px horizontal / 40px vertical padding) to every `.slidev-layout`, including custom ones. Absolutely-positioned descendants are placed relative to the containing block's *padding-box edge* per the CSS spec, so they render unaffected by that inherited padding. `.content`, being a normal-flow box, is pushed inward by it. Combined with its own 24px margin and 24px padding, content text ends up ~104px from the slide edge while the title (pure `left: 24px`, absolute) starts at 24px — a mismatch with no intentional origin.

This mirrors the bug already fixed for title/logo vertical centering: the editor's `.content-overlay` (the drag-box shown in edit mode) is `position: absolute` with `left: var(--ed-content-x)`, so it draws where the CSS var says (`x=24`), not where the real `.content` box actually renders (`x≈104`). Dragging content in the editor doesn't correspond to where the text visually lands today.

**Constraint discovered during implementation**: `title`'s `<h1>` is not a sibling of `.content` — Slidev renders the slide's markdown (h1 + paragraphs) as a single `<slot />`, which our layout places *inside* `.content`. The h1 is pulled out visually via `position: absolute`, relying on it skipping past `.content` (which must stay `position: static`) to escape all the way to `root` (`.slidev-layout.default`, `position: relative`) — the same positioned ancestor that `logo`/`red-bar` use. Any `position` value other than `static` on `.content` would make `.content` itself the containing block for the h1, breaking the title's positioning (verified live: title rendered at `x≈48` instead of `24`, since it become 24px from `.content`'s edge rather than the slide's edge). So `.content` cannot switch to `position: absolute` — the fix has to remove the hidden inset while keeping `.content` in normal flow.

## Goals / Non-Goals

**Goals:**
- Make `.content`'s rendered left edge match `--ed-content-x` exactly, with no hidden inherited offset, without disturbing the title's containing-block chain to `root`.
- Make `.content-overlay` and the real `.content` box share identical position math (no more separate mental models for "where the overlay says" vs "where it renders").
- Default `--ed-content-x` to `0px` (the true slide edge) and default `--ed-content-w` so content's right edge reaches the logo's default left edge, with no internal margin/padding — the box itself defines the visible bounds.

**Note on scope drift**: this change started as "align content's left edge with the title's" (`--ed-content-x: 24px`, matching `--ed-title-x`). Per direct, twice-confirmed request, the final default instead flushes content to the true slide edge (`x=0`), which no longer matches the title's `x=24`. The change's name (`align-content-with-title`) reflects its origin, not its final default state — `--ed-content-x` remains fully editable via the editor if left-alignment with the title is wanted on a specific slide.

**Non-Goals:**
- ~~Not changing vertical (`y`) positioning behavior of content~~ REVISED: per direct report that content-overlay and real content didn't visually line up in the editor, the vertical mismatch (root's inherited `py-10` 40px top padding pushing real `.content` down while the absolute `.content-overlay` ignored it, same bug shape as the horizontal one) is now in scope too — see Decision 1.
- Not touching the 5 existing saved custom layouts (`layouts/layout-178281*.vue`); they keep independently-copied CSS, consistent with the earlier title/logo change.
- Not changing the resize/aspect-lock mechanics from `layout-editor-resize` — this change only touches the positioning model and defaults.

## Decisions

**1. Keep `.content` in normal flow (`position: static`); neutralize Slidev's inherited padding at the root instead, using `display: flow-root` to permanently rule out margin-collapse.**
Originally planned to switch `.content` to `position: absolute` to match `title`. Reverted after implementation showed `title`'s `<h1>` lives *inside* `.content` (via `<slot />`) and depends on `.content` staying unpositioned so it can escape to `root` as its containing block. Instead, override `padding: 0` on `.slidev-layout.default` itself (specificity `.slidev-layout.default` > Slidev's own `.slidev-layout` utility class, so it reliably wins) to remove all of Slidev's inherited `px-14 py-10` (56px/40px) padding — the actual source of the extra inset, on both axes. `.content`'s own `margin-left`/`margin-top` then become the true, sole offset — no hidden contribution from an ancestor, and `.content-overlay` (already using the same vars) now matches the real render exactly on both axes.

An initial attempt only zeroed `padding-left` (leaving `padding-top` at its inherited 40px), because zeroing the full shorthand first caused `.content`'s `margin-top` to **collapse through** root (padding is a margin-collapse barrier; horizontal margins never collapse, so only the vertical side was ever at risk) — content jumped to `y=0` and overlapped the title. That was fixed at the time by only touching the left side, at the cost of leaving the vertical mismatch between `.content` and `.content-overlay` unresolved (flagged as a Non-Goal). Once that mismatch was reported as a visible bug (content-overlay in the editor not lining up with where text actually starts), the real fix was to add `display: flow-root` to `.slidev-layout.default`, which establishes a new block-formatting context and blocks margin-collapse on its own — making it safe to zero the *entire* padding shorthand without needing padding itself to act as the collapse barrier. Absolutely-positioned siblings (`title` inside `.content`, `logo`, `red-bar`) are completely unaffected by any of this, since padding and `display` never affect absolutely-positioned descendants' offsets.

**2. Drop `.content`'s padding entirely.**
Originally kept top/right/bottom padding for text breathing room. Revised per direct request: `.content`'s box itself (position + width) now fully defines the visible text bounds — no internal padding.

**3. Default `--ed-content-x` to `0px` and `margin-left` stays the position mechanism (still fully editable).**
Originally defaulted to `24px` to match the title's left edge. Revised per direct, explicitly-confirmed request: content's default left edge is the true slide edge (`x=0`), independent of the title. `margin-left: var(--ed-content-x, 0px)` remains the mechanism — the CSS var still fully controls position and is still draggable/resizable via the editor exactly like every other element (confirmed explicitly over the alternative of hardcoding `margin-left: 0` and removing the var link, which would have broken the "every element is independently resizable" pattern from `layout-editor-resize`).

**4. Default `--ed-content-w` so content's right edge reaches the logo's default left edge.**
Originally a fixed `916px` sized to leave a flat margin against the slide's right edge, then `852px` when `x` defaulted to `24`. Revised per direct request: content should extend to the logo, not to the slide edge. Logo's default left edge = `980(slide width) - 24(--ed-logo-rx) - 80(--ed-logo-w) = 876`. With content's left edge now at `x=0` (decision 3), that gives `--ed-content-w: 876px` (`876 - 0`). This is still a fixed default, not a dynamic `calc()` tied to the logo's live position — consistent with every other element in this system (title, logo, red-bar all have independent fixed defaults, fully resizable afterward via the existing per-element resize mechanics in `layout-editor-resize`). If the logo is later moved via the editor, content's width won't auto-follow; that matches how every other element already behaves independently.

**5. `.content-overlay` needs no structural change, just needs the real `.content` box to finally match it.**
`.content-overlay` was already `position: absolute` with `top`/`left`/`width` driven by the same vars — it was `.content` that diverged from it (via the hidden root padding, on both axes once decision 1's full fix landed). `.content` and `.content-overlay` now compute the same top/left/width with no special-case math required.

## Risks / Trade-offs

- **[Risk]** Any positioned descendant nested inside `.content` in the future (not just the current `title` h1) would silently break if `.content` were ever changed back to a positioned value. → **Mitigation**: this is now a documented constraint (see Decisions §1); flag it in a code comment at the `.content` CSS rule.
- **[Risk]** Zeroing `.slidev-layout.default`'s padding removes Slidev's default top/right/bottom safe-area padding too, not just the left side that caused the bug. → **Mitigation**: verified no other normal-flow element depends on it (only `.content` is normal-flow; everything else is absolute and already ignores it), and `.content`'s own explicit padding/margin values fully replace what's needed.
- **[Risk]** Widening the default content box to reach the logo's left edge means content text could butt directly against the logo if a slide's body content extends up near the top (`y=80` is already below the default logo/title row, but a taller title or custom `y` could change that). → **Mitigation**: `--ed-content-y` still defaults below the logo row; this is a pre-existing consideration, unaffected by the width change, worth a visual check.
- **[Risk]** Removing all of `.content`'s padding means text can render flush against the box's own edges (right edge in particular, since it now sits at the logo's left edge with zero gap). → **Mitigation**: this was explicitly requested; the width itself already reserves space up to the logo, so the zero-padding box edge and the logo's edge coincide rather than the content visually touching the logo (unless dragged/resized to overlap).
- **[Risk]** Existing unit/e2e tests may assert the old `700px`/margin-based defaults. → **Mitigation**: tasks.md includes a review pass over `composables/__tests__/` and `tests/layout-editor.spec.ts` for hardcoded content position/size expectations.

## Migration Plan

This only changes default values and CSS mechanics in `layouts/default.vue` — no data migration. Existing saved layouts under `layouts/layout-*.vue` are untouched and unaffected (they carry their own copied CSS/positions). No rollback concerns beyond a normal revert of the diff.

## Open Questions

- None outstanding — width default (916px), left-inset removal, and overlay simplification were confirmed during exploration.
