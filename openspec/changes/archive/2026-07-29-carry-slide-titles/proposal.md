## Why

Slides that belong to the same section (e.g. a run of exercise slides) currently require the author to retype the identical `# Title` / `## Subtitle` heading on every single slide, or the title box in `layouts/default.vue` renders empty. This is pure copy-paste boilerplate that clutters `slides.md` and is easy to forget or get out of sync (e.g. `slides.md:15,25,35,43,52` today repeat `# Casos de Test` / `# Dobles` verbatim across five separate slides). Titles and subtitles should carry forward from the most recent slide that set them, so an author only writes a heading when it actually changes.

## What Changes

- On slides using the `default` layout, a missing leading `# Title` is filled in from the nearest preceding slide (in the `default` layout) that set one; same independently for a missing leading `## Subtitle`.
- An empty heading (`#` or `##` with no text) explicitly clears that level's carried value going forward — the slide (and following ones) show nothing at that level until a new explicit heading appears.
- A single slide-frontmatter flag (e.g. `resetTitle: true`) clears **both** the title and subtitle carry chains at once, as an alternative to writing two empty headings.
- The carried title is also fed back into Slidev's own parsed `slide.title` (not just the rendered `<h1>`), so the presenter overview, table of contents, and browser tab reflect it consistently with what the audience sees.
- Carry-over is computed statelessly per slide from the already-parsed full slide list, not from mutable state accumulated across transformer calls — safe under Slidev's per-slide, on-demand HMR transform invocation.

## Capabilities

### New Capabilities
- `slide-title-carryover`: Determines, for each `default`-layout slide, the effective title (h1) and subtitle (h2) to render — either the slide's own explicit heading, an inherited value carried from an earlier slide, or nothing — including the empty-heading and frontmatter-flag reset mechanisms, and keeping Slidev's parsed `slide.title` in sync with the rendered result.

### Modified Capabilities
- (none — no existing capability governs slide titles/headings)

## Impact

- `setup/transformers.ts`: new `pre` transformer logic (alongside the existing snippet-import and code-highlight ones) to inject a carried heading line into a slide's content when its own leading heading is absent.
- A new `composables/useSlideTitleCarryover.ts` (or similar) housing the pure carry-chain resolution logic, parallel to `useSnippetImport.ts` / `useCodeHighlights.ts`.
- Slidev's `transformSlide` extension hook (a different registration surface than the markdown-it `pre`/`codeblocks` transformers) needs to be wired up so `slide.title` reflects the carried value for TOC/presenter/tab-title consistency.
- `layouts/default.vue` is unaffected — the existing `h1:first-child` / `h2` styling and editor overlay behavior continue to apply to whatever heading ends up in the rendered content, carried or explicit.
- `e2e/` symlinks: no new composable file exists yet under `e2e/composables/`, so a new symlink will be needed once the composable is created (per this repo's existing convention).
- Unit tests in `composables/__tests__/` for the new composable's carry-chain resolution; e2e coverage in `tests/` for the rendered/visual behavior across a small multi-slide deck.
