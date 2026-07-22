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

/** Rewrites a highlight's original source line to carry (or update) an `@x,y` position override. */
export function serializeMarkerOverride(sourceLine: string, x: number, y: number): string {
  const rounded = { x: Math.round(x), y: Math.round(y) }
  if (MARKER_RE.test(sourceLine)) {
    return sourceLine.replace(
      /(\[!mark(?::(?:start|end))?(?:\(\d+-\d+\))?)(?:@-?\d+,-?\d+)?(\])/,
      `$1@${rounded.x},${rounded.y}$2`,
    )
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

/** Maps each character of the line's rendered plain text back to its HTML source offset. */
function buildTextMap(lineHtml: string): { plain: string, map: number[] } {
  let plain = ''
  const map: number[] = []
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
        map.push(i)
        plain += ENTITIES[entity] ?? entity
        i = semi + 1
        continue
      }
    }
    map.push(i)
    plain += lineHtml[i]
    i++
  }
  return { plain, map }
}

export function wrapSubstringInLineHtml(lineHtml: string, h: CodeHighlight): string {
  const { map } = buildTextMap(lineHtml)
  const { start, end } = h.substringRange!
  if (start >= map.length || end <= start) return lineHtml
  const startHtml = map[start]
  const endHtml = end < map.length ? map[end] : lineHtml.length
  return (
    lineHtml.slice(0, startHtml)
    + `<span class="code-hl-mark"${highlightAttrs(h)}>`
    + lineHtml.slice(startHtml, endHtml)
    + '</span>'
    + lineHtml.slice(endHtml)
  )
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
