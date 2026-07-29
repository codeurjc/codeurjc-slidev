// Parsing + resolution support for the file-backed snippet-import syntax:
//   <<< @/code/path/to/File.java lang                     (whole file)
//   <<< @/code/path/to/File.java[9-15] lang                (absolute line range)
//   <<< @/code/path/to/File.java["a".."b"] lang            (content-anchor range,
//                                                            searched against the
//                                                            whole file's text)
// This intentionally reimplements (rather than reuses) Slidev's native `<<<`
// snippet import: Slidev only slices file content via in-file `#region`
// markers, which is unusable here since example files under the code root
// must stay completely free of any teaching/slide markup.
// Runs in a Node/Vite context (setup/transformers.ts) and in unit tests;
// deliberately has no Vue or DOM dependency.

export const DEFAULT_CODE_ROOT = 'code'

export interface ParsedSnippetImportLine {
  filePath: string
  selectorRaw: string | null
  lang: string
  /** Set via a trailing `notitle` keyword after the language, e.g. `<<< @/path java notitle`. */
  notitle: boolean
}

const SNIPPET_IMPORT_RE = /^<<<\s*([^\s[]+)/

/** Parses a `<<< @/path[selector] lang` line; returns null if the line isn't a snippet import. */
export function parseSnippetImportLine(line: string): ParsedSnippetImportLine | null {
  const m = SNIPPET_IMPORT_RE.exec(line)
  if (!m) return null
  const filePath = m[1]
  let i = m[0].length
  let selectorRaw: string | null = null
  if (line[i] === '[') {
    let j = i + 1
    let inQuotes = false
    while (j < line.length) {
      if (line[j] === '"' && line[j - 1] !== '\\') inQuotes = !inQuotes
      else if (line[j] === ']' && !inQuotes) break
      j++
    }
    if (j >= line.length) return null // unterminated selector
    selectorRaw = line.slice(i + 1, j)
    i = j + 1
  }
  const tail = line.slice(i).trim().split(/\s+/)
  const lang = tail[0] ?? ''
  const notitle = tail[1] === 'notitle'
  return { filePath, selectorRaw, lang, notitle }
}

export type SnippetSelector =
  | { kind: 'lineRange', start: number, end: number }
  | { kind: 'contentRange', startText: string, endText: string }

function unescapeQuoted(s: string): string {
  return s.replace(/\\(.)/g, '$1')
}

/** Parses the bracketed selector body (without the surrounding `[` `]`). Returns null if malformed. */
export function parseSnippetSelector(raw: string): SnippetSelector | null {
  const trimmed = raw.trim()
  const lineRangeMatch = /^(\d+)-(\d+)$/.exec(trimmed)
  if (lineRangeMatch) {
    return { kind: 'lineRange', start: Number(lineRangeMatch[1]), end: Number(lineRangeMatch[2]) }
  }
  const contentRangeMatch = /^"((?:[^"\\]|\\.)*)"\.\."((?:[^"\\]|\\.)*)"$/.exec(trimmed)
  if (contentRangeMatch) {
    return {
      kind: 'contentRange',
      startText: unescapeQuoted(contentRangeMatch[1]),
      endText: unescapeQuoted(contentRangeMatch[2]),
    }
  }
  return null
}

/**
 * Slices `fileText` per `selector`. Falls back to the whole file (with a
 * warning) when the selector is out of range or its anchor text can't be
 * found -- consistent with this feature's "degrade visibly, never break the
 * slide" philosophy.
 */
export function resolveSnippetSelector(
  fileText: string,
  selector: SnippetSelector | null,
  warn: (message: string) => void = (m) => console.warn(m),
): string {
  if (!selector) return fileText
  const lines = fileText.split(/\r?\n/)

  if (selector.kind === 'lineRange') {
    const start = selector.start - 1
    const end = selector.end - 1
    if (start < 0 || end >= lines.length || start > end) {
      warn(`[code-snippet-import] line range ${selector.start}-${selector.end} is out of bounds; showing the whole file`)
      return fileText
    }
    return lines.slice(start, end + 1).join('\n')
  }

  const startIdx = lines.findIndex(l => l.includes(selector.startText))
  if (startIdx === -1) {
    warn(`[code-snippet-import] start anchor not found: "${selector.startText}"; showing the whole file`)
    return fileText
  }
  const endIdx = lines.findIndex((l, i) => i >= startIdx && l.includes(selector.endText))
  if (endIdx === -1) {
    warn(`[code-snippet-import] end anchor not found: "${selector.endText}"; showing the whole file`)
    return fileText
  }
  return lines.slice(startIdx, endIdx + 1).join('\n')
}

/** Whether `absPath` resolves to somewhere under `<projectRoot>/<codeRoot>`. */
export function isWithinCodeRoot(absPath: string, projectRoot: string, codeRoot: string = DEFAULT_CODE_ROOT): boolean {
  // Purposefully avoids Node's `path` module so this stays usable in any
  // context; callers pass already-normalized, forward-slash absolute paths.
  const rootPrefix = `${projectRoot.replace(/\/+$/, '')}/${codeRoot.replace(/^\/+|\/+$/g, '')}/`
  return absPath.startsWith(rootPrefix)
}

/**
 * Sentinel separating a snippet's real code from appended anchor-declaration
 * lines once both are combined into a single fence's code, so they travel
 * together through the normal codeblock-transform pipeline. Plain printable
 * text rather than control/NUL bytes -- those get silently mangled somewhere
 * in Slidev/Vite's codegen pipeline before reaching the codeblocks
 * transformer (observed empirically), and this string is distinctive enough
 * to never collide with a real line of source code.
 */
export const ANCHOR_BLOCK_SENTINEL = '§§§ SLIDEV_ANCHOR_DECLARATIONS §§§'

export function combineCodeAndAnchors(code: string, anchorLines: string[]): string {
  if (anchorLines.length === 0) return code
  return `${code}\n${ANCHOR_BLOCK_SENTINEL}\n${anchorLines.join('\n')}`
}

/** Splits a combined snippet back into its real code and anchor-declaration lines. */
export function splitCodeAndAnchors(combined: string): { code: string, anchorLines: string[] } {
  const idx = combined.indexOf(`\n${ANCHOR_BLOCK_SENTINEL}\n`)
  if (idx === -1) return { code: combined, anchorLines: [] }
  const code = combined.slice(0, idx)
  const anchorLines = combined.slice(idx + ANCHOR_BLOCK_SENTINEL.length + 2).split('\n').filter(l => l.trim() !== '')
  return { code, anchorLines }
}

/** True for a bare anchor-declaration line (`[!mark:...]`), as opposed to a snippet-import line. */
export function isAnchorDeclarationLine(line: string): boolean {
  return /^\[!mark:/.test(line)
}
