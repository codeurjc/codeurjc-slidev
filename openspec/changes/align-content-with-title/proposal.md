## Why

The default layout's `.content` block is positioned with `margin-top`/`margin-left` (normal document flow), while `title`/`logo`/`red-bar` are `position: absolute`. Slidev's built-in `.slidev-layout` base CSS applies `px-14 py-10` (56px/40px) padding to every slide; absolutely-positioned elements skip past that padding, but `.content` (normal flow) inherits it on top of its own margin and padding. The result is that content text starts ~104px from the slide edge while the title starts at 24px — a left-indent that has no intentional design behind it, it's an artifact of mixing positioning models. It also means the editor's `.content-overlay` drag box (which is `position: absolute`) doesn't match where the real content actually renders, the same overlay/render mismatch pattern already fixed for the title/logo centering.

## What Changes

- `.content` stays `position: static` (normal flow) — the title `<h1>` is nested inside `.content` via `<slot />` and depends on `.content` staying unpositioned so it can escape to `root` as its containing block; switching to `position: absolute` was tried and reverted (see design.md). Instead, `.slidev-layout.default`'s inherited `padding-left` (from Slidev's base theme) is overridden to `0`, removing the hidden left inset that was the actual bug — `.content`'s own `margin-left`/`margin-top` remain the position mechanism, still driven by `--ed-content-x`/`-y` and still fully editable via the layout editor.
- `.content`'s padding is dropped entirely (was `0 24px 24px`, now `0`) — the box's own position and width fully define the visible text bounds.
- Default `--ed-content-x` is `0px` (the true slide edge) — per explicit, twice-confirmed request, this is no longer flush with the title's `x=24px`; the change's name reflects its starting motivation, not its final default (content's `x` remains fully editable per-slide if title-alignment is wanted).
- Default `--ed-content-w` is `876px` so content's right edge reaches the logo's default left edge (`980 - 24(logo rx) - 80(logo w) - 0(content x) = 876`) instead of the old fixed `700px`, which was sized against the removed left-inset artifact.
- `.content-overlay` (the edit-mode drag box) needed no structural change — it was already `position: absolute` with `top`/`left`/`width` driven by the same vars; it was `.content` that diverged from it via the hidden root padding, now fixed.

## Capabilities

### New Capabilities
- `content-layout-alignment`: Governs how the default layout's `content` element is positioned and sized relative to `title`, `logo`, and the slide bounds, and how the editor's content overlay stays in sync with the real render.

### Modified Capabilities
(none — `layout-editor-resize` covers resize/aspect-lock mechanics, not positioning model or defaults, and is unaffected by this change)

## Impact

- `layouts/default.vue`: `.content` CSS (position model, padding), `.content-overlay` CSS, `.slidev-layout.default` root padding/formatting-context override, default `--ed-content-x`/`--ed-content-w` values in the root `style`/`data-styles` attributes.
- `composables/useEditor.ts`: `ELEMENTS.content.initial` (x/w defaults), `content.cssOutput`.
- `vite.config.ts` and `e2e/vite.config.ts`: no `VAR_MAP` shape change expected (still x/y/w/h for content), but worth double-checking the save middleware doesn't assume `.content`'s current padding/margin CSS shape anywhere.
- Existing saved custom layouts (`layouts/layout-178281*.vue`) are out of scope, consistent with the earlier title/logo alignment change — they keep their own independently-copied CSS and positions, and this change does not port the fix into them.
- `slides.md` (root project): its only slide referenced `layout: layout-1782934353578`, one of the out-of-scope saved layouts above — none of this change's fixes were visible until its frontmatter was switched to `layout: default`. This isn't a code bug; it's a reminder that fixes to `default.vue` only apply to slides that actually reference it, and any slide pinned to a saved layout stays on that layout's frozen CSS.
- Unit tests (`composables/__tests__/`) and e2e tests (`tests/layout-editor.spec.ts`) that assert on content position/size behavior need review for the new defaults.
