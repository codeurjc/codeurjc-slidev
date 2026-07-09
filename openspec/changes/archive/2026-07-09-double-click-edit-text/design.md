## Context

Slides render as compiled Vue/HTML from markdown at dev-server time; there is no source map from a rendered DOM node back to its raw-markdown offset. The Content tab (`_override/SideEditor.vue`) already edits the slide's raw markdown through Slidev's own `ShikiEditor`, which is backed by a real `<textarea data-editor="content">` — `global-top.vue`'s paste handler already reaches into that textarea directly (`insertAtCursor`), so once a character-offset range is known, selecting it is a one-line `textarea.setSelectionRange(start, end)`.

The open problem this design solves: given a double-clicked DOM node inside `.content-inner`, find the character range in the raw markdown string it came from.

## Goals / Non-Goals

**Goals:**
- Map a double-clicked block-level DOM node (paragraph, heading incl. the slide title, list item, blockquote, table row/cell, code block, standalone image) to the raw-markdown block it renders from, at block granularity.
- Open the SideEditor to the Content tab and select that block's raw text if it's closed or on another tab.
- Never activate outside the dev server, and never while the Layout tab (`editor.editing.value`) is active.
- Degrade silently (open the editor, don't select anything) when the mapping can't be resolved confidently.

**Non-Goals:**
- Word/phrase-level selection precision. Landing on the containing block is sufficient — the underlying element is a real `<textarea>`, so a follow-up native double-click there gets the user the exact word.
- Supporting exported/built presentations or Slidev's presenter-clicker live-talk flow (no dev server ⇒ feature does not exist there).
- Patching Slidev's own markdown-it pipeline or parser internals — the raw-markdown parse used here is a separate, local one, not a hook into Slidev's rendering.

## Decisions

**Decision: Parse raw markdown locally with `markdown-it` rather than regex-splitting blocks.**
`markdown-it` (already present transitively via Slidev, ^14.2.0) gives real block tokens with `.map` line ranges for free — correct handling of nested lists, tables, fenced code, blockquotes — without hand-rolling a parser. Regex-splitting on blank lines (the original explore-mode sketch) breaks the moment a code fence or nested list contains a blank line.
- *Alternative considered*: hook Slidev's own markdown-it instance to emit `data-src-line` attributes at render time. Rejected — reaches into Slidev/`@slidev/parser` internals, version-fragile, far larger surface than anything else in this repo (which solves problems with self-contained client-side heuristics: autofit text, image paste/position).

**Decision: Pair blocks by document-order index, not by content matching.**
Walk `.content-inner` for block-level elements (`p`, `li`, `h1`-`h6`, `blockquote`, `pre`, `tr`, standalone `img`) in DOM order, and walk the local `markdown-it` parse's block tokens in the same order. Pair index-for-index. Both sides derive from the same markdown source and both are inherently depth-first/document-order, so index pairing holds as long as Slidev's own rendering doesn't interleave block order (it doesn't — it renders markdown structurally, in order).
- *Alternative considered*: fuzzy text matching (search rendered text in raw source). Rejected per the granularity decision — the user only needs block landing, and text matching adds failure modes (duplicate words, markdown syntax shifting offsets) for no required benefit.

**Decision: Known-wrapper skip list for Slidev-specific DOM, not general robustness.**
Slidev inserts its own wrapper elements for `v-click` groups and custom containers (e.g. `::right::`) that don't correspond to a markdown-it block themselves. The DOM walk maintains a small, explicit list of Slidev wrapper element/class patterns to see through (not count as blocks). Anything not recognized falls through to the graceful-degradation path (open editor, no selection) rather than attempting a general-purpose reconciliation algorithm.

**Decision: Gate on dev-only reachability, not a separate "presenter mode" check.**
`showEditor`/SideEditor only exist when running via the dev server; there is no route to them in an exported build. Gating on the same conditions that make the editor reachable (SideEditor mounted, dev server APIs available) is sufficient — no separate environment check needed. The residual case of a presenter running the dev server live (rather than an export) is accepted as out of scope per the user's framing of this as a rehearsal/prep aid; a future change could add a presenter-mode-specific opt-out if that turns out to matter in practice.

## Risks / Trade-offs

- [Slidev wrapper elements (v-click groups, custom containers) throw off the DOM/token index pairing] → Maintain an explicit skip list for known Slidev wrapper patterns; anything unrecognized falls back to "open editor, no selection" rather than guessing.
- [`markdown-it`'s default parse doesn't exactly match Slidev's own extended syntax (e.g. custom containers, embedded components) block-for-block] → Same fallback: a mismatched block count between the two walks means "no confident mapping," not a best-effort guess.
- [Adding `markdown-it` as a direct dependency when it's currently only a transitive one] → Low risk: it's a stable, widely-used, already-present package; pinning a direct version avoids relying on Slidev's own dependency resolution shifting it later.
- [Double-click semantics overlap with native browser word-selection on rendered text] → Acceptable/desirable: the native selection highlight and the textarea's selection both being visible reinforces "this is the text you clicked," rather than conflicting.

## Open Questions

- Should the skip-list of Slidev wrapper patterns be hardcoded from current Slidev 52 behavior, or introspected at runtime (e.g. via a Slidev-exposed marker attribute)? Starting hardcoded; revisit if Slidev version bumps break it.
