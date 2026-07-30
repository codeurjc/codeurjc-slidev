// Parsing + rendering support for the inline code-highlight marker syntax:
//   // [!mark] comment
//   // [!mark:start] / // [!mark:end]     (multi-line range; nearest unclosed
//                                          start pairs with the next end, like
//                                          matching brackets)
//   // [!mark(<start>-<end>)] comment     (sub-line highlight; 0-based,
//                                          end-exclusive character indices
//                                          into the code line, not the
//                                          rendered/Shiki-wrapped HTML)
//   // [!mark@<x>,<y>] comment            (manual callout position override)
// Highlight ids are internal bookkeeping only (DOM grouping, position-map
// keys) -- presenters never write or reference them, so they're generated
// from encounter order within a code block rather than parsed from the marker.
// Runs in both a Node/Vite context (setup/transformers.ts) and in unit tests;
// deliberately has no Vue or DOM dependency.

export interface CodeHighlight {
  id: string
  kind: 'line' | 'range' | 'substring'
  startLine: number
  endLine: number
  substringRange?: { start: number, end: number }
  comment: string
  override?: { x: number, y: number }
  /** Exact original source line the marker was parsed from (for round-tripping position overrides). */
  sourceLine: string
}

const MARKER_RE = /^(.*?)(?:\/\/|#)\s*\[!mark(?::(start|end))?(?:\((\d+)-(\d+)\))?(?:@(-?\d+),(-?\d+))?\]\s*(.*)$/

interface ParsedMarkerLine {
  codePrefix: string
  role?: 'start' | 'end'
  substringRange?: { start: number, end: number }
  override?: { x: number, y: number }
  comment: string
}

/**
 * Finds the character span of a `// [!mark...]`/`# [!mark...]` marker comment
 * within a raw source line (from the comment prefix through end of line), or
 * null if the line has no marker. Exposed for external consumers (e.g. an
 * editor integration) that need to decorate/dim the marker text itself
 * without re-deriving the marker grammar.
 */
export function findMarkerSpan(line: string): { start: number, end: number } | null {
  const m = line.match(MARKER_RE)
  if (!m) return null
  return { start: m[1].length, end: line.length }
}

function parseMarkerLine(line: string): ParsedMarkerLine | null {
  const m = line.match(MARKER_RE)
  if (!m) return null
  const [, codePrefix, role, rangeStart, rangeEnd, ox, oy, comment] = m
  return {
    codePrefix: codePrefix.replace(/\s+$/, ''),
    role: role as 'start' | 'end' | undefined,
    substringRange: rangeStart !== undefined ? { start: Number(rangeStart), end: Number(rangeEnd) } : undefined,
    override: ox !== undefined ? { x: Number(ox), y: Number(oy) } : undefined,
    comment: comment.trim(),
  }
}

export function parseCodeHighlights(code: string): { code: string, highlights: CodeHighlight[] } {
  const lines = code.split('\n')
  const strippedLines: string[] = []
  const highlights: CodeHighlight[] = []
  const pendingStarts: { line: number, comment: string, override?: { x: number, y: number }, sourceLine: string }[] = []
  let nextId = 0

  lines.forEach((line, index) => {
    const parsed = parseMarkerLine(line)
    if (!parsed) {
      strippedLines.push(line)
      return
    }
    strippedLines.push(parsed.codePrefix)

    if (parsed.role === 'start') {
      pendingStarts.push({ line: index, comment: parsed.comment, override: parsed.override, sourceLine: line })
      return
    }
    if (parsed.role === 'end') {
      const start = pendingStarts.pop()
      if (!start) return // malformed: end with no matching start, ignore
      highlights.push({
        id: String(nextId++),
        kind: 'range',
        startLine: start.line,
        endLine: index,
        comment: start.comment || parsed.comment,
        override: start.override || parsed.override,
        sourceLine: start.sourceLine,
      })
      return
    }
    // single-line (whole line or substring) highlight
    highlights.push({
      id: String(nextId++),
      kind: parsed.substringRange ? 'substring' : 'line',
      startLine: index,
      endLine: index,
      substringRange: parsed.substringRange,
      comment: parsed.comment,
      override: parsed.override,
      sourceLine: line,
    })
  })

  highlights.sort((a, b) => a.startLine - b.startLine)
  return { code: strippedLines.join('\n'), highlights }
}

const ANCHOR_LINE_RE = /^\[!mark:/

/** Finds the `]` that closes an anchor declaration's `[!mark:...]`, ignoring any `]` inside quoted anchor text. */
function findTopLevelCloseBracket(line: string): number {
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"' && line[i - 1] !== '\\') inQuotes = !inQuotes
    else if (line[i] === ']' && !inQuotes) return i
  }
  return -1
}

/** Rewrites a highlight's original source line to carry (or update) an `@x,y` position override. */
export function serializeMarkerOverride(sourceLine: string, x: number, y: number): string {
  const rounded = { x: Math.round(x), y: Math.round(y) }
  if (MARKER_RE.test(sourceLine)) {
    return sourceLine.replace(
      /(\[!mark(?::(?:start|end))?(?:\(\d+-\d+\))?)(?:@-?\d+,-?\d+)?(\])/,
      `$1@${rounded.x},${rounded.y}$2`,
    )
  }
  if (ANCHOR_LINE_RE.test(sourceLine)) {
    // Anchor-declaration lines end with `]` right after their selector body
    // (optionally already carrying `@x,y`) -- same "override goes just
    // before the closing bracket" convention as inline markers. The
    // top-level `]` is found with quote-awareness since a content anchor's
    // text may itself contain `]` (e.g. array-indexing code).
    const closeIdx = findTopLevelCloseBracket(sourceLine)
    if (closeIdx === -1) return sourceLine
    const before = sourceLine.slice(0, closeIdx).replace(/@-?\d+,-?\d+$/, '')
    return `${before}@${rounded.x},${rounded.y}${sourceLine.slice(closeIdx)}`
  }
  return sourceLine
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** Base64-encodes for embedding in a data attribute; Node-only (used server-side by the transformer). */
function toBase64(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64')
}

function highlightAttrs(h: CodeHighlight): string {
  let attrs = ` data-highlight-id="${escapeAttr(h.id)}" data-source-line="${toBase64(h.sourceLine)}"`
  if (h.comment) attrs += ` data-comment="${escapeAttr(h.comment)}"`
  if (h.override) attrs += ` data-override-x="${h.override.x}" data-override-y="${h.override.y}"`
  return attrs
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'' }

/**
 * Maps each character of the line's rendered plain text back to the HTML
 * source range it occupies -- `starts[i]`/`ends[i]` bound the i-th plain
 * character's own HTML representation (1 char normally, or a whole entity
 * like `&lt;` for a single `<`). `ends[i] !== starts[i + 1]` means a tag
 * boundary (Shiki syntax-token span open/close) sits between plain
 * characters i and i+1.
 */
function buildTextMap(lineHtml: string): { plain: string, starts: number[], ends: number[] } {
  let plain = ''
  const starts: number[] = []
  const ends: number[] = []
  let i = 0
  while (i < lineHtml.length) {
    if (lineHtml[i] === '<') {
      const close = lineHtml.indexOf('>', i)
      if (close === -1) break
      i = close + 1
      continue
    }
    if (lineHtml[i] === '&') {
      const semi = lineHtml.indexOf(';', i)
      if (semi !== -1 && semi - i <= 6) {
        const entity = lineHtml.slice(i, semi + 1)
        starts.push(i)
        ends.push(semi + 1)
        plain += ENTITIES[entity] ?? entity
        i = semi + 1
        continue
      }
    }
    starts.push(i)
    ends.push(i + 1)
    plain += lineHtml[i]
    i++
  }
  return { plain, starts, ends }
}

export function wrapSubstringInLineHtml(lineHtml: string, h: CodeHighlight): string {
  const { starts, ends } = buildTextMap(lineHtml)
  const { start, end } = h.substringRange!
  if (start >= starts.length || end <= start) return lineHtml
  const clampedEnd = Math.min(end, starts.length)

  // A substring can span multiple sibling Shiki syntax-token spans (e.g.
  // highlighting `getNotasAlumno(idAlumno)` crosses an identifier span, a
  // punctuation span, and another identifier span). Naively inserting one
  // open/close tag pair at the overall start/end offsets produces invalid
  // overlapping markup whenever a tag boundary falls strictly inside that
  // range -- the browser "fixes" it by closing our span early, silently
  // truncating the highlight to just the first token. Instead, split the
  // range into maximal HTML-contiguous runs (no tag boundary inside) and
  // wrap each run in its own mark span; they share `data-highlight-id` so
  // the callout/placement code's rect-union treats them as one highlight.
  const segments: { htmlStart: number, htmlEnd: number }[] = []
  let segStart = start
  for (let i = start; i < clampedEnd; i++) {
    const isLast = i === clampedEnd - 1
    if (isLast || ends[i] !== starts[i + 1]) {
      segments.push({ htmlStart: starts[segStart], htmlEnd: ends[i] })
      segStart = i + 1
    }
  }
  if (segments.length === 0) return lineHtml

  let result = lineHtml.slice(0, segments[0].htmlStart)
  segments.forEach((seg, idx) => {
    // A single segment (the common case: substring within one syntax token)
    // keeps the plain "code-hl-mark" look (fully rounded, bordered box).
    // Multiple segments need adjoining edges "cut open" between them --
    // otherwise each segment's own border/radius reads as a separate,
    // disconnected box instead of one continuous highlight.
    let cls = 'code-hl-mark'
    if (segments.length > 1) {
      if (idx === 0) cls += ' code-hl-mark-start'
      else if (idx === segments.length - 1) cls += ' code-hl-mark-end'
      else cls += ' code-hl-mark-mid'
    }
    result += `<span class="${cls}"${highlightAttrs(h)}>${lineHtml.slice(seg.htmlStart, seg.htmlEnd)}</span>`
    const next = segments[idx + 1]
    result += next ? lineHtml.slice(seg.htmlEnd, next.htmlStart) : ''
  })
  result += lineHtml.slice(segments[segments.length - 1].htmlEnd)
  return result
}

/** Walks top-level `<span class="line">...</span>` blocks in Shiki's rendered `<code>` inner HTML. */
function mapShikiLines(inner: string, fn: (lineHtml: string, index: number) => string): string {
  const lineOpenRe = /<span class="line">/g
  let result = ''
  let cursor = 0
  let lineIndex = 0
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = lineOpenRe.exec(inner))) {
    const openEnd = m.index + m[0].length
    const tagRe = /<span\b[^>]*>|<\/span>/g
    tagRe.lastIndex = openEnd
    let depth = 1
    let closeIdx = -1
    let tagMatch: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while ((tagMatch = tagRe.exec(inner))) {
      if (tagMatch[0] === '</span>') depth--
      else depth++
      if (depth === 0) {
        closeIdx = tagMatch.index
        break
      }
    }
    if (closeIdx === -1) break
    result += inner.slice(cursor, openEnd)
    const lineHtml = inner.slice(openEnd, closeIdx)
    result += fn(lineHtml, lineIndex)
    cursor = closeIdx
    lineIndex++
    lineOpenRe.lastIndex = closeIdx
  }
  result += inner.slice(cursor)
  return result
}

// --- External highlight anchors -----------------------------------------
// Grammar for attaching highlights/callouts to file-sourced (snippet-import)
// code from slides.md, without any marker text in the source file itself:
//   [!mark:N] comment                  line anchor (1-based, within the
//                                       snippet as rendered/sliced)
//   [!mark:N..M] comment               line range anchor
//   [!mark:"text"] comment             content anchor (whole matched line)
//   [!mark:"text"(<start>-<end>)]      content anchor + substring range
//   [!mark:"a".."b"] comment           content range anchor (inclusive)
//   [!mark:"a"+N] comment              content anchor + N-line offset range
//   [!mark:"text"#2] comment           Nth occurrence of a content anchor
//   [!mark:"text"#*] comment           every occurrence, one highlight each
//   [!mark:...@<x>,<y>] comment        manual callout position override
// Unlike inline markers, these are standalone lines (no `//`/`#` comment
// prefix) -- they never touch the imported file, only slides.md.

interface ExternalAnchorSpec {
  kind: 'line' | 'lineRange' | 'content' | 'contentRange'
  line?: number
  endLine?: number
  text?: string
  endText?: string
  offset?: number
  substringRange?: { start: number, end: number }
  occurrence?: number | 'all'
  override?: { x: number, y: number }
  comment: string
  sourceLine: string
}

/** Parses one `[!mark:...]` anchor-declaration line. Returns null if malformed. */
function parseAnchorLine(line: string): ExternalAnchorSpec | null {
  if (!line.startsWith('[!mark:')) return null
  const n = line.length
  let i = '[!mark:'.length

  function parseQuoted(): string | null {
    if (line[i] !== '"') return null
    i++
    let out = ''
    while (i < n && line[i] !== '"') {
      if (line[i] === '\\' && i + 1 < n) {
        out += line[i + 1]
        i += 2
      } else {
        out += line[i]
        i++
      }
    }
    if (line[i] !== '"') return null // unterminated
    i++
    return out
  }

  function parseUInt(): number | null {
    const m = /^\d+/.exec(line.slice(i))
    if (!m) return null
    i += m[0].length
    return Number(m[0])
  }

  const spec: Partial<ExternalAnchorSpec> = {}

  if (line[i] === '"') {
    const text = parseQuoted()
    if (text === null) return null
    spec.text = text

    if (line[i] === '.' && line[i + 1] === '.') {
      i += 2
      const endText = parseQuoted()
      if (endText === null) return null
      spec.endText = endText
      spec.kind = 'contentRange'
    } else if (line[i] === '+') {
      i++
      const offset = parseUInt()
      if (offset === null) return null
      spec.offset = offset
      spec.kind = 'contentRange'
    } else {
      spec.kind = 'content'
    }

    if (line[i] === '(') {
      const m = /^\((\d+)-(\d+)\)/.exec(line.slice(i))
      if (!m) return null
      spec.substringRange = { start: Number(m[1]), end: Number(m[2]) }
      i += m[0].length
    }

    if (line[i] === '#') {
      const m = /^#(\d+|\*)/.exec(line.slice(i))
      if (!m) return null
      spec.occurrence = m[1] === '*' ? 'all' : Number(m[1])
      i += m[0].length
    }
  } else {
    const line1 = parseUInt()
    if (line1 === null) return null
    spec.line = line1
    if (line[i] === '.' && line[i + 1] === '.') {
      i += 2
      const line2 = parseUInt()
      if (line2 === null) return null
      spec.endLine = line2
      spec.kind = 'lineRange'
    } else {
      spec.kind = 'line'
    }
  }

  if (line[i] === '@') {
    const m = /^@(-?\d+),(-?\d+)/.exec(line.slice(i))
    if (!m) return null
    spec.override = { x: Number(m[1]), y: Number(m[2]) }
    i += m[0].length
  }

  if (line[i] !== ']') return null
  i++

  return { ...spec, comment: line.slice(i).trim(), sourceLine: line } as ExternalAnchorSpec
}

export interface ExternalAnchorWarnings {
  onWarn?: (message: string) => void
  /** Called for authoring errors (e.g. an explicit occurrence index out of range) -- distinct from drift/degradation warnings. */
  onError?: (message: string) => void
}

/**
 * Resolves anchor-declaration lines against already-sliced snippet text into
 * the same `CodeHighlight` shape inline markers produce, so both feed the
 * same rendering/placement pipeline. Unresolved or ambiguous anchors degrade
 * (skip + warn) rather than mis-highlighting -- see design.md for rationale.
 */
export function parseExternalHighlightAnchors(
  code: string,
  anchorLines: string[],
  { onWarn = (m: string) => console.warn(m), onError = (m: string) => { throw new Error(m) } }: ExternalAnchorWarnings = {},
): CodeHighlight[] {
  const lines = code.split('\n')
  const highlights: CodeHighlight[] = []
  let nextId = 0

  interface TextMatch { line: number, start: number, end: number }

  const findOccurrences = (text: string): TextMatch[] =>
    lines.reduce<TextMatch[]>((acc, l, idx) => {
      const start = l.indexOf(text)
      if (start !== -1) acc.push({ line: idx, start, end: start + text.length })
      return acc
    }, [])

  function pickOccurrences(text: string, occurrences: TextMatch[], occurrence?: number | 'all'): TextMatch[] {
    if (occurrences.length === 0) {
      onWarn(`[code-highlight] anchor text not found: "${text}"`)
      return []
    }
    if (occurrence === 'all') return occurrences
    if (typeof occurrence === 'number') {
      if (occurrence < 1 || occurrence > occurrences.length) {
        onError(`[code-highlight] anchor "${text}"#${occurrence} is out of range (${occurrences.length} match(es) found)`)
        return []
      }
      return [occurrences[occurrence - 1]]
    }
    if (occurrences.length > 1) {
      onWarn(`[code-highlight] anchor text "${text}" matches ${occurrences.length} times; highlighting the first match`)
    }
    return [occurrences[0]]
  }

  for (const anchorLine of anchorLines) {
    if (!anchorLine.trim()) continue
    const spec = parseAnchorLine(anchorLine.trim())
    if (!spec) continue // malformed anchor declaration: ignore

    if (spec.kind === 'line') {
      const idx = spec.line! - 1
      if (idx < 0 || idx >= lines.length) {
        onWarn(`[code-highlight] anchor line ${spec.line} is out of range`)
        continue
      }
      highlights.push({ id: String(nextId++), kind: 'line', startLine: idx, endLine: idx, comment: spec.comment, override: spec.override, sourceLine: spec.sourceLine })
      continue
    }

    if (spec.kind === 'lineRange') {
      const start = spec.line! - 1
      const end = spec.endLine! - 1
      if (start < 0 || end >= lines.length || start > end) {
        onWarn(`[code-highlight] anchor line range ${spec.line}..${spec.endLine} is out of range`)
        continue
      }
      highlights.push({ id: String(nextId++), kind: 'range', startLine: start, endLine: end, comment: spec.comment, override: spec.override, sourceLine: spec.sourceLine })
      continue
    }

    if (spec.kind === 'content') {
      const picked = pickOccurrences(spec.text!, findOccurrences(spec.text!), spec.occurrence)
      for (const occ of picked) {
        // Default (no explicit substring range): highlight exactly the
        // matched text, not the whole line -- an explicit `(start-end)`
        // still overrides this to highlight a different span of the
        // matched line than the anchor text itself.
        const substringRange = spec.substringRange ?? { start: occ.start, end: occ.end }
        highlights.push({
          id: String(nextId++),
          kind: 'substring',
          startLine: occ.line,
          endLine: occ.line,
          substringRange,
          comment: spec.comment,
          override: spec.override,
          sourceLine: spec.sourceLine,
        })
      }
      continue
    }

    if (spec.kind === 'contentRange') {
      const startPicked = pickOccurrences(spec.text!, findOccurrences(spec.text!), spec.occurrence)
      if (startPicked.length === 0) continue
      const startIdx = startPicked[0].line
      let endIdx: number
      if (spec.endText !== undefined) {
        const endOccurrences = findOccurrences(spec.endText).filter(occ => occ.line >= startIdx)
        if (endOccurrences.length === 0) {
          onWarn(`[code-highlight] anchor range end text not found: "${spec.endText}"`)
          continue
        }
        if (endOccurrences.length > 1) {
          onWarn(`[code-highlight] anchor range end text "${spec.endText}" matches multiple times; using the first at or after the start`)
        }
        endIdx = endOccurrences[0].line
      } else {
        endIdx = Math.min(startIdx + spec.offset!, lines.length - 1)
      }
      highlights.push({ id: String(nextId++), kind: 'range', startLine: startIdx, endLine: endIdx, comment: spec.comment, override: spec.override, sourceLine: spec.sourceLine })
    }
  }

  highlights.sort((a, b) => a.startLine - b.startLine)
  return highlights
}

// --- Inline source-link marker ---------------------------------------------
// A standalone `// [!source <url>]` (or `#`-comment) line inside a hand-typed
// fenced code block (one with no backing `<<<` import, so no file path to
// auto-detect a link from) attaches a manual source link to that block. It's
// a whole line, not a trailing comment on a code line -- stripped from the
// rendered code like `[!mark]` markers are.

const INLINE_SOURCE_MARKER_RE = /^\s*(?:\/\/|#)\s*\[!source\s+(\S+)\]\s*$/

/** True for a standalone inline `// [!source <url>]` marker line. */
export function isInlineSourceMarkerLine(line: string): boolean {
  return INLINE_SOURCE_MARKER_RE.test(line)
}

/**
 * Strips any inline `// [!source <url>]` marker line out of `code`, returning
 * the cleaned code plus the last such URL found (multiple markers in one
 * block would be an authoring mistake; the last one wins rather than
 * erroring, consistent with this feature's degrade-quietly philosophy).
 */
export function extractInlineSourceLink(code: string): { code: string, url: string | null } {
  let url: string | null = null
  const lines = code.split('\n').filter((line) => {
    const m = INLINE_SOURCE_MARKER_RE.exec(line)
    if (!m) return true
    url = m[1]
    return false
  })
  return { code: lines.join('\n'), url }
}

/** Injects `data-highlight-id`/`data-comment` spans into Shiki-rendered HTML for the given highlights. */
export function injectHighlightSpans(html: string, highlights: CodeHighlight[]): string {
  if (highlights.length === 0) return html
  return html.replace(/(<code[^>]*>)([\s\S]*)(<\/code>)/, (_full, openTag, inner, closeTag) => {
    const newInner = mapShikiLines(inner, (lineHtml, index) => {
      let out = lineHtml
      for (const h of highlights) {
        if (index < h.startLine || index > h.endLine) continue
        if (h.kind === 'substring' && h.substringRange && index === h.startLine) {
          out = wrapSubstringInLineHtml(out, h)
        } else {
          out = `<span class="code-hl-mark"${highlightAttrs(h)}>${out}</span>`
        }
      }
      return out
    })
    return `${openTag}${newInner}${closeTag}`
  })
}
