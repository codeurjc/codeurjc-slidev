import type { OdpShape, Rect } from './model'
import { lengthCm } from './xml'

// Where a shape really sits on the page. A shape is drawn in its own local box
// (0,0)-(w,h) and placed by `svg:x`/`svg:y`, or, when rotated or skewed, by a
// `draw:transform` list. Every later stage works with page coordinates, so the
// parser folds the transform (and the geometry's mirror flags) into one affine
// matrix per shape and derives the bounding box, line endpoints and arrow
// directions from it.

/** Affine matrix `[a, b, c, d, e, f]`: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = [number, number, number, number, number, number]

export interface Point {
  x: number
  y: number
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** `m2 ∘ m1`: apply m1, then m2. */
function then(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2
  return [
    a2 * a1 + c2 * b1,
    b2 * a1 + d2 * b1,
    a2 * c1 + c2 * d1,
    b2 * c1 + d2 * d1,
    a2 * e1 + c2 * f1 + e2,
    b2 * e1 + d2 * f1 + f2,
  ]
}

export function applyMatrix(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }
}

/**
 * Parses a `draw:transform` value into a matrix. Operations apply in the
 * order written (so `rotate (a) translate (x y)` rotates the local box about
 * its origin, then moves it). ODF's `rotate` turns counter-clockwise on
 * screen, which in y-down page coordinates is (x, y) -> (x cos + y sin,
 * -x sin + y cos). Returns undefined for a value it can't read.
 */
export function parseTransform(value: string | undefined): Matrix | undefined {
  if (!value)
    return undefined
  let m = IDENTITY
  const re = /([a-z]+)\s*\(([^)]*)\)/gi
  let found = false
  for (const [, op, rawArgs] of value.matchAll(re)) {
    found = true
    const args = rawArgs.trim().split(/[\s,]+/).filter(Boolean)
    const num = (i: number) => Number(args[i])
    const len = (i: number) => lengthCm(args[i])
    let step: Matrix
    switch (op.toLowerCase()) {
      case 'rotate': {
        const a = num(0)
        if (!Number.isFinite(a))
          return undefined
        step = [Math.cos(a), -Math.sin(a), Math.sin(a), Math.cos(a), 0, 0]
        break
      }
      case 'translate': {
        const tx = len(0)
        const ty = args.length > 1 ? len(1) : 0
        if (tx === undefined || ty === undefined)
          return undefined
        step = [1, 0, 0, 1, tx, ty]
        break
      }
      case 'scale': {
        const sx = num(0)
        const sy = args.length > 1 ? num(1) : sx
        if (!Number.isFinite(sx) || !Number.isFinite(sy))
          return undefined
        step = [sx, 0, 0, sy, 0, 0]
        break
      }
      case 'skewx': {
        const a = num(0)
        if (!Number.isFinite(a))
          return undefined
        step = [1, 0, Math.tan(a), 1, 0, 0]
        break
      }
      case 'skewy': {
        const a = num(0)
        if (!Number.isFinite(a))
          return undefined
        step = [1, Math.tan(a), 0, 1, 0, 0]
        break
      }
      case 'matrix': {
        const vals = [0, 1, 2, 3].map(num)
        const e = len(4)
        const f = len(5)
        if (vals.some(v => !Number.isFinite(v)) || e === undefined || f === undefined)
          return undefined
        step = [vals[0], vals[1], vals[2], vals[3], e, f]
        break
      }
      default:
        return undefined
    }
    m = then(m, step)
  }
  return found ? m : undefined
}

/** The matrix placing a shape's local box on the page, including mirror flips of its geometry. */
export function placementMatrix(options: { w: number, h: number, x?: number, y?: number, transform?: Matrix, mirrorH?: boolean, mirrorV?: boolean }): Matrix {
  const { w, h, mirrorH, mirrorV } = options
  let m: Matrix = [mirrorH ? -1 : 1, 0, 0, mirrorV ? -1 : 1, mirrorH ? w : 0, mirrorV ? h : 0]
  m = then(m, options.transform ?? [1, 0, 0, 1, options.x ?? 0, options.y ?? 0])
  return m
}

/** Axis-aligned bounding box of a local box after placement. */
export function boundingRect(m: Matrix, w: number, h: number): Rect {
  const corners = [applyMatrix(m, 0, 0), applyMatrix(m, w, 0), applyMatrix(m, 0, h), applyMatrix(m, w, h)]
  const xs = corners.map(c => c.x)
  const ys = corners.map(c => c.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** Rotation of a placement matrix, in radians (counter-clockwise on screen). */
export function rotationOf(m: Matrix): number {
  return Math.atan2(-m[1], m[0])
}

/** Custom-shape geometries that are a straight or elbowed line from the local box's (0,0) to (w,h). */
export const LINE_GEOMETRY_RE = /^(?:mso-spt3[2-9]|mso-spt40|line|ooxml-(?:straight|bent|curved)Connector\d*)$/i

const ARROW_LOCAL_ENDS: Record<string, [[number, number], [number, number]]> = {
  // [tail, tip] as fractions of the local box.
  'right-arrow': [[0, 0.5], [1, 0.5]],
  'left-arrow': [[1, 0.5], [0, 0.5]],
  'up-arrow': [[0.5, 1], [0.5, 0]],
  'down-arrow': [[0.5, 0], [0.5, 1]],
  'mso-spt13': [[0, 0.5], [1, 0.5]],
  'mso-spt66': [[1, 0.5], [0, 0.5]],
  'mso-spt68': [[0.5, 1], [0.5, 0]],
  'mso-spt67': [[0.5, 0], [0.5, 1]],
}

/** Whether a shape is a block arrow whose pointing direction its geometry type tells. */
export function isBlockArrow(shape: OdpShape): boolean {
  return Boolean(shape.geometryType && ARROW_LOCAL_ENDS[shape.geometryType])
}

/**
 * The tail and tip of a directed arrow, in page coordinates: a line whose style
 * has an arrowhead on exactly one end, or a block arrow shape (its direction
 * after rotation and mirroring). Undefined for undirected lines and shapes.
 */
export function arrowEnds(shape: OdpShape): { tail: Point, tip: Point } | undefined {
  const local = shape.local
  const ends = shape.geometryType ? ARROW_LOCAL_ENDS[shape.geometryType] : undefined
  if (ends && local) {
    const [[tx, ty], [px, py]] = ends
    return {
      tail: applyMatrix(local.matrix, tx * local.w, ty * local.h),
      tip: applyMatrix(local.matrix, px * local.w, py * local.h),
    }
  }
  if (shape.endpoints && shape.markers && shape.markers.start !== shape.markers.end) {
    const { x1, y1, x2, y2 } = shape.endpoints
    const start = { x: x1, y: y1 }
    const end = { x: x2, y: y2 }
    return shape.markers.end ? { tail: start, tip: end } : { tail: end, tip: start }
  }
  return undefined
}
