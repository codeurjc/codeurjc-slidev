## Context

`MARKER_RE` in `composables/useCodeHighlights.ts` is anchored as `^(.*?)(?://|#)\s*\[!mark…\]\s*(.*)$`: the lazy prefix stops at the first comment token and the trailing group swallows the rest of the line as the highlight's comment. `parseCodeHighlights` then pushes `codePrefix` as the rendered line, so a second marker on the line is both parsed as comment text and deleted from the render. One marker per line is therefore a property of the grammar, not of the renderer.

The renderer is already indifferent: `injectHighlightSpans` loops over every highlight whose range covers a line, nesting `<span class="code-hl-mark">` wrappers, and `wrapSubstringInLineHtml` rebuilds its offsets with `buildTextMap`, which skips tags — so it still works on a line a previous highlight already wrapped. The anchor path proves this in practice, since two anchor declaration lines can already target the same snippet line.

What does depend on one-marker-per-line is *identity*. A highlight is addressed by `sourceLine` (base64 of its raw line in `data-source-line`). `layouts/default.vue` posts that string to `/api/save-code-highlight-position`, and the middleware does `content.indexOf(sourceLine)` over the whole file, then rewrites the first `[!mark…]` it finds in that line. That is ambiguous in two ways today, and a third appears with this change:

- the same marked line can occur in another slide of the same file (existing defect);
- the same marked line can occur twice within one slide (existing defect);
- one line can host several markers (introduced here).

The ODP importer works around the grammar in `renderInlineMarks`: it sorts marks narrowest-first and reports `code highlight omitted (another marker already uses that line)` for the rest. Measured over the 11-deck corpus, only the GitHub Actions deck collides, losing 8 of 23 marks; every other deck loses none.

Slidev's `$route.meta.slide.source` (`SourceSlideInfo`) carries `filepath`, `index`, `start`, `contentStart`, `end` and `raw`, which is enough to scope and disambiguate a write-back without any DOM bookkeeping.

## Goals / Non-Goals

**Goals:**

- Let a fenced line carry several markers, keeping marks inline next to the code they mark.
- Express nested ranges that end on the same line, the shape the corpus actually needs.
- Address a callout's write-back to exactly one marker, fixing the pre-existing identical-line defect in the same pass.
- Leave single-marker lines, the rendered output and existing decks untouched.

**Non-Goals:**

- Line-count range forms (`[!mark+8]`). Rejected because the count goes stale when the code is edited; `:start`/`:end` markers travel with their lines.
- Anchor declaration lines under hand-typed fences. It would also solve the collision, but it moves marks away from the code, which is the opposite of the authoring preference driving this change.
- Marker-only lines that apply to a neighbouring line. Cheap, but it makes a code line's position depend on how many marker-only lines precede it.
- Changing the anchor grammar for `<<<` imports, or the `{N}` click-step semantics.
- Overlapping substring highlights on one line as a supported feature.

## Decisions

### D1: A comment body ends at the next `[!mark`, or at end of line

The alternative was an explicit terminator (`[!mark] text ;; [!mark] text`), which adds punctuation to every multi-marker line for a case that is rare. Ending at the next marker needs no new characters and reads naturally left to right. The cost is that a comment cannot contain the literal `[!mark`; it splits there. This is documented rather than escaped, matching how `]` inside anchor text is handled (a quote-aware scan, no escape syntax).

### D2: Markers on a line are processed left to right, sharing the existing pairing stack

`pendingStarts` already behaves like a bracket stack. Processing a line's markers in written order means `# [!mark:end] [!mark:end]` closes the innermost range first, and `# [!mark:end] [!mark:start]` closes one range and opens another on the same line. No new pairing rule is introduced.

### D3: A highlight records its marker index within its line

`CodeHighlight` gains the ordinal of its marker within the source line, emitted as a data attribute beside `data-source-line`. `serializeMarkerOverride(sourceLine, x, y, markerIndex)` then rewrites the Nth marker instead of the first; its existing regex already isolates one marker's optional `@x,y`, so it needs to skip N matches rather than change shape. For a range, the index is the `:start` marker's, consistent with `:start` already winning for comment text and click step.

### D4: The write-back is addressed by slide range, line occurrence and marker index

The client posts `filepath`, the slide's `start`/`end`, the occurrence index of the source line within that slide, and the marker index. The middleware slices the file to the slide's line range, takes the Nth identical line, and rewrites marker K. This resolves all three ambiguities with one mechanism and, because anchor declaration lines are ordinary lines of the slide, works unchanged for `<<<` imports — no per-code-block DOM indices have to be threaded through the layout.

The occurrence index is computed where the raw slide text is already available (`ctx.slide.source.raw` in `setup/transformers.ts`) and emitted with the other highlight attributes, so the client never re-scans markdown and the value is fixed at transform time.

The layout currently reads `$route.meta.slide.filepath`, which per Slidev's types lives on `source`, not on `SlideInfo`. It is switched to `slide.source.filepath` alongside the range fields.

### D5: Unresolvable addresses fall back to today's behaviour

The slide range comes from the last parse, so a drag immediately after an edit can miss. When the scoped lookup finds nothing, the middleware falls back to the current whole-file first match, and a failed save stays best-effort (the position remains in effect for the session). Payloads without the new fields behave exactly as today, so an older client against a newer middleware keeps working.

### D6: Overlapping substring ranges warn and skip the second

Disjoint substring ranges on a line nest cleanly; overlapping ones would make `wrapSubstringInLineHtml` emit tangled markup. Detection is a simple interval check against the highlights already parsed for that line. Warning and skipping matches the anchor resolver's existing degrade-quietly behaviour, rather than throwing or rendering something broken.

### D7: The importer orders a line's markers ends-first

`renderInlineMarks` stops dropping marks. Within a line it writes range ends first (innermost first, so the pairing stack unwinds correctly), then single-line and substring marks, then range starts. The narrowest-first sort and the collision loss disappear; the loss for languages without line comments stays.

### D8: The VS Code extension is not changed

Its dim span runs from the first marker to end of line, which is still exactly the marker region when a line carries several. Highlight boxes come from `parseCodeHighlights`, which simply returns more highlights. Only tests are added, to pin that behaviour.

## Risks / Trade-offs

- **A comment containing `[!mark` splits silently** → documented in the grammar tables and the tutorial; the split is visible immediately in the rendered callouts, and no highlight is lost.
- **Dense lines hurt readability** (three markers on one line) → the importer only emits several markers when marks genuinely share a line, and authors keep the one-per-line style everywhere else.
- **Marker index drifts if the author inserts a marker earlier in the line** → the index is recomputed on every parse; only an override written between parse and drag could land on a neighbour, and the next drag corrects it.
- **Stale slide ranges after an edit** → D5's fallback, which is the current behaviour, so this is never worse than today.
- **Two spec-level concerns in one change** (grammar plus write-back addressing) → they share the payload, the serializer and the middleware; splitting them would mean doing that plumbing twice, and the grammar change is not safe to ship without the addressing fix.

## Migration Plan

No data or deck migration is needed: single-marker lines parse identically, and no existing markdown changes meaning. The middleware accepts old payloads (missing addressing fields → whole-file fallback), so a stale browser tab against a restarted dev server keeps saving. Rollback is a straight revert; decks that meanwhile adopted several markers per line would show only the first marker's highlight on the reverted version, with the rest of the line stripped as comment text.

## Open Questions

- Whether the importer should keep writing at most a couple of markers per line for readability and report the rest, or always write them all. Current plan: always write them all, since a loss is worse than a dense line.
- Whether `findMarkerSpan` should stay singular (first marker → end of line) or gain a plural form for finer-grained editor decorations later. Current plan: keep it singular, since the dim region is identical.
