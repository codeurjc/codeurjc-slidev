// Translates the theme's fence-relative marker parsing into document-absolute
// positions a VSCode decoration can be painted at. Stays independent of the
// `vscode` module -- callers convert these plain shapes into real
// vscode.Range/DecorationOptions at the extension-host boundary.

import { findMarkerSpan, parseCodeHighlights } from 'codeurjc-slidev-theme/composables/useCodeHighlights'
import { findFencedBlocks } from './documentScan'

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
}

export interface ComputedMarkerDecorations {
  dims: DimSpan[]
  highlights: HighlightSpan[]
}

/** Computes marker-preview decorations for every manual fenced code block in `text`. */
export function computeMarkerDecorations(text: string): ComputedMarkerDecorations {
  const dims: DimSpan[] = []
  const highlights: HighlightSpan[] = []

  for (const fence of findFencedBlocks(text)) {
    const codeLines = fence.code.split('\n')
    codeLines.forEach((line, idx) => {
      const span = findMarkerSpan(line)
      if (span)
        dims.push({ line: fence.codeStartLine + idx, startChar: span.start, endChar: span.end })
    })

    const { highlights: fenceHighlights } = parseCodeHighlights(fence.code)
    for (const h of fenceHighlights) {
      highlights.push({
        startLine: fence.codeStartLine + h.startLine,
        endLine: fence.codeStartLine + h.endLine,
        substringRange: h.substringRange,
        comment: h.comment,
      })
    }
  }

  return { dims, highlights }
}
