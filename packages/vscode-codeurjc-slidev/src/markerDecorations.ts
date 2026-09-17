// Translates the theme's fence-relative marker parsing into document-absolute
// positions a VSCode decoration can be painted at. Stays independent of the
// `vscode` module -- callers convert these plain shapes into real
// vscode.Range/DecorationOptions at the extension-host boundary.

import type { StepRange } from 'codeurjc-slidev-theme/composables/stepRange'
import type { ClickModelOptions } from './clickModel'
import type { StepBadge } from './stepBadges'
import { extractInlineSourceLink, findMarkerSpan, isInlineSourceMarkerLine, parseCodeHighlights } from 'codeurjc-slidev-theme/composables/useCodeHighlights'
import { computeDocumentClicks } from './clickModel'
import { findFencedBlocks } from './documentScan'
import { computeStepBadges } from './stepBadges'

export interface DimSpan {
  /** 0-based document line. */
  line: number
  startChar: number
  endChar: number
}

export interface HighlightSpan {
  /** 0-based document lines, inclusive. */
  startLine: number
  endLine: number
  /** Present only for a substring highlight; 0-based character offsets on `startLine`. */
  substringRange?: { start: number, end: number }
  comment: string
  /** Click step or step range (`{N}`, `{N-M}`, …), when the marker has one. */
  click?: StepRange
}

export interface ComputedMarkerDecorations {
  dims: DimSpan[]
  highlights: HighlightSpan[]
  /** Step badges for marker lines, anchor lines and native fence ranges (see clickModel.ts). */
  badges: StepBadge[]
}

/** Computes marker-preview decorations for every manual fenced code block in `text`. */
export function computeMarkerDecorations(text: string, clickOptions: ClickModelOptions = {}): ComputedMarkerDecorations {
  const dims: DimSpan[] = []
  const highlights: HighlightSpan[] = []

  for (const fence of findFencedBlocks(text)) {
    const codeLines = fence.code.split('\n')
    codeLines.forEach((line, idx) => {
      const span = findMarkerSpan(line)
      if (span)
        dims.push({ line: fence.codeStartLine + idx, startChar: span.start, endChar: span.end })
    })

    // The theme drops inline `// [!source]` marker lines before parsing
    // markers, so marker line numbers count the remaining lines.
    const keptLines = codeLines.flatMap((line, idx) => (isInlineSourceMarkerLine(line) ? [] : [fence.codeStartLine + idx]))
    const { highlights: fenceHighlights } = parseCodeHighlights(extractInlineSourceLink(fence.code).code)
    for (const h of fenceHighlights) {
      highlights.push({
        startLine: keptLines[h.startLine],
        endLine: keptLines[h.endLine],
        substringRange: h.substringRange,
        comment: h.comment,
        ...(h.click ? { click: h.click } : {}),
      })
    }
  }

  return { dims, highlights, badges: computeStepBadges(computeDocumentClicks(text, clickOptions)) }
}
