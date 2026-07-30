// Hover previews and diagnostics for `<<<` imports and their following
// `[!mark:...]`/`[!source ...]` directive lines. Reading the imported file is
// injected via `resolveImport` so this stays testable with in-memory fixtures
// -- the real extension supplies an fs-backed implementation.

import { parseSnippetSelector, resolveSnippetSelector } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { parseExternalHighlightAnchors } from 'codeurjc-slidev-theme/composables/useCodeHighlights'
import { parseSourceDirective } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { findImportBlocks } from './documentScan'

export interface ResolvedImport {
  targetAbsPath: string
  fileText: string
}

export type ResolveImport = (importFilePath: string) => ResolvedImport | null

export interface HoverInfo {
  /** 0-based document line the hover applies to. */
  line: number
  contents: string
}

export interface DiagnosticInfo {
  /** 0-based document line the diagnostic applies to. */
  line: number
  message: string
  severity: 'warning' | 'error'
}

export interface ImportAnalysis {
  hovers: HoverInfo[]
  diagnostics: DiagnosticInfo[]
}

/** Analyzes every `<<<` import and its directive lines in `text`, producing hover previews and diagnostics. */
export function analyzeImports(text: string, resolveImport: ResolveImport): ImportAnalysis {
  const hovers: HoverInfo[] = []
  const diagnostics: DiagnosticInfo[] = []

  for (const block of findImportBlocks(text)) {
    const resolved = resolveImport(block.parsed.filePath)
    if (!resolved) {
      diagnostics.push({ line: block.importLine, message: `Could not resolve imported file: ${block.parsed.filePath}`, severity: 'warning' })
      continue
    }

    const selector = block.parsed.selectorRaw ? parseSnippetSelector(block.parsed.selectorRaw) : null
    if (block.parsed.selectorRaw && !selector) {
      diagnostics.push({ line: block.importLine, message: `Malformed selector: [${block.parsed.selectorRaw}]`, severity: 'error' })
      continue
    }

    let sliceWarning: string | null = null
    const slice = resolveSnippetSelector(resolved.fileText, selector, (m) => { sliceWarning = m })
    if (sliceWarning) diagnostics.push({ line: block.importLine, message: sliceWarning, severity: 'warning' })

    hovers.push({
      line: block.importLine,
      contents: `**${resolved.targetAbsPath}** (lines ${slice.startLine}-${slice.endLine})`,
    })

    for (const directive of block.directives) {
      if (directive.kind === 'source') {
        const parsed = parseSourceDirective(directive.text)
        hovers.push({
          line: directive.line,
          contents: !parsed
            ? 'Malformed [!source] directive'
            : parsed.mode === 'none'
              ? 'Source link suppressed for this block'
              : parsed.mode === 'url'
                ? `Source link: ${parsed.url}${parsed.bottom ? ' (bottom row)' : ''}`
                : `Source link: auto-detected${parsed.bottom ? ' (bottom row)' : ''}`,
        })
        continue
      }

      // Anchor directive: resolve it in isolation (one anchor line per call)
      // so a warning/error can be attributed to exactly this document line.
      const highlights = parseExternalHighlightAnchors(slice.text, [directive.text], {
        onWarn: (m) => diagnostics.push({ line: directive.line, message: m, severity: 'warning' }),
        onError: (m) => diagnostics.push({ line: directive.line, message: m, severity: 'error' }),
      })
      for (const h of highlights) {
        const absLine = slice.startLine + h.startLine
        hovers.push({ line: directive.line, contents: `Line ${absLine}: ${h.comment || '(no comment)'}` })
      }
    }
  }

  return { hovers, diagnostics }
}
