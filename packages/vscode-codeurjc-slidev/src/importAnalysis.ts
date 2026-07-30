// Hover previews and diagnostics for `<<<` imports and their following
// `[!mark:...]`/`[!source ...]` directive lines. Reading the imported file is
// injected via `resolveImport` so this stays testable with in-memory fixtures
// -- the real extension supplies an fs-backed implementation.

import { parseSnippetSelector, resolveSnippetSelector } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { parseExternalHighlightAnchors } from 'codeurjc-slidev-theme/composables/useCodeHighlights'
import { parseSourceDirective } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { findImportBlocks } from './documentScan'
import { parseFrontmatterField } from './themeGate'
import type { ClassifySourceLink } from './sourceLinkDiagnostics'

export interface ResolvedImport {
  targetAbsPath: string
  fileText: string
  /** True if the import's file path resolves outside the configured code root -- a warning, not a hard failure (the theme still reads/renders the file). */
  escapesCodeRoot: boolean
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

const defaultClassifySourceLink: ClassifySourceLink = () => 'ok'

/** Analyzes every `<<<` import and its directive lines in `text`, producing hover previews and diagnostics. */
export function analyzeImports(text: string, resolveImport: ResolveImport, classifySourceLink: ClassifySourceLink = defaultClassifySourceLink): ImportAnalysis {
  const hovers: HoverInfo[] = []
  const diagnostics: DiagnosticInfo[] = []
  const configuredBranch = parseFrontmatterField(text, 'codeSourceLinkBranch')

  for (const block of findImportBlocks(text)) {
    const resolved = resolveImport(block.parsed.filePath)
    if (!resolved) {
      diagnostics.push({ line: block.importLine, message: `Could not resolve imported file: ${block.parsed.filePath}`, severity: 'warning' })
      continue
    }
    if (resolved.escapesCodeRoot) {
      diagnostics.push({ line: block.importLine, message: `Import resolves outside the code root: ${resolved.targetAbsPath}`, severity: 'warning' })
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

    let sourceDirectiveLine: number | null = null
    let sourceMode: 'auto' | 'url' | 'none' = 'auto' // no directive at all defaults to auto, same as the theme

    for (const directive of block.directives) {
      if (directive.kind === 'source') {
        const parsed = parseSourceDirective(directive.text)
        sourceDirectiveLine = directive.line
        sourceMode = parsed?.mode ?? 'auto'
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

    if (sourceMode === 'auto' && classifySourceLink(resolved.targetAbsPath, configuredBranch) === 'no-branch') {
      diagnostics.push({
        line: sourceDirectiveLine ?? block.importLine,
        message: 'No git branch could be resolved for this import\'s source link -- set `codeSourceLinkBranch` in the deck frontmatter, or configure the repo\'s default branch (e.g. `git remote set-head origin -a`).',
        severity: 'warning',
      })
    }
  }

  return { hovers, diagnostics }
}
