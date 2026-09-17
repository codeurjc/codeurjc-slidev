// Pure geometry for auto-placing callout boxes around a code block and
// routing elbow (axis-aligned) connectors to their highlighted fragment.
// Deliberately DOM-free so placement/routing logic is directly unit-testable.

import type { StepRange } from './stepRange'
import { rangesOverlap } from './stepRange'

export interface Rect { x: number, y: number, w: number, h: number }
export interface Point { x: number, y: number }
export type Side = 'right' | 'left' | 'below' | 'above'

const SIDES: Side[] = ['right', 'left', 'below', 'above']
const GAP = 12

/** Space left between an obstacle (a code block, an element) and its callout boxes on `arrow` slides, so the arrow has room for its head. */
export const ARROW_OBSTACLE_GAP = 36

/** The shortest `arrow` connector that still gets an arrowhead; a shorter one is drawn as a plain line, since the head would cover it. */
export const MIN_ARROWHEAD_CONNECTOR = 30

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

/** A callout already placed on the slide, with the clicks it's visible at (absent: always). */
export interface PlacedRect extends Rect {
  range?: StepRange
}

export interface PlacementInput {
  codeRect: Rect
  highlightRect: Rect
  calloutSize: { w: number, h: number }
  slideRect: Rect
  /** Bounding boxes of callouts already placed on this slide (collision candidates). */
  placed: PlacedRect[]
  /** The clicks the callout being placed is visible at (absent: always). Only callouts visible at a same click collide. */
  range?: StepRange
  /** Space between the obstacle and the box (default 12); `arrow` slides use `ARROW_OBSTACLE_GAP`. */
  obstacleGap?: number
}

export function candidateRect(side: Side, input: PlacementInput): Rect {
  const { codeRect, highlightRect, calloutSize, slideRect } = input
  const gap = input.obstacleGap ?? GAP
  switch (side) {
    case 'right':
      return {
        x: codeRect.x + codeRect.w + gap,
        y: clamp(highlightRect.y, slideRect.y, slideRect.y + slideRect.h - calloutSize.h),
        w: calloutSize.w,
        h: calloutSize.h,
      }
    case 'left':
      return {
        x: codeRect.x - gap - calloutSize.w,
        y: clamp(highlightRect.y, slideRect.y, slideRect.y + slideRect.h - calloutSize.h),
        w: calloutSize.w,
        h: calloutSize.h,
      }
    case 'below':
      return {
        x: clamp(highlightRect.x, slideRect.x, slideRect.x + slideRect.w - calloutSize.w),
        y: codeRect.y + codeRect.h + gap,
        w: calloutSize.w,
        h: calloutSize.h,
      }
    case 'above':
      return {
        x: clamp(highlightRect.x, slideRect.x, slideRect.x + slideRect.w - calloutSize.w),
        y: codeRect.y - gap - calloutSize.h,
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
 * A side's natural (highlight-anchored) candidate, plus "shelf" positions
 * just past each already-placed callout that shares that side's axis (same
 * x for right/left, same y for below/above) -- so a second callout on a
 * side that's already occupied slides along that side instead of the whole
 * side being abandoned. Sorted by distance from the natural anchor so the
 * closest open shelf wins, keeping boxes near their highlight when possible.
 */
function candidatesForSide(side: Side, input: PlacementInput): Rect[] {
  const base = candidateRect(side, input)
  const { placed, calloutSize } = input
  const horizontal = side === 'right' || side === 'left'
  const baseline = horizontal ? base.y : base.x
  const offsets = new Set<number>([baseline])
  for (const p of placed) {
    if (horizontal) {
      if (Math.abs(p.x - base.x) > 1)
        continue
      offsets.add(p.y + p.h + GAP)
      offsets.add(p.y - GAP - calloutSize.h)
    }
    else {
      if (Math.abs(p.y - base.y) > 1)
        continue
      offsets.add(p.x + p.w + GAP)
      offsets.add(p.x - GAP - calloutSize.w)
    }
  }
  return Array.from(offsets)
    .sort((a, b) => Math.abs(a - baseline) - Math.abs(b - baseline))
    .map(v => (horizontal ? { ...base, y: v } : { ...base, x: v }))
}

/**
 * Tries right -> left -> below -> above (in that order); within each side,
 * tries the highlight-anchored position first and then shelf positions past
 * other callouts already on that side (see candidatesForSide). Returns the
 * first candidate that overlaps neither the code block nor an already-placed
 * callout and stays within the slide bounds. Falls back to stacking within
 * the right zone (offset by how many callouts are already placed) if none
 * qualify, so a callout is never simply omitted -- the stacked fallback is
 * still clamped to the slide bounds so it can degrade to an overlap in a
 * genuinely cramped layout, but never render off-slide.
 */
export function placeCallout(placement: PlacementInput): PlacementResult {
  // Callouts that are never visible at the same click can't collide.
  const input = { ...placement, placed: placement.placed.filter(p => rangesOverlap(p.range, placement.range)) }
  for (const side of SIDES) {
    for (const rect of candidatesForSide(side, input)) {
      if (!within(rect, input.slideRect))
        continue
      if (rectsOverlap(rect, input.codeRect))
        continue
      if (input.placed.some(p => rectsOverlap(rect, p)))
        continue
      return { rect, side, stacked: false }
    }
  }
  const base = candidateRect('right', input)
  const offset = input.placed.length * (input.calloutSize.h + GAP)
  const { slideRect, calloutSize } = input
  const x = clamp(base.x, slideRect.x, slideRect.x + slideRect.w - calloutSize.w)
  const y = clamp(base.y + offset, slideRect.y, slideRect.y + slideRect.h - calloutSize.h)
  return { rect: { ...base, x, y }, side: 'right', stacked: true }
}

/** Where a connector touches its highlight: the middle of the highlight's edge that faces the callout's side. */
export function anchorPoint(highlightRect: Rect, side: Side): Point {
  const hlCenterY = highlightRect.y + highlightRect.h / 2
  const hlCenterX = highlightRect.x + highlightRect.w / 2
  switch (side) {
    case 'right':
      return { x: highlightRect.x + highlightRect.w, y: hlCenterY }
    case 'left':
      return { x: highlightRect.x, y: hlCenterY }
    case 'below':
      return { x: hlCenterX, y: highlightRect.y + highlightRect.h }
    case 'above':
      return { x: hlCenterX, y: highlightRect.y }
  }
}

/**
 * A 2-segment axis-aligned elbow from the highlight's edge (facing the
 * callout's side) to the callout box's nearest edge. Because the callout
 * rect never overlaps the code rect (see placeCallout), the bend point --
 * which sits at the callout's own edge coordinate -- is guaranteed to lie
 * outside the code block.
 */
export function elbowPath(highlightRect: Rect, calloutRect: Rect, side: Side): Point[] {
  const anchor = anchorPoint(highlightRect, side)
  const boxCenterY = calloutRect.y + calloutRect.h / 2
  const boxCenterX = calloutRect.x + calloutRect.w / 2

  if (side === 'right' || side === 'left') {
    const boxEdge: Point = { x: side === 'right' ? calloutRect.x : calloutRect.x + calloutRect.w, y: boxCenterY }
    const bend: Point = { x: boxEdge.x, y: anchor.y }
    return [anchor, bend, boxEdge]
  }
  const boxEdge: Point = { x: boxCenterX, y: side === 'below' ? calloutRect.y : calloutRect.y + calloutRect.h }
  const bend: Point = { x: anchor.x, y: boxEdge.y }
  return [anchor, bend, boxEdge]
}

/**
 * The `arrow` style's connector: one straight segment from `anchor` to the
 * box's border, ending where the line from the box's centre towards the
 * anchor leaves the box. Empty when the anchor lies inside the box.
 */
export function arrowPath(anchor: Point, box: Rect): Point[] {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const dx = anchor.x - cx
  const dy = anchor.y - cy
  const t = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : (box.w / 2) / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : (box.h / 2) / Math.abs(dy),
  )
  if (!Number.isFinite(t) || t >= 1)
    return []
  return [anchor, { x: cx + dx * t, y: cy + dy * t }]
}

/** One callout for `stackCallouts`. */
export interface StackEntry {
  /** Where placement put the box. */
  rect: Rect
  side: Side
  /** Identifies the obstacle the callout is placed around (a code block, an element); only callouts of one group and side are stacked together. */
  group: string
  /** The anchor's position along the side: its top for right/left, its left for above/below. Also the box's level position. */
  anchor: number
  /** The clicks the callout is visible at (absent: always). */
  range?: StepRange
  /** A pinned box (a position override): kept where it is, and avoided. */
  fixed: boolean
}

/**
 * Stacks the auto-placed callouts on each side of each obstacle in the order
 * of their anchors (top to bottom beside it, left to right above or below
 * it), so their connectors don't cross. Each box goes level with its anchor,
 * or just past the box before it (and past any other box it would overlap);
 * a stack that runs past the slide's edge is pulled back inside. Callouts
 * that are never visible at the same click don't constrain each other.
 * Returns the adjusted rects, in the entries' order.
 */
export function stackCallouts(entries: StackEntry[], slideRect: Rect): Rect[] {
  const out = entries.map(e => ({ ...e.rect }))
  const groups = new Map<string, number[]>()
  entries.forEach((e, i) => {
    if (e.fixed)
      return
    const key = `${e.group}\u0000${e.side}`
    groups.set(key, [...(groups.get(key) ?? []), i])
  })

  for (const members of groups.values()) {
    const vertical = entries[members[0]].side === 'right' || entries[members[0]].side === 'left'
    const pos = (r: Rect) => (vertical ? r.y : r.x)
    const size = (r: Rect) => (vertical ? r.h : r.w)
    const setPos = (r: Rect, v: number) => {
      if (vertical)
        r.y = v
      else r.x = v
    }
    const min = vertical ? slideRect.y : slideRect.x
    const max = vertical ? slideRect.y + slideRect.h : slideRect.x + slideRect.w
    const order = [...members].sort((a, b) => entries[a].anchor - entries[b].anchor)
    const inGroup = new Set(order)

    // Forward: level with the anchor, past earlier boxes and anything it overlaps.
    order.forEach((i, k) => {
      const rect = out[i]
      setPos(rect, clamp(entries[i].anchor, min, max - size(rect)))
      for (const j of order.slice(0, k)) {
        if (rangesOverlap(entries[i].range, entries[j].range))
          setPos(rect, Math.max(pos(rect), pos(out[j]) + size(out[j]) + GAP))
      }
      const others = out.filter((_, j) => j !== i && !(inGroup.has(j) && order.indexOf(j) > k) && rangesOverlap(entries[i].range, entries[j].range))
      for (let guard = 0; guard < others.length; guard++) {
        const hit = others.find(o => rectsOverlap(rect, o))
        if (!hit)
          break
        setPos(rect, pos(hit) + size(hit) + GAP)
      }
    })

    // Backward: pull a stack that runs past the far edge back inside.
    for (let k = order.length - 1; k >= 0; k--) {
      const i = order[k]
      let limit = max - size(out[i])
      for (const j of order.slice(k + 1)) {
        if (rangesOverlap(entries[i].range, entries[j].range))
          limit = Math.min(limit, pos(out[j]) - GAP - size(out[i]))
      }
      setPos(out[i], Math.max(min, Math.min(pos(out[i]), limit)))
    }
  }
  return out
}

/** The total length of a connector's segments. */
export function pathLength(points: Point[]): number {
  let length = 0
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  return length
}

export function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0)
    return ''
  return `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`
}

// Rough sizing for a callout's comment text, used only to pick a
// placement candidate before the box exists in the DOM -- the rendered box
// itself is CSS auto-sized (width: max-content, max-width, height: auto) to
// the real text, so this only needs to be a reasonable estimate, not exact.
const CALLOUT_PADDING_X = 20
const CALLOUT_PADDING_Y = 16
const CALLOUT_MAX_WIDTH = 220
const CALLOUT_CHAR_WIDTH = 6.5
const CALLOUT_LINE_HEIGHT = 17

export function estimateCalloutSize(text: string): { w: number, h: number } {
  const maxTextWidth = CALLOUT_MAX_WIDTH - CALLOUT_PADDING_X
  const naturalWidth = text.length * CALLOUT_CHAR_WIDTH
  const w = Math.round(Math.min(CALLOUT_MAX_WIDTH, naturalWidth + CALLOUT_PADDING_X))
  const lines = Math.max(1, Math.ceil(naturalWidth / maxTextWidth))
  const h = Math.round(lines * CALLOUT_LINE_HEIGHT + CALLOUT_PADDING_Y)
  return { w, h }
}
