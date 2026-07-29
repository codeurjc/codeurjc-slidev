## 1. Core carry-over logic

- [x] 1.1 Create `composables/useSlideTitleCarryover.ts`: parse a slide's trimmed content to detect its leading heading block (optional `# ...` line, optional `## ...` line immediately after), distinguishing "own text," "empty (reset)," and "absent."
- [x] 1.2 Implement the resolver: given the full ordered slide list (content + frontmatter + layout per slide) and a target index, compute the effective title and subtitle via a forward sweep over `default`-layout slides only (skipping other layouts), applying each level's own/empty/reset state independently. (Implemented as a forward sweep rather than a literal backward scan -- equivalent result, simpler to reason about the reset-flag interaction; see design.md note added in task 5.2.)
- [x] 1.3 Implement the frontmatter reset-flag check (key name: `resetTitle: true`, exported as `RESET_HEADINGS_FRONTMATTER_KEY`) as an alternate way to mark a slide's own leading block as "reset" for both levels at once.
- [x] 1.4 Unit tests in `composables/__tests__/useSlideTitleCarryover.spec.ts` covering: simple carry across N slides, new explicit title starting a new chain, independent title/subtitle carry combinations, empty-heading reset (title only, subtitle only, both), frontmatter flag reset, frontmatter flag combined with the same slide setting its own heading, non-default-layout slides being skipped (not breaking the chain), no-earlier-title case, and order-independence (resolving slide 5 without slide 3 having been "processed" first).

## 2. Wiring into the rendered slide and slide.title (single hook)

Implementation note (supersedes the original 2-hook plan in design.md): investigating Slidev's virtual-module loader (`@slidev/cli`'s `serve-*.mjs`, the `load(id)` handler for `__slidev_N.md`) showed it serves `slide.content` directly -- the same object a `transformSlide` preparser extension mutates. So mutating `slide.content` in the preparser hook alone is sufficient to change what's actually rendered; a second, separate injection point in `setup/transformers.ts`'s `pre` transformer would only duplicate it (and reintroduce the "two hooks could drift" risk design.md called out, rather than avoid it). Sections 2 and 3 are therefore merged into one hook.

- [x] 2.1 Create `setup/preparser.ts` registering a `transformSlide` preparser extension (`definePreparserSetup`) that: skips non-`default`-layout slides; advances a running per-level carry state (`composables/useSlideTitleCarryover.ts`'s `advanceCarryState`) slide-by-slide as `@slidev/parser`'s `parse()` visits them in document order within a single full-file parse; injects any carried heading via `injectCarriedHeadings`; and mutates the passed-in `frontmatter` object's `title` so Slidev's own `slide.title` (post-extension) picks it up.
- [x] 2.2 Confirmed injected headings are no-ops for non-`default`-layout slides (early return before any state read/mutation), and that a slide's own heading (or an explicit empty heading) is left verbatim by `injectCarriedHeadings`.
- [x] 2.3 No interaction with `setup/transformers.ts`'s `pre` transformer to reconcile -- the preparser hook runs earlier (during parsing, before Vite's markdown-it pipeline sees the slide at all), so `ctx.s`/`MagicString` offsets there are computed against the already-carried-over content, transparently.

## 3. ~~Wiring into Slidev's parsed slide.title~~ (folded into section 2)

- [x] 3.1 (merged into 2.1)
- [x] 3.2 (merged into 2.1)
- [x] 3.3 Single hook, single call site -- no second implementation to drift out of sync with.

## 4. End-to-end coverage

- [x] 4.1 Added a 9-slide fixture in `tests/slide-title-carryover.spec.ts` (swapped into `e2e/slides.md` for the run, like `tests/code-snippet-import.spec.ts`) exercising: carried title across consecutive slides, independent subtitle change, an intervening `layout: cover` slide not breaking the chain, empty-heading title reset with subtitle still carried, and the `resetTitle` frontmatter flag combined with the same slide setting its own new heading.
- [x] 4.2 Playwright assertions on `.slidev-page-N h1`/`h2` text/count across all 9 fixture slides.
- [x] 4.3 Playwright assertion against the `/overview` page's per-slide title tooltip (`route.meta?.slide?.title`, rendered in `nav .relative` blocks) confirming carried titles show there too, not blank.

## 5. Housekeeping

- [x] 5.1 Symlinked `e2e/composables/useSlideTitleCarryover.ts` and `e2e/setup/preparser.ts` per this repo's existing convention (no `e2e/vite.config.ts` change needed for the symlinks themselves -- `setup/preparser.ts` is picked up by filename convention, not registered in `vite.config.ts`).
- [x] 5.2 Documented the carry-over grammar (leading heading rules, reset triggers, layout scoping) in `AGENTS.md` (the file `CLAUDE.md` symlinks to) in a new "Slide title carry-over" section alongside "Code snippet import".
- [x] 5.3 Ran `pnpm test && pnpm test:e2e` and fixed regressions found along the way:
  - Unit tests: 189/189 pass, no regressions.
  - The new e2e suite passed reliably in isolation but was flaky as part of the full `pnpm test:e2e` run (5 tests failing, plus an unrelated pre-existing flake in `layout-editor.spec.ts`). Root-caused to a real bug in `@slidev/cli`'s own `handleHotUpdate`: it never calls `moduleGraph.invalidateModule` for a slide's virtual module unless that module already has a live HMR-connected client to push an update to, so a slide route visited by an earlier suite (e.g. a shared low slide number like `/2`) and then not revisited during a later edit can keep serving a stale server-side-cached transform to the next brand-new page indefinitely -- confirmed via manual repro against a scratch server, independent of this feature. Fixed with a new `slidev-force-invalidate-slide-modules` Vite plugin in both `vite.config.ts` and `e2e/vite.config.ts` that force-invalidates every `__slidev_<n>.md`/`.frontmatter` module in the module graph on every `slides.md` edit. Verified: the previously-flaky full e2e run now passes 53/53 twice in a row, including the previously-flaky unrelated `layout-editor.spec.ts` test.
