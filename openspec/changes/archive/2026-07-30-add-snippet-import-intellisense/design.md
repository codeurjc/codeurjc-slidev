## Context

`packages/vscode-codeurjc-slidev/` already previews the theme's marker/anchor grammar (`vscode-marker-annotations`) and indexes reverse references (`vscode-reference-index`), both by reusing the theme's own composables rather than re-deriving the grammar. The `<<<` import line itself — the file path and its `[selector]` bracket — has had no equivalent authoring assistance: no path completion, and no help computing a `[N-M]`/`["a".."b"]` selector by hand.

## Goals / Non-Goals

**Goals:**
- Path completion for the `<<< @/...` file-path token, scoped to the configured code root.
- A copy/paste command pair that computes a selector from an arbitrary selection (in any file) and writes it into an existing `<<<` line's bracket, without either command needing to know about the other's document.
- Reuse the theme's own parser/serializer for all validation and bracket-splicing — never re-derive the `<<<` line's own syntax rules in the extension.

**Non-Goals:**
- No autocompletion for the trailing language token or `notitle` keyword (a separate, smaller feature).
- No one-step "select in target file → directly update the right slide" flow — ambiguity in which `<<<` import (if any) to update, across possibly multiple decks, is resolved by keeping copy and paste as independent commands rather than building cross-document disambiguation UI.
- No support for a `<<<` import that doesn't yet exist at all (i.e. this doesn't insert a brand-new import line, only completes paths and edits an existing line's selector).

## Decisions

### Two independent commands (copy, then paste), not one cross-document command
Tracing through "one command from the target file's selection" surfaced real ambiguity: a target file can be referenced by zero, one, or several `<<<` imports across the workspace (exactly the situation `vscode-reference-index` already indexes), and there's no reliable signal for which one the author means to update. Keeping copy/paste as two ordinary commands — mirroring VSCode's own "Copy Relative Path" pattern — avoids inventing disambiguation UI or "last active document" heuristics; the author's own cursor placement for "paste" is the only disambiguation needed, and it's already unambiguous by construction.

### Clipboard, not extension-held state, carries the selector — but validated on paste
Using the OS clipboard (rather than extension-internal state) keeps the two commands usable across separate windows/workspaces and survives an extension host reload between copy and paste. The risk — pasting arbitrary non-selector clipboard content into a `<<<` line — is closed by running the clipboard text through the theme's own `parseSnippetSelector` before splicing; unparseable content is rejected with an error rather than silently corrupting the line.

### Selector-form decision (`selectorFromSelection.ts`) is pure and extension-only; splicing (`serializeSnippetSelector`) is shared with the theme
Tracing what each step actually touches: deciding *which selector form* to produce from a selection needs only the document's text and the selected range — no fs, no vscode APIs beyond reading the selection — so it's a pure, extension-side, vitest-testable function with no theme-side consumer (the theme's own renderer never needs to choose a selector on an author's behalf). *Writing* the chosen selector into an existing line's bracket, though, is the same class of problem `useCodeHighlights.ts`'s `serializeMarkerOverride` already solves for the `@x,y` marker-position bracket — so `serializeSnippetSelector` lives in the theme's `useSnippetImport.ts` as its symmetric counterpart, keeping all `<<<`-line bracket-splicing logic owned by the module that owns the grammar.
- **Alternative considered**: put `serializeSnippetSelector` in the extension package too, since the theme's own renderer has no current caller for it. Rejected — the splicing logic operates purely on the `<<<` line's own syntax (which `parseSnippetImportLine` already fully owns in the theme), and keeping it there means any future grammar change to the import line's bracket position only has one place to update.

### Prefer content-anchor selectors when safe, matching the reference-index's existing bias
The selector-form decision tree defaults to a content-anchor range and only falls back to a line range when the anchor would be unreliable (blank or non-unique boundary text) or meaningless (single-line selection). This mirrors the same "content-anchor forms are self-healing by construction" reasoning already used for `vscode-reference-index`'s recipe design — consistent stance across both features rather than a new one invented here.

### Uniqueness/blank checks reimplement a small, already-private piece of theme logic
`useCodeHighlights.ts`'s anchor-resolution code already counts line occurrences internally (`findOccurrences`), but it's private and scoped to *highlight* anchors, not snippet-*import* selectors — a different concern living in a different module. `selectorFromSelection.ts` reimplements the (trivial, ~3-line) occurrence-counting itself rather than exporting and repurposing that private helper across an unrelated module boundary.

## Risks / Trade-offs

- **[Risk]** Path completion may visually duplicate whatever the official Slidev VSCode extension already offers for its own native `<<<` syntax (same leading tokens, different selector semantics) → **Mitigation**: spike this empirically first — open the Extension Development Host, type `<<< @/` in a theme-tagged doc with only the official extension installed, and see what (if anything) already fires — before implementing the completion provider. If it already offers reasonable path completion, this requirement may be dropped or narrowed to just the bracket-selector authoring commands.
- **[Risk]** "Copy selector" always operates on whatever file/selection is currently active, with no validation that the file is even under the code root or that the eventual "paste" target references it correctly → **Mitigation**: accepted as out of scope; the existing code-root-escape diagnostic (`vscode-marker-annotations`) already catches a mismatched paste after the fact, on the `<<<` line itself.
- **[Risk]** Clipboard-based handoff is invisible state between two separate commands — an author could copy a selector, do unrelated copying in between, then paste stale/wrong clipboard content into an import → **Mitigation**: the paste command's validation (must parse as a real selector) catches the case where the clipboard no longer holds selector-shaped text at all, but cannot catch "holds a different, still-valid selector by coincidence." Accepted as an inherent limitation of the clipboard-handoff design chosen above.

## Migration Plan

Purely additive to an already-shipped, unpublished extension, plus one new pure export on the theme package (`serializeSnippetSelector`) with no existing callers to migrate.

## Open Questions

- ~~Whether the official Slidev extension's own `<<<` handling already provides path completion~~ **Resolved by the spike**: it does not. Querying `vscode.executeCompletionItemProvider` on a fresh `<<< @/` line and on `<<< @/code/` mid-import, with only `antfu.slidev` (v52.18.0) installed, returned only VSCode's generic word-based suggestions harvested from words already in the document (`CompletionItemKind.Text`, no path/file semantics, no filtering by the typed prefix) — no folder/file completions of any kind. Path completion (task group 3) proceeds at full scope.
