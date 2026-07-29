## Context

Slide titles/subtitles today are not a distinct data field — they're literally the first `# ...` / `## ...` markdown lines of a slide's content. `layouts/default.vue` picks the first `<h1>` out of normal document flow via `.slidev-layout.default h1:first-child { position: absolute; ... }` and places it into the draggable title box; `h2` renders in-flow, styled but not repositioned. There is currently no notion of "this slide's title" independent of "did the author type a `# heading` on this slide."

Two existing `pre`/`codeblocks` markdown transformers already live in `setup/transformers.ts` (snippet import, code-highlight anchors) and follow the same shape: a pure resolution function in a `composables/use*.ts` file, wired into a Vite/markdown-it transform stage that runs per slide, per render. Slidev's transform pipeline (`@slidev/cli`'s `createMarkdownPlugin`) invokes the `pre` transformer once per slide **on demand** (Vite's `transforms.before`, keyed by a virtual module id matching a slide index) — not necessarily in slide order, and not guaranteed to re-run for every slide on every edit (HMR may re-transform only the edited slide's module). Critically, each invocation's `ctx` carries `ctx.options.data.slides`, the **entire already-parsed slide array** (raw content, per-slide frontmatter, per-slide `title`), populated once per full-file parse by `@slidev/parser` — independent of which slide's transform is currently running.

Separately, `@slidev/parser`'s `parseSlide()` computes a `title` field per slide (frontmatter `title`/`name`, else the first heading of *any* level anywhere in the content, via `/^(#+) (.*)$/m`) before any extension hook runs. This is what feeds Slidev's presenter overview, table of contents, and browser tab. There's also a `transformSlide` extension hook (registered differently from the markdown-it transformers — via a `setup/*.ts` addon's `extensions` array passed into `parse()`) that runs after parsing and can rewrite `slide.content`, and if it also assigns `slide.title`/`frontmatter.title`, that's honored.

## Goals / Non-Goals

**Goals:**
- A `default`-layout slide with no leading `# Title` inherits the title from the nearest earlier `default`-layout slide that set one; same independently for `## Subtitle`.
- An empty `#` (or `##`) resets that level's carry chain from that slide forward, until a new explicit heading of that level appears.
- A single slide-frontmatter flag resets both chains at once, as an alternative to writing two empty headings.
- Carried titles are reflected in Slidev's own `slide.title` (TOC / presenter overview / browser tab), not just the rendered `<h1>`.
- Resolution is stateless per invocation — computed by scanning `ctx.options.data.slides`, never accumulated in a module-level/closure variable across transformer calls — so it's correct regardless of invocation order or partial HMR re-runs.

**Non-Goals:**
- Heading levels beyond h1/h2 (h3+) are out of scope for this change.
- Non-`default` layouts (`cover`, `section`, etc.) are unaffected; a slide using any other layout neither contributes to nor receives a carried heading.
- No change to the visual title/subtitle styling, positioning, or the editor's drag/hide overlay behavior — those already operate on whatever `<h1>`/`<h2>` ends up in rendered content, carried or explicit.
- No UI for authoring the frontmatter reset flag (e.g. no editor button) — it's a `slides.md` frontmatter key only, in this change.

## Decisions

**Decision: Resolve carry-over by scanning `data.slides`, not by mutating shared closure state.**
Alternative considered: accumulate "current title"/"current subtitle" in a `let` inside the `defineTransformersSetup(() => ...)` closure, updated as each slide's `pre` transformer runs. Rejected — Slidev's dev-server transform is invoked lazily per virtual slide module; there's no guarantee slide 3's transform runs before slide 5's on a given HMR pass, and a closure would go stale or produce order-dependent results. Scanning `ctx.options.data.slides[0..currentIndex-1]` on every invocation is more work per call but is correct independent of call order, and the array is already fully parsed and available for free.

**Decision: Detect "own heading" as the leading run of `#`/`##` lines only, not `slide.title`'s looser first-heading-anywhere match.**
The parser's built-in `title` field matches the first heading of *any* level, *anywhere* in the slide body — e.g. a `## Aside` buried mid-slide would satisfy it. That's wrong for carry-over purposes, which must mirror the `h1:first-child` CSS convention (literally the first line). The new logic instead inspects only the leading lines of a slide's trimmed content: an optional `# ...` line, immediately followed by an optional `## ...` line. Title and subtitle are each independently "own" (explicit), "carried," or "absent" based on this leading block — a slide can carry its title while setting its own subtitle (or vice versa), matching `slides.md`'s existing `# Dobles` / `## Ejercicio 8: ...` pattern where only the subtitle changes across slides.

**Decision: Empty heading and frontmatter flag both reset going forward; the flag resets both levels, empty headings reset one level each.**
This gives two reset granularities without introducing two different *kinds* of reset semantics (avoids a "does this suppress locally or propagate?" special case per mechanism): everything that resets, resets forward, until the next explicit heading of that level. `#`/`##` (empty) are the per-level, in-content spelling; a single frontmatter flag (e.g. `resetTitle: true`) is the combined, no-typing-a-blank-heading spelling for starting a new section.

**Decision: Feed the result back into `slide.title` via a `transformSlide` extension, separate from the markdown-it `pre` transformer.**
The markdown-it `pre`/`codeblocks` transformers (`ctx.s`, a `MagicString` over one slide's rendered body) only affect the rendered HTML — they run too late, and on the wrong data shape, to influence `@slidev/parser`'s already-computed `slide.title` used by Slidev's own overview/TOC/tab-title UI. A `transformSlide` extension hook runs as part of the parse step itself and can assign `slide.title` directly. Both hooks end up calling the same pure carry-resolution function from the new composable to avoid duplicating the leading-heading-detection/reset logic.

**Decision: New pure-logic composable, `composables/useSlideTitleCarryover.ts`.**
Mirrors `useSnippetImport.ts`/`useCodeHighlights.ts`: no Vue reactivity, plain functions over slide data, unit-testable in isolation, imported by both `setup/transformers.ts` (visual injection) and wherever the `transformSlide` extension is registered (parser-level `slide.title` sync). Needs a symlink under `e2e/composables/` per this repo's existing convention.

## Risks / Trade-offs

- **[Risk] Scanning all preceding slides on every transform call is O(n) per slide, O(n²) per full deck.** → Decks here are small (tens of slides); not a real performance concern, and it avoids the correctness problems of stateful accumulation.
- **[Risk] Mixing `default` and non-`default` layouts mid-deck creates a "does the chain skip over non-default slides or break at them?" ambiguity.** → Resolve explicitly in this change: the chain only considers `default`-layout slides, skipping over (not breaking at) any other layout in between — a `cover` or `section` slide sandwiched in the middle doesn't interrupt title carry-over for the `default` slides around it. Flagged as an explicit scenario in the spec so behavior is locked down rather than accidental.
- **[Risk] Two separate hook systems (markdown-it `pre` transformer vs. parser `transformSlide` extension) computing carry-over from the same composable could drift if only one is updated.** → Both call the same exported resolution function; unit tests on the composable cover the shared logic once, and an e2e test asserts the two stay consistent (rendered `<h1>` text matches the deck's table-of-contents entry for a carried-title slide).
- **[Trade-off] The frontmatter reset flag's exact key name (`resetTitle` vs. alternatives) is a naming choice, not a design fork.** → Pick one during implementation (tasks.md); no behavior ambiguity remains.

## Open Questions

- None blocking — remaining detail is the frontmatter flag's key name, deferred to implementation.

## Implementation Note (post-implementation)

The "two hooks" plan above (a markdown-it `pre` transformer for the rendered `<h1>`/`<h2>`, plus a separate `transformSlide` preparser extension for `slide.title`) turned out to be one hook too many. Tracing `@slidev/cli`'s Vite plugin (`load(id)` for the `__slidev_N.md` virtual module) shows it serves `slide.content` directly — the very same object a `transformSlide` preparser extension (`setup/preparser.ts`) mutates during parsing, before Vite's markdown-it pipeline ever runs. Injecting the carried heading there is therefore sufficient for both the visual render *and* `slide.title` (via mutating the `frontmatter` object passed into `transformSlide`, which the parser re-reads as `slide.title` immediately after). `setup/transformers.ts` needed no changes at all. This also resolves the "two hooks could drift" risk noted above by removing the second hook rather than keeping them in sync.

One consequence: the frontmatter reset-flag key landed on `resetTitle` (matching the proposal's example), exported as `RESET_HEADINGS_FRONTMATTER_KEY` from `composables/useSlideTitleCarryover.ts`.

A second, unrelated infrastructure bug surfaced while adding e2e coverage: `@slidev/cli`'s own `handleHotUpdate` never calls `moduleGraph.invalidateModule` for a slide's virtual module unless a live HMR-connected client is already subscribed to push an update to -- so a slide route visited earlier in a long-lived dev server session, then not revisited during a later edit, can keep serving a stale server-side-cached transform to the next brand-new page indefinitely. This affects any suite reusing low slide numbers across many sequential `slides.md` rewrites (confirmed independent of this feature: an unrelated existing test, `layout-editor.spec.ts`, flaked the same way in the same full e2e run). Fixed with a small `slidev-force-invalidate-slide-modules` Vite plugin (in both `vite.config.ts` and `e2e/vite.config.ts`) that force-invalidates every slide virtual module on every `slides.md` edit, rather than relying on Slidev's own selective invalidation.
