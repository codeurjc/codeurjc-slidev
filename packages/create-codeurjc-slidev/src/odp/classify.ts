import type { OdpDeck, OdpShape, OdpSlide, Paragraph, Rect } from './model'
import {
  CODE_FRAME_COVERAGE,
  COVER_SEARCH_SLIDES,
  DATE_RE,
  DEFAULT_FONT_SIZE_PT,
  HEADING_MAX_CHARS,
  LABEL_DISTANCE_CM,
  LINE_HEIGHT_FACTOR,
  MONO_FILENAME_RE,
  MONO_RATIO,
  PROJECT_LABEL_RE,
  PT_TO_CM,
  TITLE_BAND_TOP_FRACTION,
  TITLE_MAX_CHARS,
} from './constants'
import { flattenShapes, paragraphText, shapeText } from './model'

// Assigns every shape of a slide a role (title, body, code, label, link,
// image, table, annotation rectangle, connector, candidate callout text,
// decoration) and recognizes cover/copyright slides. Pure: works on the
// parsed model only.

export type SlideRole = 'cover' | 'copyright' | 'content'

export interface CoverFields {
  subject?: string
  lesson?: string
  title?: string
  date?: string
  authors?: string
}

export interface CodeShape {
  shape: OdpShape
  /** A filename label (e.g. `ListTest.java`) placed on the code shape's edge -- becomes the fence title. */
  label?: string
  /** A project label (e.g. `ejem1`) near the code shape -- a code-matching hint, never rendered. */
  projectLabel?: string
  /** A bordered non-monospace box of shell prompt lines. */
  terminal: boolean
}

export interface ClassifiedSlide {
  slide: OdpSlide
  role: SlideRole
  cover?: CoverFields
  /** 0-2 title lines. */
  titleLines: string[]
  /** The in-content heading (list-header or lone bold first bullet with sub-items), if any. */
  heading?: string
  /** Body paragraphs with the heading removed, empty items dropped, and list depths normalized. */
  bodyParagraphs: Paragraph[]
  /**
   * Where runs of empty body paragraphs were dropped: `index` is the position in
   * `bodyParagraphs` the run preceded, `y` an estimate (cm) of the run's top on
   * the page. Authors leave such runs as room for a drawing over the body.
   */
  bodyGaps: { index: number, y: number }[]
  bodyShape?: OdpShape
  titleShape?: OdpShape
  /** Filename/project label shapes near code (attached or not), which have a role even when not listed elsewhere. */
  labelShapes: OdpShape[]
  codes: CodeShape[]
  links: OdpShape[]
  images: OdpShape[]
  tables: OdpShape[]
  annotationRects: OdpShape[]
  /** Bordered rectangles drawn around (nearly) a whole code shape -- a whole-block highlight only when labeled. */
  codeFrames: { code: CodeShape, shape: OdpShape }[]
  connectors: OdpShape[]
  /** Text shapes that aren't title/body/code/label/link -- callout candidates, else loose text or decoration. */
  texts: OdpShape[]
  /** Shapes that can never be converted (reported as losses). */
  decorations: { shape: OdpShape, description: string }[]
}

function nonWhitespaceLength(s: string): number {
  return s.replace(/\s/g, '').length
}

export function isMonospaceShape(shape: OdpShape): boolean {
  let total = 0
  let mono = 0
  for (const p of shape.paragraphs) {
    for (const r of p.runs) {
      const n = nonWhitespaceLength(r.text)
      total += n
      if (r.mono)
        mono += n
    }
  }
  return total > 0 && mono / total > MONO_RATIO
}

function isTerminalShape(shape: OdpShape): boolean {
  const firstLine = shapeText(shape).split('\n').find(l => l.trim() !== '')
  return shape.hasBorder && firstLine !== undefined && /^\s*\$ /.test(firstLine)
}

function isLinkShape(shape: OdpShape): boolean {
  const text = shapeText(shape).trim()
  if (!text)
    return false
  const linked = shape.paragraphs.flatMap(p => p.runs).filter(r => r.href).map(r => r.text).join('').trim()
  return linked.length > 0 && linked.replace(/\s+/g, '') === text.replace(/\s+/g, '')
}

const RECT_GEOMETRIES = new Set(['rect', 'rectangle', 'ooxml-rect', 'round-rectangle', 'ooxml-roundRect'])
const CONNECTOR_GEOMETRY_RE = /arrow|mso-spt32|ooxml-non-primitive|line|connector/i

function hasText(shape: OdpShape): boolean {
  return shapeText(shape).trim().length > 0 || (shape.table?.length ?? 0) > 0
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** Fraction of `code`'s area covered by `rect`. */
function coverage(code: Rect, rect: Rect): number {
  const w = Math.max(0, Math.min(code.x + code.w, rect.x + rect.w) - Math.max(code.x, rect.x))
  const h = Math.max(0, Math.min(code.y + code.h, rect.y + rect.h) - Math.max(code.y, rect.y))
  return code.w * code.h > 0 ? (w * h) / (code.w * code.h) : 0
}

function area(r: Rect | undefined): number {
  return r ? r.w * r.h : 0
}

/** Splits a title shape's text into at most two non-empty lines (paragraphs or line breaks). */
export function titleLinesOf(shape: OdpShape): string[] {
  const lines = shapeText(shape).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (lines.length <= 2)
    return lines
  return [lines[0], lines.slice(1).join(' ')]
}

function isBoldParagraph(p: Paragraph): boolean {
  const visible = p.runs.filter(r => r.text.trim() !== '')
  return visible.length > 0 && visible.every(r => r.bold)
}

/**
 * Extracts an in-content heading from body paragraphs (a leading list-header,
 * or a lone bold first-level item that has sub-items or is the only item, or a leading bold
 * non-list paragraph followed by a list) and returns the remaining
 * paragraphs with empty ones dropped and list depths renormalized.
 */
/**
 * Runs of empty paragraphs in a body frame, located in the `rest` paragraphs
 * `extractHeading` keeps (so `index` counts only kept paragraphs) and with a
 * top estimated from the preceding paragraphs' font sizes. Line wrapping and
 * paragraph spacing are ignored, so the estimate errs early for long lines.
 */
export function bodyGapsOf(body: OdpShape, heading: string | undefined): { index: number, y: number }[] {
  const gaps: { index: number, y: number }[] = []
  let y = (body.rect?.y ?? 0) + body.paddingTop
  let kept = 0
  let headingSkipped = heading === undefined
  let inRun = false
  let lastSize = DEFAULT_FONT_SIZE_PT
  for (const p of body.paragraphs) {
    const sizes = p.runs.flatMap(r => (r.fontSizePt ? [r.fontSizePt] : []))
    const size = sizes.length > 0 ? Math.max(...sizes) : lastSize
    lastSize = size
    const empty = paragraphText(p).trim() === ''
    if (empty) {
      // A run before any kept paragraph only counts after an extracted heading.
      if (!inRun && (kept > 0 || (heading !== undefined && headingSkipped)))
        gaps.push({ index: kept, y })
      inRun = true
    }
    else {
      inRun = false
      if (headingSkipped)
        kept++
      else
        headingSkipped = true
    }
    y += size * LINE_HEIGHT_FACTOR * PT_TO_CM
  }
  // A run at the very end isn't a gap between content.
  return gaps.filter(g => g.index < kept)
}

export function extractHeading(paragraphs: Paragraph[]): { heading?: string, rest: Paragraph[] } {
  const nonEmpty = paragraphs.filter(p => paragraphText(p).trim() !== '')
  if (nonEmpty.length === 0)
    return { rest: [] }

  const [first, ...others] = nonEmpty
  const firstText = paragraphText(first).replace(/\s+/g, ' ').trim()
  let heading: string | undefined
  let rest = nonEmpty

  const next = others[0]
  if (first.isListHeader && firstText.length <= TITLE_MAX_CHARS) {
    heading = firstText
    rest = others
  }
  // A lone bold first bullet is a heading when it has sub-items, or when it's the
  // body's only item (the slide's content is e.g. code below it). A bold first
  // bullet followed by sibling bullets is not: agenda slides bold their current section.
  else if (first.depth >= 1 && isBoldParagraph(first) && firstText.length <= HEADING_MAX_CHARS && (next ? next.depth > first.depth : true)) {
    heading = firstText
    rest = others
  }
  else if (first.depth === 0 && isBoldParagraph(first) && firstText.length <= HEADING_MAX_CHARS && next && next.depth >= 1) {
    heading = firstText
    rest = others
  }

  return { heading, rest: normalizeDepths(rest) }
}

/** Shifts list depths so the shallowest list paragraph is at depth 1, and treats header paragraphs as plain paragraphs. */
function normalizeDepths(paragraphs: Paragraph[]): Paragraph[] {
  const listDepths = paragraphs.filter(p => p.depth > 0 && !p.isListHeader).map(p => p.depth)
  const shift = listDepths.length > 0 ? Math.min(...listDepths) - 1 : 0
  return paragraphs.map((p) => {
    if (p.isListHeader)
      return { ...p, depth: 0, isListHeader: false }
    return { ...p, depth: p.depth > 0 ? Math.max(1, p.depth - shift) : 0 }
  })
}

function detectCover(slide: OdpSlide, deck: OdpDeck): CoverFields | undefined {
  if (slide.index > COVER_SEARCH_SLIDES)
    return undefined
  const shapes = flattenShapes(slide.shapes)
  if (shapes.some(s => s.presentationClass === 'title'))
    return undefined
  const outlines = shapes.filter(s => s.presentationClass === 'outline' && hasText(s)).sort((a, b) => (a.rect?.y ?? 0) - (b.rect?.y ?? 0))
  const texts = shapes.filter(s => !s.presentationClass && hasText(s))
  const date = texts.find(s => DATE_RE.test(shapeText(s).trim()))
  if (outlines.length < 2 || !date)
    return undefined
  const oneLine = (s: OdpShape | undefined) => s ? shapeText(s).replace(/\s+/g, ' ').trim() : undefined
  const authors = texts.find(s => s !== date && (s.rect?.y ?? 0) > deck.pageHeight * 0.75)
  const subject = texts
    .filter(s => s !== date && s !== authors && (s.rect?.y ?? 0) < (outlines[0].rect?.y ?? Number.POSITIVE_INFINITY))
    .sort((a, b) => (b.rect?.y ?? 0) - (a.rect?.y ?? 0))[0]
  return {
    subject: oneLine(subject),
    lesson: oneLine(outlines[0]),
    title: oneLine(outlines[1]),
    date: oneLine(date),
    authors: oneLine(authors),
  }
}

export function classifySlide(slide: OdpSlide, deck: OdpDeck): ClassifiedSlide {
  const result: ClassifiedSlide = {
    slide,
    role: 'content',
    titleLines: [],
    bodyParagraphs: [],
    bodyGaps: [],
    labelShapes: [],
    codes: [],
    links: [],
    images: [],
    tables: [],
    annotationRects: [],
    codeFrames: [],
    connectors: [],
    texts: [],
    decorations: [],
  }

  const cover = detectCover(slide, deck)
  if (cover)
    return { ...result, role: 'cover', cover }

  const topLevel = slide.shapes
  if (topLevel.some(s => hasText(s) && shapeText(s).trim().startsWith('©')))
    return { ...result, role: 'copyright' }

  // Groups and embedded objects can't be converted; report them and move on.
  const shapes: OdpShape[] = []
  for (const s of topLevel) {
    if (s.kind === 'group')
      result.decorations.push({ shape: s, description: 'grouped shapes omitted' })
    else if (s.kind === 'object')
      result.decorations.push({ shape: s, description: 'embedded object (OLE/chart) omitted' })
    else
      shapes.push(s)
  }

  // Title: placeholder, else the topmost short non-monospace text in the top band.
  let titleShape = shapes.find(s => s.presentationClass === 'title' && hasText(s))
  if (!titleShape) {
    titleShape = shapes
      .filter(s => (s.kind === 'text' || s.kind === 'shape') && hasText(s) && s.rect && s.rect.y < deck.pageHeight * TITLE_BAND_TOP_FRACTION)
      .filter(s => !isMonospaceShape(s) && shapeText(s).trim().length <= TITLE_MAX_CHARS && s.paragraphs.filter(p => paragraphText(p).trim()).length <= 2)
      .sort((a, b) => a.rect!.y - b.rect!.y)[0]
  }
  if (titleShape) {
    result.titleShape = titleShape
    result.titleLines = titleLinesOf(titleShape)
  }

  const remaining = shapes.filter(s => s !== titleShape)

  // Code shapes first, so a monospace block is never mistaken for the body.
  const codeShapes = remaining.filter(s => (s.kind === 'text' || s.kind === 'shape') && hasText(s) && (isMonospaceShape(s) || isTerminalShape(s)))
  const labelCandidates = remaining.filter((s) => {
    if (codeShapes.includes(s) || !hasText(s))
      return false
    const t = shapeText(s).trim()
    return !t.includes('\n') && (MONO_FILENAME_RE.test(t) || PROJECT_LABEL_RE.test(t))
  })
  // Short monospace filenames are labels, not code.
  for (const s of [...codeShapes]) {
    const t = shapeText(s).trim()
    if (!t.includes('\n') && (MONO_FILENAME_RE.test(t) || PROJECT_LABEL_RE.test(t))) {
      codeShapes.splice(codeShapes.indexOf(s), 1)
      labelCandidates.push(s)
    }
  }

  result.labelShapes = labelCandidates
  const slideProjectLabel = labelCandidates.map(s => shapeText(s).trim()).find(t => PROJECT_LABEL_RE.test(t))
  result.codes = codeShapes.map(shape => ({ shape, terminal: !isMonospaceShape(shape), projectLabel: slideProjectLabel }))
  for (const label of labelCandidates) {
    const text = shapeText(label).trim()
    if (PROJECT_LABEL_RE.test(text))
      continue
    const target = nearestCode(label, result.codes)
    if (target && !target.label)
      target.label = text
    else
      result.texts.push(label)
  }

  const rest = remaining.filter(s => !codeShapes.includes(s) && !labelCandidates.includes(s))

  // Body: the outline placeholder, else the largest text shape with a list.
  const textual = rest.filter(s => (s.kind === 'text' || s.kind === 'shape') && hasText(s) && !isLinkShape(s))
  const bodyShape = textual.filter(s => s.presentationClass === 'outline').sort((a, b) => area(b.rect) - area(a.rect))[0]
    ?? textual.filter(s => s.paragraphs.some(p => p.depth > 0)).sort((a, b) => area(b.rect) - area(a.rect))[0]
  if (bodyShape) {
    result.bodyShape = bodyShape
    const { heading, rest: bodyRest } = extractHeading(bodyShape.paragraphs)
    result.heading = heading
    result.bodyParagraphs = bodyRest
    result.bodyGaps = bodyGapsOf(bodyShape, heading)
  }

  for (const s of rest) {
    if (s === bodyShape)
      continue
    if (s.kind === 'image') {
      result.images.push(s)
    }
    else if (s.kind === 'table') {
      result.tables.push(s)
    }
    else if (s.kind === 'line' || s.kind === 'connector') {
      result.connectors.push(s)
    }
    else if (hasText(s)) {
      if (isLinkShape(s))
        result.links.push(s)
      else
        result.texts.push(s)
    }
    else if (s.kind === 'shape') {
      classifyEmptyShape(s, result, deck)
    }
    // empty text frames are layout spacers: ignored
  }

  return result
}

function classifyEmptyShape(s: OdpShape, result: ClassifiedSlide, deck: OdpDeck) {
  const geometry = s.geometryType ?? ''
  if (CONNECTOR_GEOMETRY_RE.test(geometry)) {
    result.connectors.push(s)
    return
  }
  if (!s.rect)
    return
  // The template's thin top bar and fully invisible shapes aren't content.
  if (s.rect.y < 0.5 && s.rect.h < 0.6 && s.rect.w > deck.pageWidth * 0.8)
    return
  if (!s.hasBorder && !s.hasFill)
    return
  if (RECT_GEOMETRIES.has(geometry)) {
    const overCode = result.codes.find(c => c.shape.rect && overlaps(c.shape.rect, s.rect!))
    if (overCode && coverage(overCode.shape.rect!, s.rect) >= CODE_FRAME_COVERAGE) {
      result.codeFrames.push({ code: overCode, shape: s })
      return
    }
    if (overCode) {
      result.annotationRects.push(s)
      return
    }
    result.decorations.push({ shape: s, description: 'highlight box omitted' })
    return
  }
  result.decorations.push({ shape: s, description: `decorative shape (${geometry || 'shape'}) omitted` })
}

function nearestCode(label: OdpShape, codes: CodeShape[]): CodeShape | undefined {
  if (!label.rect)
    return undefined
  const l = label.rect
  return codes.find((c) => {
    const r = c.shape.rect
    if (!r)
      return false
    const horizontally = l.x + l.w > r.x - LABEL_DISTANCE_CM && l.x < r.x + r.w + LABEL_DISTANCE_CM
    const nearTop = Math.abs((l.y + l.h) - r.y) <= LABEL_DISTANCE_CM || (l.y >= r.y - LABEL_DISTANCE_CM && l.y <= r.y + LABEL_DISTANCE_CM)
    const nearBottom = Math.abs(l.y - (r.y + r.h)) <= LABEL_DISTANCE_CM
    return horizontally && (nearTop || nearBottom)
  })
}
