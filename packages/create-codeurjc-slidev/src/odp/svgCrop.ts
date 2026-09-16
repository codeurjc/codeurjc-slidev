import type { Element } from '@xmldom/xmldom'
import type { Rect } from './model'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { DIAGRAM_SVG_MARGIN, SVG_MATCH_RELATIVE, SVG_MATCH_TOLERANCE } from './constants'

// Crops one diagram out of LibreOffice's SVG export of a deck. Every shape of
// an exported slide is its own group holding a `<rect class="BoundingBox">`
// in 1/100 mm (`com.sun.star.drawing.CustomShape`, `Graphic` for pictures,
// `TextShape` for text frames, ...). A diagram's shapes are found by matching
// their ODP bounding boxes against those, and copied -- alone, without the
// master page or the slide's other shapes -- into a standalone SVG framed by
// their union. Parsing the export (megabytes for a picture-heavy deck) happens
// once per import.

const OOO_NS = 'http://xml.openoffice.org/svg/export'

export interface SvgExport {
  root: Element
  /** Shared definitions (fonts, clip paths, bullet glyphs), without master pages or slide metadata. */
  defs: Element[]
  /** Exported slide page groups, by ODP page name (`ooo:name`). */
  pages: Map<string, Element>
}

interface ExportedShape {
  element: Element
  box: Rect
}

function elements(root: Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagName(localName)) as Element[]
}

function childElements(el: Element): Element[] {
  const out: Element[] = []
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1)
      out.push(n as Element)
  }
  return out
}

export function parseSvgExport(svg: string): SvgExport | undefined {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement as Element | null
  if (!root || root.localName !== 'svg')
    return undefined
  const defs = childElements(root).filter(c => c.localName === 'defs'
    && c.getAttribute('id') !== 'presentation-animations'
    && !childElements(c).some(g => g.getAttribute('class') === 'Master_Slide' || g.getAttribute('id') === 'ooo:meta_slides'))
  const pages = new Map<string, Element>()
  for (const g of elements(root, 'g')) {
    const name = g.getAttribute('class') === 'Page' ? g.getAttributeNS(OOO_NS, 'name') : null
    if (name && !pages.has(name))
      pages.set(name, g)
  }
  return { root, defs, pages }
}

function shapesOf(page: Element): ExportedShape[] {
  return elements(page, 'rect')
    .filter(r => r.getAttribute('class') === 'BoundingBox')
    .flatMap((r) => {
      // <g class="..."><g id="..."><rect class="BoundingBox"/>...</g></g>
      const element = r.parentNode?.parentNode as Element | null
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map(k => Number(r.getAttribute(k)))
      return element && [x, y, w, h].every(Number.isFinite) ? [{ element, box: { x, y, w, h } }] : []
    })
}

/** ODP centimeters to the export's 1/100 mm. */
function toExportUnits(r: Rect): Rect {
  return { x: r.x * 1000, y: r.y * 1000, w: r.w * 1000, h: r.h * 1000 }
}

function within(inner: Rect, outer: Rect, tolerance: number): boolean {
  return inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance
    && inner.x + inner.w <= outer.x + outer.w + tolerance && inner.y + inner.h <= outer.y + outer.h + tolerance
}

/**
 * How well an exported box matches a shape's ODP box, lower is better, or
 * undefined when it can't be that shape. LibreOffice's box is what it drew,
 * which differs from the ODP frame in ways that scale with the shape: a
 * picture's border adds its width, an arrowhead widens a line, a rotated
 * trapezoid's outline is tighter than its rotated frame, and text overflowing
 * its frame grows the box vertically. Extras (shapes the importer couldn't
 * classify, like a curve) may also be any smaller drawing inside their frame.
 */
function matchScore(box: Rect, target: Rect, required: boolean): number | undefined {
  const slack = (a: number, b: number) => Math.max(SVG_MATCH_TOLERANCE * 5, SVG_MATCH_RELATIVE * Math.max(a, b))
  const dx = Math.abs(box.x + box.w / 2 - target.x - target.w / 2)
  const dy = Math.abs(box.y + box.h / 2 - target.y - target.h / 2)
  const dw = Math.abs(box.w - target.w)
  const dh = Math.abs(box.h - target.h)
  const score = dx + dy + dw + dh
  if (dx <= slack(box.w, target.w) && dw <= slack(box.w, target.w) && dy <= slack(box.h, target.h) && dh <= slack(box.h, target.h))
    return score
  const grownText = within(target, box, SVG_MATCH_TOLERANCE) && Math.abs(box.x - target.x) <= SVG_MATCH_TOLERANCE && Math.abs(box.x + box.w - target.x - target.w) <= SVG_MATCH_TOLERANCE
  if (grownText || (!required && within(box, target, SVG_MATCH_TOLERANCE)))
    return score
  return undefined
}

/**
 * A standalone SVG of one diagram: the export's shapes matching `members`
 * (all required) and `extras` (included when found; an extra may also match a
 * smaller shape inside its box, as a curve's drawn extent is tighter than its
 * frame), framed by the members' union. Undefined when the page isn't in the
 * export or any member has no matching shape.
 */
export function cropDiagram(svg: SvgExport, pageName: string, members: Rect[], extras: Rect[] = []): string | undefined {
  const page = svg.pages.get(pageName)
  if (!page || members.length === 0)
    return undefined
  const shapes = shapesOf(page)
  const targets = [...members.map(r => ({ rect: toExportUnits(r), required: true })), ...extras.map(r => ({ rect: toExportUnits(r), required: false }))]

  // Every plausible (target, shape) pair, assigned best first, so a shape
  // never goes to a worse-matching target while a closer one wanted it.
  const pairs = targets.flatMap((target, t) => shapes.flatMap((shape, i) => {
    const score = matchScore(shape.box, target.rect, target.required)
    return score === undefined ? [] : [{ t, i, score }]
  })).sort((a, b) => a.score - b.score)
  const assigned = new Map<number, number>()
  const used = new Set<ExportedShape>()
  for (const { t, i } of pairs) {
    if (assigned.has(t) || used.has(shapes[i]))
      continue
    assigned.set(t, i)
    used.add(shapes[i])
  }
  if (targets.some((target, t) => target.required && !assigned.has(t)))
    return undefined

  const boxes = shapes.filter(s => used.has(s)).map(s => s.box)
  const x = Math.min(...boxes.map(b => b.x)) - DIAGRAM_SVG_MARGIN
  const y = Math.min(...boxes.map(b => b.y)) - DIAGRAM_SVG_MARGIN
  const w = Math.max(...boxes.map(b => b.x + b.w)) + DIAGRAM_SVG_MARGIN - x
  const h = Math.max(...boxes.map(b => b.y + b.h)) + DIAGRAM_SVG_MARGIN - y

  const out = svg.root.cloneNode(false) as Element
  out.removeAttribute('width')
  out.removeAttribute('height')
  out.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)
  for (const defs of svg.defs)
    out.appendChild(defs.cloneNode(true))
  // Document order, so shapes keep their stacking.
  for (const shape of shapes) {
    if (used.has(shape) && !shapes.some(other => other !== shape && used.has(other) && other.element !== shape.element && isAncestor(other.element, shape.element)))
      out.appendChild(shape.element.cloneNode(true))
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(out)}`
}

function isAncestor(ancestor: Element, node: Element): boolean {
  for (let p = node.parentNode; p; p = p.parentNode) {
    if (p === ancestor)
      return true
  }
  return false
}
