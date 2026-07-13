// Pure geometry for auto-placing callout boxes around a code block and
// routing elbow (axis-aligned) connectors to their highlighted fragment.
// Deliberately DOM-free so placement/routing logic is directly unit-testable.

export interface Rect { x: number, y: number, w: number, h: number }
export interface Point { x: number, y: number }
export type Side = 'right' | 'left' | 'below' | 'above'

const SIDES: Side[] = ['right', 'left', 'below', 'above']
const GAP = 12

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function within(rect: Rect, bounds: Rect): boolean {
  return rect.x >= bounds.x && rect.y >= bounds.y
    && rect.x + rect.w <= bounds.x + bounds.w
    && rect.y + rect.h <= bounds.y + bounds.h
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export interface PlacementInput {
  codeRect: Rect
  highlightRect: Rect
  calloutSize: { w: number, h: number }
  slideRect: Rect
  /** Bounding boxes of callouts already placed on this slide (collision candidates). */
  placed: Rect[]
}

export function candidateRect(side: Side, input: PlacementInput): Rect {
  const { codeRect, highlightRect, calloutSize, slideRect } = input
  switch (side) {
    case 'right':
      return {
        x: codeRect.x + codeRect.w + GAP,
        y: clamp(highlightRect.y, slideRect.y, slideRect.y + slideRect.h - calloutSize.h),
        w: calloutSize.w,
        h: calloutSize.h,
      }
    case 'left':
      return {
        x: codeRect.x - GAP - calloutSize.w,
        y: clamp(highlightRect.y, slideRect.y, slideRect.y + slideRect.h - calloutSize.h),
        w: calloutSize.w,
        h: calloutSize.h,
      }
    case 'below':
      return {
        x: clamp(highlightRect.x, slideRect.x, slideRect.x + slideRect.w - calloutSize.w),
        y: codeRect.y + codeRect.h + GAP,
        w: calloutSize.w,
        h: calloutSize.h,
      }
    case 'above':
      return {
        x: clamp(highlightRect.x, slideRect.x, slideRect.x + slideRect.w - calloutSize.w),
        y: codeRect.y - GAP - calloutSize.h,
        w: calloutSize.w,
        h: calloutSize.h,
      }
  }
}

export interface PlacementResult {
  rect: Rect
  side: Side
  /** True when no collision-free candidate existed and the result had to be stacked. */
  stacked: boolean
}

/**
 * Tries right -> left -> below -> above (in that order), returning the first
 * candidate that overlaps neither the code block nor an already-placed
 * callout, and stays within the slide bounds. Falls back to stacking within
 * the right zone (offset by how many callouts are already placed) if none
 * qualify, so a callout is never simply omitted.
 */
export function placeCallout(input: PlacementInput): PlacementResult {
  for (const side of SIDES) {
    const rect = candidateRect(side, input)
    if (!within(rect, input.slideRect)) continue
    if (rectsOverlap(rect, input.codeRect)) continue
    if (input.placed.some(p => rectsOverlap(rect, p))) continue
    return { rect, side, stacked: false }
  }
  const base = candidateRect('right', input)
  const offset = input.placed.length * (input.calloutSize.h + GAP)
  return { rect: { ...base, y: base.y + offset }, side: 'right', stacked: true }
}

/**
 * A 2-segment axis-aligned elbow from the highlight's edge (facing the
 * callout's side) to the callout box's nearest edge. Because the callout
 * rect never overlaps the code rect (see placeCallout), the bend point --
 * which sits at the callout's own edge coordinate -- is guaranteed to lie
 * outside the code block.
 */
export function elbowPath(highlightRect: Rect, calloutRect: Rect, side: Side): Point[] {
  const hlCenterY = highlightRect.y + highlightRect.h / 2
  const hlCenterX = highlightRect.x + highlightRect.w / 2
  const boxCenterY = calloutRect.y + calloutRect.h / 2
  const boxCenterX = calloutRect.x + calloutRect.w / 2

  if (side === 'right' || side === 'left') {
    const anchor: Point = { x: side === 'right' ? highlightRect.x + highlightRect.w : highlightRect.x, y: hlCenterY }
    const boxEdge: Point = { x: side === 'right' ? calloutRect.x : calloutRect.x + calloutRect.w, y: boxCenterY }
    const bend: Point = { x: boxEdge.x, y: anchor.y }
    return [anchor, bend, boxEdge]
  }
  const anchor: Point = { x: hlCenterX, y: side === 'below' ? highlightRect.y + highlightRect.h : highlightRect.y }
  const boxEdge: Point = { x: boxCenterX, y: side === 'below' ? calloutRect.y : calloutRect.y + calloutRect.h }
  const bend: Point = { x: anchor.x, y: boxEdge.y }
  return [anchor, bend, boxEdge]
}

export function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return ''
  return `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`
}
