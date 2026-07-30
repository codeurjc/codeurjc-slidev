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

/**
 * Scans a `<<< @/path[selector] lang` line for the file-path end position and
 * the `[selector]` bracket span (if any), shared by `parseSnippetImportLine`
 * and `serializeSnippetSelector` so both agree on exactly the same position.
 * Returns null if the line isn't a snippet import, or its selector bracket is
 * unterminated.
 */
function scanSnippetImportLine(line: string): { filePath: string, fileEndIndex: number, bracketStart: number, bracketEnd: number } | null {
  const m = SNIPPET_IMPORT_RE.exec(line)
  if (!m) return null
  const filePath = m[1]
  const fileEndIndex = m[0].length
  let bracketStart = -1
  let bracketEnd = -1
  if (line[fileEndIndex] === '[') {
    let j = fileEndIndex + 1
    let inQuotes = false
    while (j < line.length) {
      if (line[j] === '"' && line[j - 1] !== '\\') inQuotes = !inQuotes
      else if (line[j] === ']' && !inQuotes) break
      j++
    }
    if (j >= line.length) return null // unterminated selector
    bracketStart = fileEndIndex
    bracketEnd = j + 1 // exclusive, past the closing ]
  }
  return { filePath, fileEndIndex, bracketStart, bracketEnd }
}

/** Parses a `<<< @/path[selector] lang` line; returns null if the line isn't a snippet import. */
export function parseSnippetImportLine(line: string): ParsedSnippetImportLine | null {
  const scanned = scanSnippetImportLine(line)
  if (!scanned) return null
  const { filePath, fileEndIndex, bracketStart, bracketEnd } = scanned
  const selectorRaw = bracketStart === -1 ? null : line.slice(bracketStart + 1, bracketEnd - 1)
  const tail = line.slice(bracketStart === -1 ? fileEndIndex : bracketEnd).trim().split(/\s+/)
  const lang = tail[0] ?? ''
  const notitle = tail[1] === 'notitle'
  return { filePath, selectorRaw, lang, notitle }
}

/**
 * Writes `newSelectorRaw` into an existing `<<<` import line's `[selector]`
 * bracket -- replacing one if present, inserting one if absent -- leaving the
 * file path, language, and any trailing keywords (e.g. `notitle`) unchanged.
 * The write-back counterpart to `parseSnippetImportLine`, for editor tooling
 * that computes a selector and needs to splice it in without re-deriving this
 * line's bracket position. Returns null if `line` isn't a snippet import.
 */
export function serializeSnippetSelector(line: string, newSelectorRaw: string): string | null {
  const scanned = scanSnippetImportLine(line)
  if (!scanned) return null
  const { fileEndIndex, bracketStart, bracketEnd } = scanned
  if (bracketStart === -1) {
    return `${line.slice(0, fileEndIndex)}[${newSelectorRaw}]${line.slice(fileEndIndex)}`
  }
  return `${line.slice(0, bracketStart)}[${newSelectorRaw}]${line.slice(bracketEnd)}`
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

export interface ResolvedSnippet {
  text: string
  /** 1-based, inclusive -- the real line numbers within `fileText` that `text` was sliced from. */
  startLine: number
  endLine: number
}

/**
 * Slices `fileText` per `selector`, also reporting the real 1-based line
 * numbers the slice came from (used to build GitHub line-range links).
 * Falls back to the whole file (with a warning) when the selector is out of
 * range or its anchor text can't be found -- consistent with this feature's
 * "degrade visibly, never break the slide" philosophy.
 */
export function resolveSnippetSelector(
  fileText: string,
  selector: SnippetSelector | null,
  warn: (message: string) => void = (m) => console.warn(m),
): ResolvedSnippet {
  const lines = fileText.split(/\r?\n/)

  if (!selector) return { text: fileText, startLine: 1, endLine: lines.length }

  if (selector.kind === 'lineRange') {
    const start = selector.start - 1
    const end = selector.end - 1
    if (start < 0 || end >= lines.length || start > end) {
      warn(`[code-snippet-import] line range ${selector.start}-${selector.end} is out of bounds; showing the whole file`)
      return { text: fileText, startLine: 1, endLine: lines.length }
    }
    return { text: lines.slice(start, end + 1).join('\n'), startLine: selector.start, endLine: selector.end }
  }

  const startIdx = lines.findIndex(l => l.includes(selector.startText))
  if (startIdx === -1) {
    warn(`[code-snippet-import] start anchor not found: "${selector.startText}"; showing the whole file`)
    return { text: fileText, startLine: 1, endLine: lines.length }
  }
  const endIdx = lines.findIndex((l, i) => i >= startIdx && l.includes(selector.endText))
  if (endIdx === -1) {
    warn(`[code-snippet-import] end anchor not found: "${selector.endText}"; showing the whole file`)
    return { text: fileText, startLine: 1, endLine: lines.length }
  }
  return { text: lines.slice(startIdx, endIdx + 1).join('\n'), startLine: startIdx + 1, endLine: endIdx + 1 }
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

// --- Source-link directive ------------------------------------------------
// A `[!source ...]` line, standalone like an anchor-declaration line, placed
// immediately after a `<<<` import line to override that import's
// auto-detected GitHub source link:
//   [!source]                    default: let auto-detection decide
//   [!source https://...]        override the URL
//   [!source none]                suppress the link entirely
//   [!source bottom]              force bottom-row placement (keep any auto-
//                                  detected/default URL)
//   [!source bottom https://...]  both: force bottom-row placement AND override the URL

export interface SourceDirective {
  mode: 'auto' | 'url' | 'none'
  url?: string
  bottom: boolean
}

/** True for a bare source-link directive line (`[!source...]`), as opposed to a snippet-import or anchor-declaration line. */
export function isSourceDirectiveLine(line: string): boolean {
  return /^\[!source(?:\s|\])/.test(line)
}

const SOURCE_DIRECTIVE_RE = /^\[!source(?:\s+([^\]]*))?\]\s*$/

/** Parses a `[!source ...]` directive line. Returns null if malformed. */
export function parseSourceDirective(line: string): SourceDirective | null {
  const m = SOURCE_DIRECTIVE_RE.exec(line.trim())
  if (!m) return null
  const tokens = (m[1] ?? '').trim().split(/\s+/).filter(Boolean)
  if (tokens.includes('none')) return { mode: 'none', bottom: false }
  const bottom = tokens.includes('bottom')
  const url = tokens.find(t => t !== 'bottom')
  if (url) return { mode: 'url', url, bottom }
  return { mode: 'auto', bottom }
}

// --- Source-link payload sentinel ------------------------------------------
// A resolved (or overridden) source link for a `<<<` import is threaded from
// the `pre` transformer stage to the `codeblocks` stage the same way anchor
// declarations are: appended behind a distinct sentinel, layered *outside*
// the anchor-lines sentinel so splitting one never has to know about the
// other (see setup/transformers.ts: split source-link first, then anchors).

export const SOURCE_LINK_SENTINEL = '§§§ SLIDEV_SOURCE_LINK §§§'

export interface CombinedSourceLink {
  url: string
  /** Force bottom-row placement even if the code block has a visible title. */
  bottom: boolean
}

export function combineWithSourceLink(payload: string, link: CombinedSourceLink | null): string {
  if (!link) return payload
  return `${payload}\n${SOURCE_LINK_SENTINEL}\n${JSON.stringify(link)}`
}

/** Splits a source-link-combined payload back into the inner payload and the resolved link (if any). */
export function splitSourceLink(combined: string): { payload: string, link: CombinedSourceLink | null } {
  const idx = combined.indexOf(`\n${SOURCE_LINK_SENTINEL}\n`)
  if (idx === -1) return { payload: combined, link: null }
  const payload = combined.slice(0, idx)
  const jsonStr = combined.slice(idx + SOURCE_LINK_SENTINEL.length + 2)
  try {
    return { payload, link: JSON.parse(jsonStr) }
  } catch {
    return { payload, link: null }
  }
}
