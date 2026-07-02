## 1. Layout CSS (layouts/default.vue)

- [x] 1.1 ~~Change `.content` to `position: absolute`~~ REVISED: keep `.content` as `position: static` (normal flow) — `title`'s `<h1>` is nested inside `.content` via `<slot />` and depends on `.content` staying unpositioned to escape to `root` as its containing block. Instead, override `padding-left: 0` on `.slidev-layout.default` (left-only, not the full `padding` shorthand — see note below) to remove Slidev's inherited `px-14` left padding, which was the actual source of the extra inset
- [x] 1.2 Drop `.content`'s left padding (change `padding: 0 24px 24px` to `padding: 0 24px 24px 0`), so `--ed-content-x` (via `margin-left`) is the sole left-edge source of truth
- [x] 1.3 ~~Update `.content-overlay`~~ REVISED: no change needed — `.content-overlay` was already `position: absolute` with the correct `top`/`left`/`width` vars; it was `.content` that diverged from it via the hidden root padding. Removing that padding (1.1) is sufficient for the two to match
- [x] 1.4 Update the root element's `style`/`data-styles` default attribute values: `--ed-content-x` to `24px`, `--ed-content-w` to `916px`
- [x] 1.5 Add a code comment on `.content`'s CSS rule documenting the containing-block constraint (must stay `position: static` because `title` is nested inside it). Also caught during verification: an initial attempt zeroed the full `padding` shorthand on root, which let `.content`'s `margin-top` **collapse through** root (padding is a margin-collapse barrier; vertical margins only collapse when nothing — no padding/border — separates them), pushing content to `y=0` and overlapping the title. Fixed by scoping the override to `padding-left` only, since horizontal margins never collapse. Documented in both the CSS comment and design.md.

## 2. Editor defaults (composables/useEditor.ts)

- [x] 2.1 Update `ELEMENTS.content.initial` to `{ x: 24, y: 80, w: 916, h: 400 }`
- [x] 2.2 ~~Emit `position: absolute; top; left`~~ REVISED: `ELEMENTS.content.cssOutput` keeps emitting `margin-top`/`margin-left` (normal flow), matching the corrected CSS shape
- [x] 2.3 Double check `rootStyle` computed's content fallback values (`--ed-content-x` default `24px`, `--ed-content-w` default `916px`) match the new layout defaults

## 3. Save/restore middleware sanity check

- [x] 3.1 Verify `vite.config.ts` and `e2e/vite.config.ts` `/api/save-layout` middleware and `VAR_MAP` still work unchanged (positioning shape is still x/y/w/h; only the CSS consuming those vars changes) — confirmed, `VAR_MAP.content` unchanged, no code edit needed

## 4. Visual verification

- [x] 4.1 Started the dev server, rendered the default layout via Playwright: `content`'s left edge (24.49px scaled) now matches `title`'s left edge (24.49px scaled) exactly — no more ~104px vs 24px mismatch
- [x] 4.2 Confirmed a modest right margin remains: content right edge at 959.18px against a 1000px-wide (scaled) slide — roughly the intended ~40px gap
- [x] 4.3 Opened the layout editor (Show editor → Layout tab): `content-overlay`'s left edge matches the real `.content` left edge exactly (14.69px in both, at that viewport). Vertical (`y`) offset between overlay and real content still differs — pre-existing, out of scope per design.md Non-Goals (only horizontal was in scope)
- [x] 4.4 Confirmed content still uses `min-height` for flow growth (unchanged, still normal-flow) and title renders at the correct `x=24` (not offset by `.content`'s position) — verified both after the padding-left-only fix

## 5. Tests

- [x] 5.1 Reviewed `composables/__tests__/useEditor.spec.ts` — no hardcoded content position/size expectations found, nothing to update
- [x] 5.2 Reviewed `tests/layout-editor.spec.ts` — no hardcoded content position/size expectations found, nothing to update
- [x] 5.3 Ran `pnpm test && pnpm test:e2e` — 29/29 unit tests and 18/18 e2e tests pass

## 6. Extend content width to the logo and remove padding (follow-up refinement)

- [x] 6.1 Change `.content`'s `padding` from `0 24px 24px 0` to `0` (remove entirely)
- [x] 6.2 Update default `--ed-content-w` from `916px` to `852px` (`980 - 24(logo rx) - 80(logo w) - 24(content x) = 852`, reaching the logo's default left edge) in the root `style`/`data-styles` attributes and `.content`/`.content-overlay` CSS fallbacks
- [x] 6.3 Update `ELEMENTS.content.initial.w` in `composables/useEditor.ts` to `852`
- [x] 6.4 Update `rootStyle` computed's `--ed-content-w` fallback to `852px`
- [x] 6.5 Visually verify: content's right edge meets the logo's left edge with no gap or overlap (verified via Playwright: `contentRight = 893.877..., logoLeft = 893.877...`, gap ≈ 0), and no padding narrows the text area (`getComputedStyle(content).padding === '0px'`)
- [x] 6.6 Ran `pnpm test && pnpm test:e2e` again — 29/29 unit tests and 18/18 e2e tests still pass

## 7. Flush content to the true slide edge, drop margin-driven left offset default (follow-up refinement)

- [x] 7.1 Update default `--ed-content-x` from `24px` to `0px` in the root `style`/`data-styles` attributes (content no longer defaults flush with the title — confirmed explicitly; `--ed-content-x` stays fully editable via the editor)
- [x] 7.2 Update default `--ed-content-w` from `852px` to `876px` (`980 - 24(logo rx) - 80(logo w) - 0(content x) = 876`, still reaching the logo's default left edge with the new `x=0`) in the root `style`/`data-styles` attributes and `.content`/`.content-overlay` CSS fallbacks
- [x] 7.3 Update `ELEMENTS.content.initial` in `composables/useEditor.ts` to `{ x: 0, y: 80, w: 876, h: 400 }`
- [x] 7.4 Update `rootStyle` computed's `--ed-content-x` fallback to `0px` and `--ed-content-w` fallback to `876px`
- [x] 7.5 Visually verify: content flush at the true slide left edge (x=0, confirmed via Playwright `contentLeft: 0`), right edge still meeting the logo's left edge (`contentRight === logoLeft`, gap 0), title unaffected (`h1Left: 24.49px` scaled, i.e. `24px`)
- [x] 7.6 Ran `pnpm test && pnpm test:e2e` again — 29/29 unit tests and 18/18 e2e tests still pass

## 8. Fix content-overlay/real-content vertical mismatch in the editor (follow-up refinement)

- [x] 8.1 Diagnosed via Playwright: reported "text isn't top-left in the content box" traced to root's still-present `padding-top: 40px` (only `padding-left` had been zeroed in task 1.1) pushing real `.content` down while the absolute `.content-overlay` ignored it — measured `verticalGap: 34.3px` (scaled from 40px) between overlay top and real content top
- [x] 8.2 Changed `.slidev-layout.default`'s override from `padding-left: 0` to the full `padding: 0`, adding `display: flow-root` to establish a block-formatting context so `.content`'s `margin-top` can't collapse through root (the exact regression that forced the left-only workaround in task 1.5) — this was the deferred, complete version of the original task 1.1 fix
- [x] 8.3 Updated the CSS comment on `.slidev-layout.default` to explain the full padding removal and why `flow-root` makes it safe
- [x] 8.4 Visually verified via Playwright: `overlayTop === contentTop` and `overlayLeft === contentLeft` (both gaps `0`), confirmed no margin-collapse regression (content did not jump to `y=0`), screenshot confirms text now starts flush at the top-left corner of the green content-overlay box in the editor
- [x] 8.5 Ran `pnpm test && pnpm test:e2e` again — 29/29 unit tests and 18/18 e2e tests still pass

## 9. Diagnose "still not working" report on the root project (follow-up)

- [x] 9.1 Reported symptom: "something is overwriting the .content class expressed in default.vue" when checking the fix on the root project (not e2e). Diagnosed by listing all live `.content` CSSOM rules on the running page: only one rule was present, and it matched the *old* margin/padding/width values — not a cascade conflict, but the wrong file entirely
- [x] 9.2 Root cause: root `slides.md`'s only slide has `layout: layout-1782934353578` in its frontmatter — an independently-saved layout file explicitly left out of scope for this whole change. `layouts/default.vue` (where every fix in this change lives) was never loaded for that slide, so nothing could have shown up. `e2e/slides.md` (used for all prior visual verification) has `layout: default` and only symlinks `layouts/default.vue` — the other 5 saved layout files don't even exist in that isolated directory, which is why this went undetected until checked against the root project directly
- [x] 9.3 Presented options (switch this slide to `layout: default`, port fixes into `layout-1782934353578.vue`, or port into all 5 saved layouts) — user chose switching the slide's frontmatter
- [x] 9.4 Changed `slides.md` frontmatter from `layout: layout-1782934353578` to `layout: default`
- [x] 9.5 Verified against the root project directly via Playwright: `contentLeft: 0`, `contentRight === logoLeft`, `contentPadding: '0px'`, `contentMargin: '80px 0px 0px'` — matches everything verified against `e2e/slides.md`. Screenshot confirms visually.
- [x] 9.6 Ran `pnpm test` again (unaffected, doesn't touch `slides.md`); `e2e/slides.md` wasn't touched so the e2e suite doesn't need a re-run for this specific change

## 10. Commit

- [ ] 10.1 `git add -A && git commit` with a message describing the content/title alignment work and final content positioning defaults
