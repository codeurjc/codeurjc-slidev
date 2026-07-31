// Decides which `<<<` import selector form to produce from an arbitrary
// editor selection: a content-anchor range when safe (both boundary lines
// non-blank and unique in the file -- self-healing against later edits
// elsewhere in the file), otherwise a plain line range. Purely a decision
// over the selection's own file text; has no vscode/fs dependency, and no
// use case in the theme's own renderer (the theme only ever *resolves* an
// already-written selector, never *chooses* one on an author's behalf).
//
// The uniqueness check matters because `resolveSnippetSelector`'s
// content-anchor-range resolution (`useSnippetImport.ts`) always picks the
// *first* line-substring match in the file with no ambiguity detection of
// its own (unlike highlight anchors, which support `#N`/`#*` occurrence
// selectors) -- generating an anchor from non-unique boundary text could
// silently resolve to the wrong lines later, so this check is a genuine
// safety measure, not extra caution.

export interface SelectionLineRange {
  /** 1-based, inclusive. */
  startLine: number
  endLine: number
}

/** Counts lines whose text contains `text` as a substring, matching `resolveSnippetSelector`'s own `.includes()`-based matching. */
function countOccurrences(lines: string[], text: string): number {
  return lines.filter(l => l.includes(text)).length
}

/** Escapes `"` and `\` for embedding in a selector's quoted anchor text, the write-direction counterpart to `useSnippetImport.ts`'s internal (unexported) `unescapeQuoted`. */
function escapeForQuotedSelector(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Computes a `<<<` import selector's raw bracket content (without the
 * surrounding `[` `]`) for `selection` within `fileLines`.
 */
export function computeSelectorForSelection(fileLines: string[], selection: SelectionLineRange): string {
  const { startLine, endLine } = selection
  if (startLine === endLine)
    return `${startLine}-${startLine}`

  const firstText = (fileLines[startLine - 1] ?? '').trim()
  const lastText = (fileLines[endLine - 1] ?? '').trim()
  const bothNonBlank = firstText.length > 0 && lastText.length > 0
  const bothUnique = bothNonBlank
    && countOccurrences(fileLines, firstText) === 1
    && countOccurrences(fileLines, lastText) === 1

  if (bothUnique) {
    return `"${escapeForQuotedSelector(firstText)}".."${escapeForQuotedSelector(lastText)}"`
  }
  return `${startLine}-${endLine}`
}
