import type { SlideCallout } from 'codeurjc-slidev-theme/composables/useSlideCallouts'
import type { AnnotationResult } from './annotations'
import type { ClassifiedSlide } from './classify'
import type { OdpShape, Rect } from './model'
import type { Point } from './shapeGeometry'
import { distanceToRect } from './annotations'
import { CONNECTOR_DISTANCE_CM, DIAGRAM_AXIS_TOLERANCE_DEG, DIAGRAM_LABEL_DISTANCE_CM, DIAGRAM_LABEL_MAX_LINES, DIAGRAM_TOUCH_CM, ROTATED_TEXT_MIN_RAD } from './constants'
import { paragraphText, shapeText } from './model'
import { arrowEnds } from './shapeGeometry'

// Diagrams drawn with Impress shapes. After code annotations have claimed
// their shapes, the slide's remaining drawing is gathered into groups of
// touching or connected shapes. A group that is plainly a graph of labelled
// rectangles joined by arrows becomes a mermaid flowchart; any other group
// whose ordinary conversion (callouts, flattened paragraphs) would lose
// something becomes a candidate for an SVG cropped from LibreOffice's export
// (see svgCrop.ts). Pure: works on the classified model only.

export interface DiagramGroup {
  /** Shapes that make up the drawing. */
  members: OdpShape[]
  /** Role-less shapes lying fully inside the group's box (e.g. a path the classifier ignores): cropped when the export has them, never required. */
  extras: OdpShape[]
  /** Members that joined as labels written beside a shape; flattening one of them alone doesn't make the drawing lossy. */
  labels: Set<OdpShape>
  /** Union of the members' bounding boxes, in cm. */
  rect: Rect
}

export interface MermaidDiagram {
  group: DiagramGroup
  source: string
  /** Top of the drawn boxes and arrows (callout labels excluded), in cm. */
  top: number
  bottom: number
  /** Arrows with a label pointing at one node, as slide callouts anchored at that node's text. */
  callouts: SlideCallout[]
}

// `mso-spt202` is MSO's plain text box geometry.
const RECT_GEOMETRIES = new Set(['rect', 'rectangle', 'ooxml-rect', 'round-rectangle', 'ooxml-roundRect', 'mso-spt202'])

function union(rects: Rect[]): Rect {
  const x = Math.min(...rects.map(r => r.x))
  const y = Math.min(...rects.map(r => r.y))
  const right = Math.max(...rects.map(r => r.x + r.w))
  const bottom = Math.max(...rects.map(r => r.y + r.h))
  return { x, y, w: right - x, h: bottom - y }
}

function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w))
  const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h))
  return Math.hypot(dx, dy)
}

function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x)
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

/** A shape's bounding box; lines (`draw:line`) only carry endpoints, so theirs is derived. */
export function boxOf(shape: OdpShape): Rect {
  if (shape.rect)
    return shape.rect
  const e = shape.endpoints!
  return { x: Math.min(e.x1, e.x2), y: Math.min(e.y1, e.y2), w: Math.abs(e.x2 - e.x1), h: Math.abs(e.y2 - e.y1) }
}

function segmentOf(shape: OdpShape): [Point, Point] | undefined {
  const e = shape.endpoints
  return e ? [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }] : undefined
}

function segmentToRect(a: Point, b: Point, r: Rect): number {
  if (distanceToRect(a.x, a.y, r) === 0 || distanceToRect(b.x, b.y, r) === 0)
    return 0
  const corners = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }]
  for (let i = 0; i < 4; i++) {
    if (segmentsIntersect(a, b, corners[i], corners[(i + 1) % 4]))
      return 0
  }
  return Math.min(distanceToRect(a.x, a.y, r), distanceToRect(b.x, b.y, r), ...corners.map(c => pointToSegment(c, a, b)))
}

/** Distance between two shapes, following a line's whole length rather than its box. */
function shapeDistance(a: OdpShape, b: OdpShape): number {
  const sa = segmentOf(a)
  const sb = segmentOf(b)
  if (sa && sb) {
    if (segmentsIntersect(sa[0], sa[1], sb[0], sb[1]))
      return 0
    return Math.min(pointToSegment(sa[0], sb[0], sb[1]), pointToSegment(sa[1], sb[0], sb[1]), pointToSegment(sb[0], sa[0], sa[1]), pointToSegment(sb[1], sa[0], sa[1]))
  }
  if (sa)
    return segmentToRect(sa[0], sa[1], boxOf(b))
  if (sb)
    return segmentToRect(sb[0], sb[1], boxOf(a))
  return rectDistance(boxOf(a), boxOf(b))
}

function inside(inner: Rect, outer: Rect, tolerance = 0.05): boolean {
  return inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance
    && inner.x + inner.w <= outer.x + outer.w + tolerance && inner.y + inner.h <= outer.y + outer.h + tolerance
}

function hasText(shape: OdpShape): boolean {
  return shapeText(shape).trim() !== ''
}

/** A text box with no border or fill: a label, a caption, or loose text. */
function isPlainText(shape: OdpShape): boolean {
  return (shape.kind === 'text' || shape.kind === 'shape') && hasText(shape) && !shape.hasBorder && !shape.hasFill
}

function centerInside(shape: OdpShape, rect: Rect): boolean {
  const r = boxOf(shape)
  return distanceToRect(r.x + r.w / 2, r.y + r.h / 2, rect) === 0
}

/** Bordered or filled shapes, and non-rectangular geometric shapes: the "boxes" of a drawing. */
export function isBoxLike(shape: OdpShape, connectors: Set<OdpShape>): boolean {
  if (connectors.has(shape) || shape.kind === 'image' || shape.kind === 'line' || shape.kind === 'connector')
    return false
  const nonRect = shape.kind === 'shape' && shape.geometryType !== undefined && !RECT_GEOMETRIES.has(shape.geometryType)
  return shape.hasBorder || shape.hasFill || nonRect
}

/**
 * Groups a content slide's unclaimed drawing. Lines, connectors and arrow
 * shapes join anything within the connector distance of them; everything else
 * joins only what it touches, so a caption merely placed beside a screenshot
 * stays out. Groups reaching code or a table are dropped (code annotations own
 * those), and a group lying wholly inside another's box is folded into it.
 */
export function diagramGroups(cs: ClassifiedSlide, annotations: AnnotationResult): DiagramGroup[] {
  const connectors = new Set(cs.connectors.filter(c => !annotations.consumedConnectors.has(c)))
  const members = [
    ...cs.images,
    ...connectors,
    ...cs.texts.filter(t => !annotations.consumedTexts.has(t)),
    ...cs.decorations.filter(d => d.shape.kind === 'shape').map(d => d.shape),
  ].filter(s => s.rect || s.endpoints)

  const parent = members.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const linked = (a: OdpShape, b: OdpShape): boolean => {
    if (connectors.has(a) || connectors.has(b))
      return shapeDistance(a, b) <= CONNECTOR_DISTANCE_CM
    // Plain text belongs to a drawing only when written on it: a caption or
    // heading that merely touches a picture stays out.
    if (isPlainText(a) || isPlainText(b))
      return isPlainText(a) !== isPlainText(b) && (isPlainText(a) ? centerInside(a, boxOf(b)) : centerInside(b, boxOf(a)))
    return shapeDistance(a, b) <= DIAGRAM_TOUCH_CM
  }
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (find(i) !== find(j) && linked(members[i], members[j]))
        parent[find(i)] = find(j)
    }
  }
  // A drawing with arrows also takes the short labels written beside its
  // shapes (a node's name next to its icon), which touch nothing.
  const labels = new Set<OdpShape>()
  const hasConnector = (i: number) => members.some((m, j) => find(j) === find(i) && connectors.has(m))
  const groupSize = (i: number) => members.filter((_, j) => find(j) === find(i)).length
  members.forEach((label, i) => {
    if (!isPlainText(label) || groupSize(i) > 1 || label.paragraphs.filter(p => paragraphText(p).trim()).length > DIAGRAM_LABEL_MAX_LINES)
      return
    const host = members.findIndex((m, j) => j !== i && !connectors.has(m) && !isPlainText(m) && hasConnector(j) && shapeDistance(label, m) <= DIAGRAM_LABEL_DISTANCE_CM)
    if (host >= 0) {
      parent[find(i)] = find(host)
      labels.add(label)
    }
  })

  const byRoot = new Map<number, OdpShape[]>()
  members.forEach((m, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), m]))

  const barriers = [...cs.codes.map(c => c.shape), ...cs.tables].filter(s => s.rect)
  let groups: DiagramGroup[] = [...byRoot.values()]
    .filter(g => g.length > 1)
    .filter(g => !g.some(m => barriers.some(b => shapeDistance(m, b) <= (connectors.has(m) ? CONNECTOR_DISTANCE_CM : DIAGRAM_TOUCH_CM))))
    .map(g => ({ members: g, extras: [], labels: new Set(g.filter(m => labels.has(m))), rect: union(g.map(boxOf)) }))

  // Fold groups lying wholly inside a bigger group's box into it.
  groups.sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)
  const folded: DiagramGroup[] = []
  for (const g of groups) {
    const host = folded.find(f => inside(g.rect, f.rect))
    if (host) {
      host.members.push(...g.members)
      g.labels.forEach(l => host.labels.add(l))
    }
    else {
      folded.push(g)
    }
  }
  groups = folded

  // Role-less shapes inside a group's box: shapes the classifier ignored
  // (e.g. a curved arrow path with an inherited stroke) or loose members that
  // touch nothing but sit within the drawing.
  const roles = new Set<OdpShape>([
    ...(cs.titleShape ? [cs.titleShape] : []),
    ...(cs.bodyShape ? [cs.bodyShape] : []),
    ...cs.codes.map(c => c.shape),
    ...cs.tables,
    ...cs.links,
    ...cs.labelShapes,
    ...cs.annotationRects,
    ...cs.codeFrames.map(f => f.shape),
    ...annotations.consumedTexts,
    ...annotations.consumedConnectors,
  ])
  const grouped = new Set(groups.flatMap(g => g.members))
  for (const shape of cs.slide.shapes) {
    if (!shape.rect || roles.has(shape) || grouped.has(shape) || shape.kind === 'group')
      continue
    const host = groups.find(g => inside(shape.rect!, g.rect))
    if (host)
      host.extras.push(shape)
  }
  return groups
}

// --- Mermaid ----------------------------------------------------------------

function mermaidLabel(shape: OdpShape): string {
  const escape = (s: string) => s.replace(/&/g, '#amp;').replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;')
  return shape.paragraphs
    .map(p => paragraphText(p).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(escape)
    .join('<br>')
}

/** The text a callout's `{text}` anchor searches for: a node's first line, as rendered. */
function anchorText(shape: OdpShape): string {
  return shape.paragraphs.map(p => paragraphText(p).replace(/\s+/g, ' ').trim()).find(Boolean) ?? ''
}

function oneLine(shape: OdpShape): string {
  return shapeText(shape).replace(/\s+/g, ' ').trim()
}

function ends(shape: OdpShape): { tail: Point, tip: Point, directed: boolean } | undefined {
  const directed = arrowEnds(shape)
  if (directed)
    return { ...directed, directed: true }
  const segment = segmentOf(shape)
  return segment ? { tail: segment[0], tip: segment[1], directed: false } : undefined
}

/**
 * Converts a group to a mermaid flowchart when it's a clear graph: labelled
 * rectangles, none overlapping or with anything drawn inside, joined by
 * arrows or lines that all run along one axis, and nothing else except the
 * labels of arrows pointing at a single node (which become callouts on that
 * node). `otherText` is the slide's remaining text, to keep a node callout's
 * `{text}` anchor from matching something else.
 */
export function mermaidFor(group: DiagramGroup, cs: ClassifiedSlide, otherText: string): MermaidDiagram | undefined {
  const connectorSet = new Set(cs.connectors)
  if (group.members.some(m => m.kind === 'image'))
    return undefined
  const connectors = group.members.filter(m => connectorSet.has(m))
  const boxes = group.members.filter(m => !connectorSet.has(m) && isBoxLike(m, connectorSet))
  const loose = group.members.filter(m => !connectorSet.has(m) && !isBoxLike(m, connectorSet))
  if (boxes.length < 2 || connectors.length === 0)
    return undefined
  if (boxes.some(b => !hasText(b) || (b.kind === 'shape' && !RECT_GEOMETRIES.has(b.geometryType ?? '')) || (b.rotation ?? 0) !== 0))
    return undefined
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].rect!
      const b = boxes[j].rect!
      if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > DIAGRAM_TOUCH_CM && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > DIAGRAM_TOUCH_CM)
        return undefined
    }
  }
  if (loose.some(l => boxes.some(b => inside(boxOf(l), b.rect!))) || group.extras.length > 0)
    return undefined

  const nearestBox = (p: Point) => {
    const scored = boxes.map(b => ({ b, d: distanceToRect(p.x, p.y, b.rect!) })).filter(s => s.d <= CONNECTOR_DISTANCE_CM)
    return scored.sort((x, y) => x.d - y.d)[0]?.b
  }
  const edges: { from: OdpShape, to: OdpShape, directed: boolean, vector: Point }[] = []
  const nodeCallouts: { node: OdpShape, label: OdpShape, arrow: OdpShape }[] = []
  const tan = Math.tan(DIAGRAM_AXIS_TOLERANCE_DEG * Math.PI / 180)
  for (const connector of connectors) {
    const e = ends(connector)
    if (!e)
      return undefined
    // A line lying inside a box (a compartment divider) isn't an edge.
    if (boxes.some(b => distanceToRect(e.tail.x, e.tail.y, b.rect!) === 0 && distanceToRect(e.tip.x, e.tip.y, b.rect!) === 0))
      return undefined
    const tailBox = nearestBox(e.tail)
    const tipBox = nearestBox(e.tip)
    if (tailBox && tipBox && tailBox !== tipBox) {
      edges.push({ from: tailBox, to: tipBox, directed: e.directed, vector: { x: e.tip.x - e.tail.x, y: e.tip.y - e.tail.y } })
      continue
    }
    // A label at the tail and a node near the tip: a callout on that node.
    // Authors park these arrows beside or between steps rather than touching
    // one, so the node is the box nearest the tip among those the arrow is
    // close to.
    if (tailBox)
      return undefined
    const label = loose.find(l => hasText(l) && !l.hasBorder && !l.hasFill && distanceToRect(e.tail.x, e.tail.y, l.rect!) <= CONNECTOR_DISTANCE_CM)
    const node = boxes
      .filter(b => shapeDistance(connector, b) <= CONNECTOR_DISTANCE_CM)
      .sort((x, y) => distanceToRect(e.tip.x, e.tip.y, x.rect!) - distanceToRect(e.tip.x, e.tip.y, y.rect!))[0]
    if (!e.directed || !node || !label)
      return undefined
    nodeCallouts.push({ node, label, arrow: connector })
  }
  if (edges.length === 0)
    return undefined

  // Every edge along one axis.
  const horizontal = edges.every(e => Math.abs(e.vector.y) <= tan * Math.abs(e.vector.x))
  const vertical = edges.every(e => Math.abs(e.vector.x) <= tan * Math.abs(e.vector.y))
  if (!horizontal && !vertical)
    return undefined

  // Connected, and nothing left over but callout labels.
  const reached = new Set<OdpShape>([boxes[0]])
  for (let grew = true; grew;) {
    grew = false
    for (const e of edges) {
      if (reached.has(e.from) !== reached.has(e.to)) {
        reached.add(e.from)
        reached.add(e.to)
        grew = true
      }
    }
  }
  if (reached.size !== boxes.length)
    return undefined
  const labels = new Set(nodeCallouts.map(c => c.label))
  if (labels.size !== nodeCallouts.length || loose.some(l => !labels.has(l)))
    return undefined
  if (nodeCallouts.some(c => otherText.includes(anchorText(c.node))))
    return undefined

  const direction = horizontal ? 'LR' : 'TB'
  const center = (s: OdpShape) => ({ x: s.rect!.x + s.rect!.w / 2, y: s.rect!.y + s.rect!.h / 2 })
  const ordered = [...boxes].sort((a, b) => horizontal
    ? center(a).x - center(b).x || center(a).y - center(b).y
    : center(a).y - center(b).y || center(a).x - center(b).x)
  const id = (s: OdpShape) => `n${ordered.indexOf(s) + 1}`
  const lines = [`flowchart ${direction}`, ...ordered.map(b => `  ${id(b)}["${mermaidLabel(b)}"]`)]
  for (const e of edges) {
    if (e.directed) {
      lines.push(`  ${id(e.from)} --> ${id(e.to)}`)
    }
    else {
      const [a, b] = ordered.indexOf(e.from) < ordered.indexOf(e.to) ? [e.from, e.to] : [e.to, e.from]
      lines.push(`  ${id(a)} --- ${id(b)}`)
    }
  }

  const drawn = union([...boxes, ...connectors.filter(c => !nodeCallouts.some(n => n.arrow === c))].map(boxOf))
  return {
    group,
    source: lines.join('\n'),
    top: drawn.y,
    bottom: drawn.y + drawn.h,
    callouts: nodeCallouts.map(c => ({
      anchor: { kind: 'text', text: anchorText(c.node) },
      text: oneLine(c.label),
      // Mermaid lays the nodes out its own way, so a box pinned where the
      // label sat in the ODP could land far from its node: auto-place it.
      box: null,
      step: null,
    })),
  }
}

// --- SVG candidates -----------------------------------------------------------

/**
 * Whether a group that didn't become mermaid should be embedded as an SVG:
 * it's a drawing (an image, or at least two boxes) and the ordinary
 * conversion would lose part of it -- a member reported as a loss, or a
 * rotated text turned into a callout (callout boxes can't rotate).
 */
export function isSvgCandidate(group: DiagramGroup, cs: ClassifiedSlide, ordinary: { lossByShape: Map<OdpShape, string>, calloutTexts: Set<OdpShape> }): boolean {
  const connectors = new Set(cs.connectors)
  const drawing = group.members.some(m => m.kind === 'image') || group.members.filter(m => isBoxLike(m, connectors)).length >= 2
  if (!drawing)
    return false
  // An empty frame drawn around a whole picture is cosmetic: losing it alone
  // doesn't justify turning the picture and its callouts into an SVG.
  const images = group.members.filter(m => m.kind === 'image')
  const isFrame = (m: OdpShape) => !hasText(m) && m.kind === 'shape' && RECT_GEOMETRIES.has(m.geometryType ?? '') && images.some(i => inside(i.rect!, boxOf(m), DIAGRAM_TOUCH_CM))
  return group.members.some(m => (ordinary.lossByShape.has(m) && !isFrame(m) && !group.labels.has(m)) || (ordinary.calloutTexts.has(m) && Math.abs(m.rotation ?? 0) > ROTATED_TEXT_MIN_RAD))
}
