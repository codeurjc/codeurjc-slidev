// Plain-data model of an ODP presentation, as read from its ODF XML. Every
// conversion stage after parsing works on these types only (no XML/DOM), so
// each stage stays unit-testable with small hand-built models.

/** A box in centimeters, in the slide page's own coordinate space. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface TextRun {
  text: string
  bold: boolean
  italic: boolean
  mono: boolean
  href?: string
  fontSizePt?: number
}

export interface Paragraph {
  runs: TextRun[]
  /** 0 outside any list, 1 for a first-level list paragraph, 2 for nested, ... */
  depth: number
  /** Whether the paragraph sits in a `text:list-header` (a bullet-less list paragraph, used by these decks as an in-content heading). */
  isListHeader: boolean
}

export type ShapeKind = 'text' | 'image' | 'table' | 'object' | 'line' | 'connector' | 'group' | 'shape'

export interface OdpShape {
  kind: ShapeKind
  /** `presentation:class` (e.g. `title`, `outline`) for placeholder frames. */
  presentationClass?: string
  /** `draw:enhanced-geometry`'s `draw:type` for custom shapes (e.g. `ooxml-rect`, `right-arrow`). */
  geometryType?: string
  rect?: Rect
  /** Start/end points of lines and connectors, in centimeters. */
  endpoints?: { x1: number, y1: number, x2: number, y2: number }
  paragraphs: Paragraph[]
  /** `Pictures/...` (or external) hrefs of a frame's images, in document order. */
  images: string[]
  /** Table cells as rows -> cells -> paragraphs. */
  table?: Paragraph[][][]
  hasBorder: boolean
  hasFill: boolean
  /** Top inner padding of the shape's text area, in centimeters. */
  paddingTop: number
  /** Bottom inner padding of the shape's text area, in centimeters (defaults to the top padding when absent). */
  paddingBottom?: number
  children?: OdpShape[]
}

export interface OdpSlide {
  /** 1-based position in the ODP. */
  index: number
  /** `draw:name` (e.g. `page16`), preserved by LibreOffice's SVG export. */
  name: string
  hidden: boolean
  masterName: string
  shapes: OdpShape[]
}

export interface OdpMaster {
  name: string
  bodyRegion?: Rect
  titleRegion?: Rect
}

export interface OdpDeck {
  pageWidth: number
  pageHeight: number
  masters: Map<string, OdpMaster>
  slides: OdpSlide[]
  /** Archive entries under `Pictures/`, keyed by their full archive path. */
  pictures: Map<string, Uint8Array>
}

export function paragraphText(p: Paragraph): string {
  return p.runs.map(r => r.text).join('')
}

export function shapeText(shape: OdpShape): string {
  return shape.paragraphs.map(paragraphText).join('\n')
}

/** Every shape on a slide, flattening groups. */
export function flattenShapes(shapes: OdpShape[]): OdpShape[] {
  return shapes.flatMap(s => (s.kind === 'group' ? flattenShapes(s.children ?? []) : [s]))
}
