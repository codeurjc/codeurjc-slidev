// Resolves a target file's indexed recipes against that file's *current*
// text on demand -- deliberately not cached, so an edit to the target file
// alone (with no markdown-file change) is reflected the next time lenses are
// requested, mirroring the theme's own dev-server "always re-resolve"
// rendering behavior instead of tracking line-shift deltas.

import type { ReferenceIndex } from './indexBuilder'
import { parseExternalHighlightAnchors } from 'codeurjc-slidev-theme/composables/useCodeHighlights'
import { resolveSnippetSelector } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { computeSlideNumber } from '../documentScan'

export interface ReferenceMention {
  slideFile: string
  slideLine: number
  slideNumber: number
  comment: string
}

export interface CodeLensEntry {
  /** 0-based line in the target file. */
  line: number
  title: string
  references: ReferenceMention[]
}

/** Computes CodeLens entries for `targetAbsPath`, resolving each of its recipes against `liveTargetText` and `slideTextByFile` (each recipe's own markdown file's current text, needed for slide-number computation). */
export function computeCodeLensesForDocument(
  index: ReferenceIndex,
  targetAbsPath: string,
  liveTargetText: string,
  slideTextByFile: (slideFile: string) => string | null,
): CodeLensEntry[] {
  const recipes = index.get(targetAbsPath)
  if (!recipes || recipes.length === 0)
    return []

  const byLine = new Map<number, ReferenceMention[]>()

  for (const recipe of recipes) {
    const slice = resolveSnippetSelector(liveTargetText, recipe.selector, () => {})
    const highlights = parseExternalHighlightAnchors(slice.text, [recipe.anchorLineText], { onWarn: () => {}, onError: () => {} })
    const slideText = slideTextByFile(recipe.slideFile)
    for (const h of highlights) {
      const absLine = slice.startLine + h.startLine
      const mention: ReferenceMention = {
        slideFile: recipe.slideFile,
        slideLine: recipe.slideLine,
        slideNumber: slideText ? computeSlideNumber(slideText, recipe.slideLine) : 0,
        comment: h.comment,
      }
      const existing = byLine.get(absLine)
      if (existing)
        existing.push(mention)
      else byLine.set(absLine, [mention])
    }
  }

  return [...byLine.entries()]
    .sort(([a], [b]) => a - b)
    .map(([absLine, references]) => ({
      line: absLine - 1, // convert resolveSnippetSelector's 1-based real line to a 0-based document line
      title: formatLensTitle(references),
      references,
    }))
}

function formatLensTitle(references: ReferenceMention[]): string {
  const slideLabels = references.map(r => `Slide ${r.slideNumber}`)
  const count = references.length
  return `📽 ${count} reference${count === 1 ? '' : 's'} — ${slideLabels.join(', ')}`
}
