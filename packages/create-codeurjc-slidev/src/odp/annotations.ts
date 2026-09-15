import type { ClassifiedSlide, CodeShape } from './classify'
import type { OdpShape, Rect } from './model'
import {
  BOX_LINE_HEIGHT_RATIO,
  CONNECTOR_DISTANCE_CM,
  LABEL_TOP_DISTANCE_CM,
  LINE_CENTER_MARGIN_LINES,
  LINE_HEIGHT_FACTOR,
  MONO_CHAR_WIDTH_EM,
  PT_TO_CM,
  SUBSTRING_MAX_WIDTH_FRACTION,
} from './constants'
import { mapPoint } from './geometry'
import { shapeText } from './model'

// Turns highlight rectangles, labels, connectors and callout boxes drawn over
// code into code-highlight marks: line/range/substring highlights with a
// callout comment and an `@x,y` position. Also renders marks as inline
// trailing-comment markers (hand-typed fences) or anchor-declaration lines
// (`<<<` imports).

export interface CodeMark {
  kind: 'line' | 'range' | 'substring'
  /** 0-based indexes into the code block's (trimmed) lines. */
  startLine: number
  endLine: number
  /** Character range within the line, for substring marks. */
  substring?: { start: number, end: number }
  comment: string
  override?: { x: number, y: number }
  click?: number
}

export interface AnnotationResult {
  marksByCode: Map<CodeShape, CodeMark[]>
  consumedTexts: Set<OdpShape>
  consumedConnectors: Set<OdpShape>
  losses: string[]
}

const DEFAULT_PADDING_LEFT_CM = 0.25
const LABEL_MAX_CHARS = 40

interface LineGeometry {
  top: number
  lineHeight: number
  left: number
  charWidth: number
  /** Raw paragraph lines (tabs expanded, before trimming leading blank lines) and how many leading blanks were trimmed. */
  rawLines: string[]
  leadingBlank: number
}

function lineGeometry(code: OdpShape): LineGeometry | undefined {
  const rect = code.rect
  if (!rect)
    return undefined
  const rawLines = shapeText(code).replace(/\t/g, '    ').split('\n')
  const leadingBlank = Math.max(0, rawLines.findIndex(l => l.trim() !== ''))
  const sizes = new Map<number, number>()
  for (const p of code.paragraphs) {
    for (const r of p.runs) {
      if (r.fontSizePt)
        sizes.set(r.fontSizePt, (sizes.get(r.fontSizePt) ?? 0) + r.text.length)
    }
  }
  const fontPt = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const fontLineHeight = fontPt ? fontPt * LINE_HEIGHT_FACTOR * PT_TO_CM : undefined
  const boxLineHeight = (rect.h - code.paddingTop - (code.paddingBottom ?? code.paddingTop)) / Math.max(1, rawLines.length)
  // An auto-grown frame's height is exactly its text's height, which beats any font-metric estimate.
  const lineHeight = fontLineHeight
    && boxLineHeight >= fontLineHeight * BOX_LINE_HEIGHT_RATIO.min
    && boxLineHeight <= fontLineHeight * BOX_LINE_HEIGHT_RATIO.max
    ? boxLineHeight
    : fontLineHeight ?? boxLineHeight
  const charWidth = (fontPt ?? lineHeight / (LINE_HEIGHT_FACTOR * PT_TO_CM)) * MONO_CHAR_WIDTH_EM * PT_TO_CM
  return { top: rect.y + code.paddingTop, lineHeight, left: rect.x + DEFAULT_PADDING_LEFT_CM, charWidth, rawLines, leadingBlank }
}

/** Raw indexes of the non-blank lines whose vertical center lies inside `r` (by a margin), or undefined when none do. */
function linesInside(geom: LineGeometry, r: Rect): { first: number, last: number } | undefined {
  const margin = LINE_CENTER_MARGIN_LINES * geom.lineHeight
  const inside: number[] = []
  geom.rawLines.forEach((line, i) => {
    const center = geom.top + (i + 0.5) * geom.lineHeight
    if (line.trim() !== '' && center > r.y + margin && center < r.y + r.h - margin)
      inside.push(i)
  })
  return inside.length > 0 ? { first: inside[0], last: inside[inside.length - 1] } : undefined
}

function distanceToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w))
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h))
  return Math.hypot(dx, dy)
}

/** The non-blank line closest to raw line `index` (the later one on a tie), or undefined when the code has none. */
function nearestNonBlankLine(geom: LineGeometry, index: number): number | undefined {
  for (let d = 0; d < geom.rawLines.length; d++) {
    for (const candidate of [index + d, index - d]) {
      if (candidate >= 0 && candidate < geom.rawLines.length && geom.rawLines[candidate].trim() !== '')
        return candidate
    }
  }
  return undefined
}

/** Candidate endpoint pairs for a connector: real endpoints for lines, diagonals/midline for arrow shapes. */
function endpointPairs(connector: OdpShape): [number, number, number, number][] {
  if (connector.endpoints) {
    const { x1, y1, x2, y2 } = connector.endpoints
    return [[x1, y1, x2, y2]]
  }
  const r = connector.rect
  if (!r)
    return []
  return [
    [r.x, r.y, r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h, r.x + r.w, r.y],
    [r.x, r.y + r.h / 2, r.x + r.w, r.y + r.h / 2],
  ]
}

/** Snaps a column range to the non-whitespace tokens it overlaps. */
function snapToTokens(line: string, start: number, end: number): { start: number, end: number } | undefined {
  const tokens = [...line.matchAll(/\S+/g)].map(m => ({ start: m.index!, end: m.index! + m[0].length }))
  const covered = tokens.filter(t => t.end > start && t.start < end)
  if (covered.length === 0)
    return undefined
  return { start: covered[0].start, end: covered[covered.length - 1].end }
}

function oneLine(shape: OdpShape): string {
  return shapeText(shape).replace(/\s+/g, ' ').trim()
}

export function annotateCodes(slide: ClassifiedSlide, region: Rect): AnnotationResult {
  const result: AnnotationResult = { marksByCode: new Map(), consumedTexts: new Set(), consumedConnectors: new Set(), losses: [] }
  const texts = slide.texts.filter(t => t.rect)
  const addMark = (code: CodeShape, mark: CodeMark) => {
    const marks = result.marksByCode.get(code) ?? []
    marks.push(mark)
    result.marksByCode.set(code, marks)
  }

  /** The short label drawn at the top of a box (smallest distance to its top edge), if any. */
  const labelFor = (r: Rect): OdpShape | undefined => texts
    .filter((t) => {
      const cx = t.rect!.x + t.rect!.w / 2
      const cy = t.rect!.y + t.rect!.h / 2
      // Labels often stick out past the box edge, so only their center has to be inside.
      return !result.consumedTexts.has(t) && oneLine(t).length <= LABEL_MAX_CHARS
        && distanceToRect(cx, cy, r) === 0 && Math.abs(t.rect!.y - r.y) <= LABEL_TOP_DISTANCE_CM
    })
    .sort((a, b) => Math.abs(a.rect!.y - r.y) - Math.abs(b.rect!.y - r.y))[0]

  // Smaller boxes first, so a label sitting inside nested boxes goes to the innermost one it tops.
  const rects = [...slide.annotationRects].sort((a, b) => a.rect!.w * a.rect!.h - b.rect!.w * b.rect!.h)
  for (const rect of rects) {
    const r = rect.rect!
    const code = slide.codes.find(c => c.shape.rect && distanceToRect(r.x + r.w / 2, r.y + r.h / 2, c.shape.rect) === 0)
    const geom = code ? lineGeometry(code.shape) : undefined
    const inside = geom ? linesInside(geom, r) : undefined
    if (!code || !geom || !inside) {
      result.losses.push('highlight box not aligned to code lines')
      continue
    }
    const start = inside.first - geom.leadingBlank
    const end = inside.last - geom.leadingBlank
    const mark: CodeMark = { kind: start === end ? 'line' : 'range', startLine: start, endLine: end, comment: '' }

    const codeRect = code.shape.rect!
    if (start === end && r.w < codeRect.w * SUBSTRING_MAX_WIDTH_FRACTION) {
      const line = geom.rawLines[inside.first]
      const colStart = Math.max(0, Math.round((r.x - geom.left) / geom.charWidth))
      const colEnd = Math.round((r.x + r.w - geom.left) / geom.charWidth)
      const snapped = snapToTokens(line, colStart, colEnd)
      // A narrow box is a substring highlight unless it truly covers the
      // whole raw line (indentation included).
      if (snapped && !(snapped.start === 0 && snapped.end >= line.length)) {
        mark.kind = 'substring'
        mark.substring = snapped
      }
    }

    const label = labelFor(r)
    if (label) {
      mark.comment = oneLine(label)
      result.consumedTexts.add(label)
    }
    else {
      // Otherwise a connector from the box to a text box makes that text box its callout.
      for (const connector of slide.connectors) {
        if (result.consumedConnectors.has(connector))
          continue
        const paired = pairConnector(connector, r, texts, result.consumedTexts)
        if (paired) {
          mark.comment = oneLine(paired)
          mark.override = mapPoint(paired.rect!.x, paired.rect!.y, region)
          result.consumedTexts.add(paired)
          result.consumedConnectors.add(connector)
          break
        }
      }
    }
    addMark(code, mark)
  }

  // A frame around the whole code block is only a highlight when it carries a label.
  for (const { code, shape } of slide.codeFrames) {
    const label = shape.rect ? labelFor(shape.rect) : undefined
    const geom = lineGeometry(code.shape)
    if (!label || !geom)
      continue
    const nonBlank = geom.rawLines.map((l, i) => (l.trim() ? i : -1)).filter(i => i !== -1)
    const start = nonBlank[0] - geom.leadingBlank
    const end = nonBlank[nonBlank.length - 1] - geom.leadingBlank
    addMark(code, { kind: start === end ? 'line' : 'range', startLine: start, endLine: end, comment: oneLine(label) })
    result.consumedTexts.add(label)
  }

  // Arrow-only callouts: a connector from a text box straight into code highlights the nearest line.
  for (const connector of slide.connectors) {
    if (result.consumedConnectors.has(connector))
      continue
    let done = false
    for (const [ax, ay, bx, by] of endpointPairs(connector)) {
      for (const [cx, cy, tx, ty] of [[ax, ay, bx, by], [bx, by, ax, ay]]) {
        const code = slide.codes.find(c => c.shape.rect && distanceToRect(cx, cy, c.shape.rect) === 0)
        const text = texts.find(t => !result.consumedTexts.has(t) && distanceToRect(tx, ty, t.rect!) <= CONNECTOR_DISTANCE_CM)
        const geom = code ? lineGeometry(code.shape) : undefined
        if (!code || !text || !geom)
          continue
        const raw = nearestNonBlankLine(geom, Math.floor((cy - geom.top) / geom.lineHeight))
        const line = raw === undefined ? -1 : raw - geom.leadingBlank
        if (line < 0 || line >= geom.rawLines.length - geom.leadingBlank)
          continue
        addMark(code, {
          kind: 'line',
          startLine: line,
          endLine: line,
          comment: oneLine(text),
          override: mapPoint(text.rect!.x, text.rect!.y, region),
        })
        result.consumedTexts.add(text)
        result.consumedConnectors.add(connector)
        done = true
        break
      }
      if (done)
        break
    }
  }

  for (const marks of result.marksByCode.values())
    marks.sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine)
  return result
}

function pairConnector(connector: OdpShape, box: Rect, texts: OdpShape[], consumed: Set<OdpShape>): OdpShape | undefined {
  for (const [ax, ay, bx, by] of endpointPairs(connector)) {
    for (const [px, py, qx, qy] of [[ax, ay, bx, by], [bx, by, ax, ay]]) {
      if (distanceToRect(px, py, box) > CONNECTOR_DISTANCE_CM)
        continue
      const text = texts.find(t => !consumed.has(t) && distanceToRect(qx, qy, t.rect!) <= CONNECTOR_DISTANCE_CM)
      if (text)
        return text
    }
  }
  return undefined
}

// --- Rendering marks -----------------------------------------------------------

function suffix(mark: CodeMark): string {
  return `${mark.click ? `{${mark.click}}` : ''}${mark.override ? `@${mark.override.x},${mark.override.y}` : ''}`
}

function withComment(marker: string, comment: string): string {
  return comment ? `${marker} ${comment}` : marker
}

/**
 * Appends inline `// [!mark...]` (or `#`) markers to a hand-typed fence's
 * lines. Only one marker fits per line, so a mark needing an already-used
 * line is reported as a loss. Narrower marks are placed first: a box around a
 * few lines says more than a frame around the whole block it shares a line with.
 */
export function renderInlineMarks(lines: string[], marks: CodeMark[], token: '//' | '#' | undefined): { lines: string[], losses: string[] } {
  if (marks.length === 0)
    return { lines, losses: [] }
  if (!token)
    return { lines, losses: marks.map(() => 'code highlight omitted (this language has no line comments for inline markers)') }
  const out = [...lines]
  const used = new Set<number>()
  const losses: string[] = []
  const put = (index: number, marker: string) => {
    out[index] = `${out[index]} ${token} ${marker}`
    used.add(index)
  }
  const bySpan = [...marks].sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))
  for (const mark of bySpan) {
    if (mark.kind === 'range') {
      if (used.has(mark.startLine) || used.has(mark.endLine)) {
        losses.push('code highlight omitted (another marker already uses that line)')
        continue
      }
      put(mark.startLine, withComment(`[!mark:start${suffix(mark)}]`, mark.comment))
      put(mark.endLine, '[!mark:end]')
    }
    else {
      if (used.has(mark.startLine)) {
        losses.push('code highlight omitted (another marker already uses that line)')
        continue
      }
      const range = mark.kind === 'substring' && mark.substring ? `(${mark.substring.start}-${mark.substring.end})` : ''
      put(mark.startLine, withComment(`[!mark${range}${suffix(mark)}]`, mark.comment))
    }
  }
  return { lines: out, losses }
}

function quoteAnchor(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Renders marks as anchor-declaration lines for a `<<<` import. `mapLine`
 * maps a code-block line index to its 1-based line within the imported
 * snippet (undefined when the line has no counterpart there).
 */
export function renderAnchorMarks(
  blockLines: string[],
  snippetLines: string[],
  marks: CodeMark[],
  mapLine: (index: number) => number | undefined,
): { anchors: string[], losses: string[] } {
  const anchors: string[] = []
  const losses: string[] = []
  for (const mark of marks) {
    const start = mapLine(mark.startLine)
    const end = mapLine(mark.endLine)
    if (start === undefined || end === undefined) {
      losses.push('code highlight omitted (its line is not in the imported file)')
      continue
    }
    if (mark.kind === 'substring' && mark.substring) {
      const text = blockLines[mark.startLine].slice(mark.substring.start, mark.substring.end)
      const matching = snippetLines.map((l, i) => (l.includes(text) ? i + 1 : -1)).filter(i => i !== -1)
      const occurrence = matching.indexOf(start) + 1
      if (text && occurrence > 0) {
        const selector = matching.length > 1 ? `#${occurrence}` : ''
        anchors.push(withComment(`[!mark:"${quoteAnchor(text)}"${selector}${suffix(mark)}]`, mark.comment))
        continue
      }
      anchors.push(withComment(`[!mark:${start}${suffix(mark)}]`, mark.comment))
      continue
    }
    const target = start === end ? `${start}` : `${start}..${end}`
    anchors.push(withComment(`[!mark:${target}${suffix(mark)}]`, mark.comment))
  }
  return { anchors, losses }
}
