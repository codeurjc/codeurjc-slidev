// Hover previews, diagnostics, and CodeLens data for `<<<` imports and their
// following `[!mark:...]`/`[!source ...]` directive lines. Reading the
// imported file is injected via `resolveImport` so this stays testable with
// in-memory fixtures -- the real extension supplies an fs-backed
// implementation.

import type { ResolveSourceLink } from './sourceLinkDiagnostics'
import { parseExternalHighlightAnchors } from 'codeurjc-slidev-theme/composables/useCodeHighlights'
import { parseSnippetSelector, parseSourceDirective, resolveSnippetSelector } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { findImportBlocks } from './documentScan'
import { parseFrontmatterField } from './themeGate'

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

export interface ImportCodeLensAction {
  /** 0-based document line the CodeLens attaches to (the `<<<` import line itself). */
  line: number
  openFile: { absPath: string, startLine: number, endLine: number, isWholeFile: boolean }
  /** The URL "Open source ↗" should open, or null to omit that lens entirely. */
  openSourceUrl: string | null
}

export interface ImportAnalysis {
  hovers: HoverInfo[]
  diagnostics: DiagnosticInfo[]
  codeLensActions: ImportCodeLensAction[]
}

const defaultResolveSourceLink: ResolveSourceLink = () => ({ status: 'ok', url: null })

/** Analyzes every `<<<` import and its directive lines in `text`, producing hover previews, diagnostics, and CodeLens data. */
export function analyzeImports(text: string, resolveImport: ResolveImport, resolveSourceLink: ResolveSourceLink = defaultResolveSourceLink): ImportAnalysis {
  const hovers: HoverInfo[] = []
  const diagnostics: DiagnosticInfo[] = []
  const codeLensActions: ImportCodeLensAction[] = []
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
    const slice = resolveSnippetSelector(resolved.fileText, selector, (m) => {
      sliceWarning = m
    })
    if (sliceWarning)
      diagnostics.push({ line: block.importLine, message: sliceWarning, severity: 'warning' })

    hovers.push({
      line: block.importLine,
      contents: `**${resolved.targetAbsPath}** (lines ${slice.startLine}-${slice.endLine})`,
    })

    // Determine the source-link mode (an explicit directive, or the implicit
    // "auto" default when there's no directive line at all) before handling
    // the remaining (anchor) directives, so both the hover and the CodeLens
    // below can share one resolution rather than resolving twice.
    const sourceDirective = block.directives.find(d => d.kind === 'source')
    const parsedSource = sourceDirective ? parseSourceDirective(sourceDirective.text) : null

    let openSourceUrl: string | null = null
    if (sourceDirective && !parsedSource) {
      hovers.push({ line: sourceDirective.line, contents: 'Malformed [!source] directive' })
    }
    else if (parsedSource?.mode === 'none') {
      hovers.push({ line: sourceDirective!.line, contents: 'Source link suppressed for this block' })
    }
    else if (parsedSource?.mode === 'url') {
      openSourceUrl = parsedSource.url!
      hovers.push({ line: sourceDirective!.line, contents: `Source link: ${parsedSource.url}${parsedSource.bottom ? ' (bottom row)' : ''}` })
    }
    else {
      // Auto mode: either no directive at all (implicit), or an explicit
      // `[!source]`/`[!source bottom]`.
      const isWholeFile = selector === null
      const resolvedLink = resolveSourceLink(resolved.targetAbsPath, { startLine: slice.startLine, endLine: slice.endLine, isWholeFile }, configuredBranch)
      openSourceUrl = resolvedLink.url
      if (resolvedLink.status === 'no-branch') {
        diagnostics.push({
          line: sourceDirective?.line ?? block.importLine,
          message: 'No git branch could be resolved for this import\'s source link -- set `codeSourceLinkBranch` in the deck frontmatter, or configure the repo\'s default branch (e.g. `git remote set-head origin -a`).',
          severity: 'warning',
        })
      }
      if (sourceDirective) {
        hovers.push({
          line: sourceDirective.line,
          contents: openSourceUrl ? `Source link: ${openSourceUrl}${parsedSource?.bottom ? ' (bottom row)' : ''}` : 'Source link: none resolves for this import',
        })
      }
    }

    codeLensActions.push({
      line: block.importLine,
      openFile: { absPath: resolved.targetAbsPath, startLine: slice.startLine, endLine: slice.endLine, isWholeFile: selector === null },
      openSourceUrl,
    })

    for (const directive of block.directives) {
      if (directive.kind === 'source')
        continue // already handled above

      // Anchor directive: resolve it in isolation (one anchor line per call)
      // so a warning/error can be attributed to exactly this document line.
      const highlights = parseExternalHighlightAnchors(slice.text, [directive.text], {
        onWarn: m => diagnostics.push({ line: directive.line, message: m, severity: 'warning' }),
        onError: m => diagnostics.push({ line: directive.line, message: m, severity: 'error' }),
      })
      for (const h of highlights) {
        const absLine = slice.startLine + h.startLine
        hovers.push({ line: directive.line, contents: `Line ${absLine}: ${h.comment || '(no comment)'}` })
      }
    }
  }

  return { hovers, diagnostics, codeLensActions }
}
