// Resolves a target file's indexed recipes against that file's *current*
// text on demand -- deliberately not cached, so an edit to the target file
// alone (with no markdown-file change) is reflected the next time lenses are
// requested, mirroring the theme's own dev-server "always re-resolve"
// rendering behavior instead of tracking line-shift deltas.

import type { SlideClicks } from '../clickModel'
import type { ReferenceIndex } from './indexBuilder'
import { parseExternalHighlightAnchors } from 'codeurjc-slidev-theme/composables/useCodeHighlights'
import { resolveSnippetSelector } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { computeDocumentClicks, slideClicksAt } from '../clickModel'
import { computeSlideNumber } from '../documentScan'
import { formatStepBadge } from '../stepBadges'

export interface ReferenceMention {
  slideFile: string
  slideLine: number
  slideNumber: number
  comment: string
  /** The referencing anchor's click step, when it has one. */
  click?: number
  /** That slide's total clicks, or null when it can't be counted. */
  total?: number | null
}

export interface CodeLensOptions {
  /** Whether step labels include the slide total (`▸3 of 3`). Defaults to true. */
  showTotal?: boolean
  /** Reads a `<<<` import's file text for `slideFile`'s click model; see `ClickModelOptions.resolveImportText`. */
  resolveImportText?: (slideFile: string, importFilePath: string) => string | null
  /** The component names of `slideFile`'s project; see `ClickModelOptions.componentNames`. */
  componentNames?: (slideFile: string) => ReadonlySet<string> | undefined
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
  options: CodeLensOptions = {},
): CodeLensEntry[] {
  const recipes = index.get(targetAbsPath)
  if (!recipes || recipes.length === 0)
    return []

  const byLine = new Map<number, ReferenceMention[]>()
  const clicksByFile = new Map<string, SlideClicks[]>()
  const slideTotal = (slideFile: string, slideText: string, slideLine: number): number | null => {
    let slides = clicksByFile.get(slideFile)
    if (!slides) {
      slides = computeDocumentClicks(slideText, {
        resolveImportText: options.resolveImportText ? path => options.resolveImportText!(slideFile, path) : undefined,
        componentNames: options.componentNames?.(slideFile),
      })
      clicksByFile.set(slideFile, slides)
    }
    return slideClicksAt(slides, slideLine)?.total ?? null
  }

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
        ...(h.click && slideText ? { click: h.click, total: slideTotal(recipe.slideFile, slideText, recipe.slideLine) } : {}),
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
      title: formatLensTitle(references, options.showTotal ?? true),
      references,
    }))
}

function formatLensTitle(references: ReferenceMention[], showTotal: boolean): string {
  const slideLabels = references.map(r => r.click ? `Slide ${r.slideNumber} ${formatStepBadge([r.click], r.total ?? null, showTotal)}` : `Slide ${r.slideNumber}`)
  const count = references.length
  return `📽 ${count} reference${count === 1 ? '' : 's'} — ${slideLabels.join(', ')}`
}
