import { describe, it, expect } from 'vitest'
import { rectsOverlap, placeCallout, elbowPath, pointsToSvgPath, type Rect } from '../useHighlightLayout'

const slideRect: Rect = { x: 0, y: 0, w: 980, h: 552 }

describe('rectsOverlap', () => {
  it('detects overlap', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
  })

  it('detects no overlap when rects are disjoint', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 })).toBe(false)
  })

  it('touching edges do not count as overlapping', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)
  })
})

describe('placeCallout', () => {
  const codeRect: Rect = { x: 40, y: 40, w: 400, h: 300 }
  const highlightRect: Rect = { x: 60, y: 100, w: 200, h: 20 }
  const calloutSize = { w: 150, h: 60 }

  it('places to the right when space is available', () => {
    const result = placeCallout({ codeRect, highlightRect, calloutSize, slideRect, placed: [] })
    expect(result.side).toBe('right')
    expect(result.stacked).toBe(false)
    expect(rectsOverlap(result.rect, codeRect)).toBe(false)
  })

  it('falls back to left when right has no room', () => {
    // Plenty of margin to the left of the code block, but the slide is only
    // wide enough to leave a sliver of room to its right.
    const roomyLeftCode: Rect = { x: 200, y: 40, w: 400, h: 300 }
    const narrowSlide: Rect = { x: 0, y: 0, w: roomyLeftCode.x + roomyLeftCode.w + 50, h: 552 }
    const result = placeCallout({ codeRect: roomyLeftCode, highlightRect, calloutSize, slideRect: narrowSlide, placed: [] })
    expect(result.side).toBe('left')
    expect(rectsOverlap(result.rect, roomyLeftCode)).toBe(false)
  })

  it('avoids colliding with already-placed callouts', () => {
    const first = placeCallout({ codeRect, highlightRect, calloutSize, slideRect, placed: [] })
    const second = placeCallout({
      codeRect,
      highlightRect: { ...highlightRect, y: highlightRect.y + 10 },
      calloutSize,
      slideRect,
      placed: [first.rect],
    })
    expect(rectsOverlap(second.rect, first.rect)).toBe(false)
    expect(rectsOverlap(second.rect, codeRect)).toBe(false)
  })

  it('stacks rather than omitting the callout when no side has room', () => {
    const tinySlide: Rect = { x: 0, y: 0, w: codeRect.w + 20, h: codeRect.h + 20 }
    const cramped: Rect = { x: 10, y: 10, w: codeRect.w, h: codeRect.h }
    const result = placeCallout({ codeRect: cramped, highlightRect, calloutSize, slideRect: tinySlide, placed: [] })
    expect(result.stacked).toBe(true)
    expect(result.rect.w).toBe(calloutSize.w)
    expect(result.rect.h).toBe(calloutSize.h)
  })
})

describe('elbowPath', () => {
  it('routes right-side connectors via a single bend at the box edge', () => {
    const highlightRect: Rect = { x: 60, y: 100, w: 200, h: 20 }
    const calloutRect: Rect = { x: 500, y: 90, w: 150, h: 60 }
    const points = elbowPath(highlightRect, calloutRect, 'right')
    expect(points).toHaveLength(3)
    const [anchor, bend, boxEdge] = points
    expect(anchor.x).toBe(highlightRect.x + highlightRect.w)
    expect(boxEdge.x).toBe(calloutRect.x)
    expect(bend.x).toBe(boxEdge.x)
    expect(bend.y).toBe(anchor.y)
  })

  it('routes below-side connectors via a vertical-then-horizontal bend', () => {
    const highlightRect: Rect = { x: 60, y: 100, w: 200, h: 20 }
    const calloutRect: Rect = { x: 100, y: 300, w: 150, h: 60 }
    const points = elbowPath(highlightRect, calloutRect, 'below')
    const [anchor, bend, boxEdge] = points
    expect(anchor.y).toBe(highlightRect.y + highlightRect.h)
    expect(boxEdge.y).toBe(calloutRect.y)
    expect(bend.y).toBe(boxEdge.y)
    expect(bend.x).toBe(anchor.x)
  })
})

describe('pointsToSvgPath', () => {
  it('renders an SVG path "M x y L x y ..." string', () => {
    expect(pointsToSvgPath([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('M 1 2 L 3 4')
  })

  it('returns an empty string for no points', () => {
    expect(pointsToSvgPath([])).toBe('')
  })
})
