## Context

`code/` holds real, runnable exercise projects (Maven `pom.xml`, `src/main`, `src/test`) that students clone/open directly. Today, showing a fragment of one on a slide means hand-copying it into a fenced code block in `slides.md`; the copy drifts silently when the exercise changes. Slidev ships a `<<< @/path` snippet import (reads the file at render time, registers it for HMR via `watchFiles`, and expands to a normal markdown-it `fence` token before the project's own `codeblocks` transformer runs) — but it only slices content via in-file `#region`/`#endregion` markers, or shows the whole file if no region is given. Since example files must stay completely clean (no teaching markup of any kind, including regions), this project needs its own line-selection mechanism, layered in front of (not modifying) Slidev's native import handling.

The gap is the project's own highlight/callout feature (`code-highlight-marking`, `code-highlight-callouts`). It works by scanning the fenced block's text for trailing `// [!mark...]` comments and stripping them before render. That model assumes the marker and the code live in the same place and can be edited together. For file-sourced snippets that assumption breaks on purpose: exercise files must stay free of any teaching markup (`#region`, `[!mark]`, or otherwise) since students see them unmodified. So the marker has to move entirely into `slides.md` and reference the external code by *content* rather than by co-located comment.

## Goals / Non-Goals

**Goals:**
- Let a presenter reference code living under a single configurable root directory (default `code/`) via a `<<<` import, with a dev-time guard against importing from outside that root.
- Let a presenter select just a fragment of a file — by absolute line range or by a content-anchor range — without any markup in the source file, since Slidev's native region mechanism requires in-file markers that are off the table here.
- Let a presenter attach highlights/callouts to a file-sourced snippet using markers written only in `slides.md`, without modifying the source file in any way.
- Make anchor resolution failure (stale reference, ambiguous match) a visible, non-fatal degradation: skip the callout and warn in the console, never highlight the wrong fragment.
- Keep today's inline-typed-code-block marker grammar (`// [!mark]` trailing comments) completely unchanged.
- Keep the existing drag-to-reposition persistence model (patch `slides.md` in place) working for the new marker form.

**Non-Goals:**
- No alias/shorthand import prefix (e.g. `@code/`) — imports use Slidev's existing `@/` (project-root-relative) or relative paths; the code-root config only drives validation, not path resolution.
- No attempt to auto-migrate the marker's anchor when the underlying file changes (e.g. fuzzy-matching a shifted line) beyond the first-occurrence/occurrence-selector rules below — if the anchor text is gone, the callout is simply dropped.
- No change to `useHighlightLayout.ts` placement/routing geometry — it already operates on abstract highlight bounding boxes regardless of origin.

## Decisions

### 0. A `pre` markdown-transformer intercepts `<<<` imports before Slidev's native rule sees them
Slidev's `TransformersSetup` exposes a `pre` array of `MarkdownTransformer`s that each receive the *raw slide markdown* as an editable `MagicString`, running before markdown-it tokenizes the slide (and therefore before Slidev's own `snippet_import` block rule, which is a markdown-it block rule registered `before('fence', ...)`). A new `pre` transformer:
1. Scans the slide's raw text for `<<< @/path/to/file[selector] lang` lines (own syntax — a bracketed selector after the path, distinct from Shiki's post-language `{...}` click-highlight meta).
2. Resolves `selector` — absent (whole file), `[N-M]` (absolute line range), or `["a".."b"]` (content-anchor range, resolved against the *whole file's* text since no slice exists yet at this point) — reads the file, slices it accordingly.
3. Rewrites that line in the `MagicString` into a literal fenced code block containing the sliced text, so by the time markdown-it parses the (now-rewritten) source, there is no `<<<` line left for Slidev's native rule to match — no double-processing, no ordering conflict.
4. Registers the file with the same `watchFiles`/HMR mechanism Slidev's own `<<<` uses (available via the shared `options.data.watchFiles`), so editing the source file still hot-reloads the slide.
5. Consumes any immediately-following anchor-declaration lines (see Decision 2), strips them from the visible markdown, and records them (keyed by slide index + occurrence order) for the `codeblocks` transformer to pick up when it processes the fence this step just produced.

**Why:** this is the only available hook that runs early enough to rewrite `<<<` lines before Slidev's own handling claims them, and it's the same hook the anchor-declaration lines need anyway (bare `[!mark:...]` lines would otherwise render as visible paragraph text) — one transformer serves both jobs.

**Alternative considered:** fork/monkey-patch Slidev's own `snippet_import` markdown-it rule to add slicing support. Rejected — reaching into a dependency's internal markdown-it rule registration is fragile across Slidev upgrades; a `pre` transformer is a stable, documented extension point that fully replaces the need to touch Slidev's rule at all.

### 1. Two parser front-ends feeding one highlight model
`parseCodeHighlights` (existing) keeps scanning inline fence text for trailing-comment markers. A new function (e.g. `parseExternalHighlightAnchors(snippetText, anchorDeclarations)`) takes the already-resolved, already-sliced snippet text (post-`<<<`, post-`{lines}`) plus the anchor declarations parsed out of the markdown immediately following the `<<<` line, and resolves each into the same `CodeHighlight` shape (`kind`, `startLine`, `endLine`, `substringRange`, `comment`, `override`). Both feed `injectHighlightSpans`/the callout renderer unchanged — this is why `code-highlight-callouts` only needs a MODIFIED requirement (broaden "which highlights it draws from"), not a rewrite.

**Why:** keeps the render/placement pipeline (already well-tested) untouched, isolates all new complexity (content search, occurrence selection, degradation) in one new pure function that mirrors the existing one's testing style (`composables/__tests__/`, no DOM dependency).

**Alternative considered:** unify into a single parser that detects snippet-import fences and switches modes internally. Rejected — the two grammars have fundamentally different inputs (scan-in-place vs. search-by-content-across-declarations-outside-the-block), and forcing one function to do both would make the "inline markers are unchanged" guarantee harder to verify by inspection.

### 2. Anchor declarations are parsed from a markdown block, not new fence syntax
The `[!mark:...]` anchor lines that follow a `<<<` import are plain lines in the markdown source (not inside a fence), matched by a small markdown-it rule or a post-processing scan of the raw slide source keyed to the immediately preceding `<<<` line's slide index. Each declaration line is independent (no start/end pairing across lines the way inline range markers pair `:start`/`:end`, since ranges here are self-contained in one declaration: `[!mark:"a".."b"]`).

**Why:** avoids inventing a new fence dialect; keeps each anchor as one self-contained, greppable line, consistent with how presenters already read the file (one line per highlight).

### 3. Content-anchor matching semantics
- Matching is plain substring search (no regex) over the *sliced* snippet text (the output of Decision 0's slicing step), line-by-line for line-anchors, whole-snippet for content-anchors — scoped to what the `[selector]` actually rendered, not the full file. This means an anchor is naturally invalidated if the relevant code was sliced out of view, which is desired (don't highlight something not shown).
- Occurrence selection: no `#N` suffix → use first match, `console.warn` if match count > 1; `#N` → use the Nth match (1-based), error at build/dev time if `N` exceeds match count (unlike the "no selector" case, an explicit wrong index is a presenter mistake worth failing loud on, not a drift scenario); `#*` → produce one highlight per match (each gets its own callout if the declaration has comment text, all sharing the same comment).
- Range forms (`"a".."b"`, `"a"+N`, `N..M`) resolve each side independently then validate `start <= end`; if a `.."b"` anchor isn't found, the whole range highlight is dropped (both sides needed) with a console warning naming which side failed.

**Why:** matches the "degrade visibly, never silently mis-highlight" requirement from the proposal while keeping the mental model simple (substring search, not a query language).

**Alternative considered:** regex anchors for power-users. Rejected for v1 — substring search covers the observed use case (highlighting a specific statement/expression) and avoids presenters writing fragile/escaping-heavy regexes against code they don't want to think about as regex input.

### 4. Code-root validation is a dev-time warning in the Vite plugin, not a hard build failure
The `vite.config.ts` plugin (already doing custom transform work) reads a single config constant (e.g. `CODE_ROOT = 'code'`) and, when it observes a `<<<` import resolve outside `<CODE_ROOT>/`, logs a console warning identifying the offending slide and path. It does not block the dev server or the build.

**Why:** consistent with the project's existing tolerance for warn-don't-fail on authoring mistakes (mirrors the anchor-degradation philosophy); a hard failure would be disproportionate for what's fundamentally a convention, and Slidev's own snippet-import already throws if the file doesn't exist at all, so outright-missing-file cases are already covered.

### 5. Drag-to-reposition extends the existing text-patch approach
`/api/save-code-highlight-position` already works by finding a highlight's exact `sourceLine` string inside `slides.md` and rewriting it with `@x,y` appended. For anchor-line markers, the "source line" is simply the anchor declaration line itself (e.g. `[!mark:"this.alumnos = alumnos"] Injects the DB dependency`) — the same find-and-patch logic applies unchanged; only `serializeMarkerOverride` needs to handle appending `@x,y` before the anchor's closing `]` for this new line shape (today it assumes the trailing-comment-on-code-line shape). No new endpoint, no new persistence model.

**Why:** reuses proven code; the two marker grammars differ in the parser but converge on "a single line in `slides.md` that can be found and rewritten," so the save endpoint's core assumption still holds.

## Risks / Trade-offs

- **[Risk]** A file-sourced snippet's `{lines}` slice changes (dev widens/narrows the range) and an anchor that used to be in-scope silently drops out → its callout disappears with only a console warning, easy to miss during a live edit session. **Mitigation:** the console warning is the agreed degradation contract from the proposal; consider (future, not this change) surfacing it as an on-slide dev-mode indicator if it proves too easy to miss in practice.
- **[Risk]** Multiple identical lines in a snippet (e.g. repeated `}` or boilerplate) make first-match-by-default land on the wrong occurrence without the presenter noticing the warning. **Mitigation:** encourage anchor text specific enough to be unique in the slicing docs/README; `#N`/`#*` exist precisely for when uniqueness isn't achievable.
- **[Risk]** Two `vite.config.ts` copies (root + `e2e/vite.config.ts`) must both learn the code-root validation and the extended `serializeMarkerOverride` logic; per `CLAUDE.md` this file is already known to drift if not manually kept in sync. **Mitigation:** call this out explicitly in tasks.md as a required paired edit, same as existing project convention.
- **[Trade-off]** Substring-only matching (no regex) means an anchor can't easily target "any line matching a pattern" — acceptable per Non-Goals, revisit only if real usage demands it.

## Migration Plan

Purely additive: existing inline-marker slides and the current copy-pasted `GestorNotas` example keep working unchanged. Once merged, migrate `slides.md`'s copy-pasted example to a `<<<` import with anchor markers as a worked example / smoke test, updating `code-highlight-marking`'s companion demo if useful. No data migration, no rollback complexity beyond reverting the commit.

## Open Questions

- Should the console-warning degradation also be surfaced anywhere in the rendered slide itself (e.g. a small dev-mode-only badge) rather than console-only, for cases where a presenter is in `pnpm build` output rather than watching the dev console? Deferred — start console-only, revisit if it proves insufficient in practice.
