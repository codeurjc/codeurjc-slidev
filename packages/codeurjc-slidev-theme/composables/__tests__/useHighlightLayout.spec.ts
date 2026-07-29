import { describe, it, expect } from 'vitest'
import { rectsOverlap, placeCallout, elbowPath, pointsToSvgPath, estimateCalloutSize, type Rect } from '../useHighlightLayout'

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

  it('shelf-stacks past an occupied side instead of abandoning it for a worse side', () => {
    // A tall code block with little room below/above (mirrors a slide whose
    // content fills nearly the full height) but plenty of room to the right.
    // A third highlight whose natural right-side slot collides with an
    // already-placed callout should slide along the right side rather than
    // jumping to 'above' and overlapping whatever sits above the code block.
    const tallCode: Rect = { x: 40, y: 40, w: 400, h: 460 }
    const tightSlide: Rect = { x: 0, y: 0, w: 980, h: 502 }
    const firstHl: Rect = { x: 60, y: 60, w: 200, h: 16 }
    const secondHl: Rect = { x: 60, y: 150, w: 200, h: 16 }
    const thirdHl: Rect = { x: 60, y: 155, w: 200, h: 16 }

    const first = placeCallout({ codeRect: tallCode, highlightRect: firstHl, calloutSize, slideRect: tightSlide, placed: [] })
    expect(first.side).toBe('right')
    const second = placeCallout({ codeRect: tallCode, highlightRect: secondHl, calloutSize, slideRect: tightSlide, placed: [first.rect] })
    expect(second.side).toBe('right')
    const third = placeCallout({ codeRect: tallCode, highlightRect: thirdHl, calloutSize, slideRect: tightSlide, placed: [first.rect, second.rect] })

    expect(third.side).toBe('right')
    expect(third.stacked).toBe(false)
    expect(rectsOverlap(third.rect, first.rect)).toBe(false)
    expect(rectsOverlap(third.rect, second.rect)).toBe(false)
    expect(rectsOverlap(third.rect, tallCode)).toBe(false)
  })

  it('stacks rather than omitting the callout when no side has room', () => {
    const tinySlide: Rect = { x: 0, y: 0, w: codeRect.w + 20, h: codeRect.h + 20 }
    const cramped: Rect = { x: 10, y: 10, w: codeRect.w, h: codeRect.h }
    const result = placeCallout({ codeRect: cramped, highlightRect, calloutSize, slideRect: tinySlide, placed: [] })
    expect(result.stacked).toBe(true)
    expect(result.rect.w).toBe(calloutSize.w)
    expect(result.rect.h).toBe(calloutSize.h)
  })

  it('clamps the stacked fallback within the slide bounds, even with many prior callouts', () => {
    // A cramped code block (no side has room) plus a tall stack of
    // already-placed callouts used to push the offset fallback rect's y far
    // past the bottom of the slide before clamping was added.
    const tinySlide: Rect = { x: 0, y: 0, w: codeRect.w + 20, h: codeRect.h + 20 }
    const cramped: Rect = { x: 10, y: 10, w: codeRect.w, h: codeRect.h }
    const manyPlaced: Rect[] = Array.from({ length: 10 }, (_, i) => ({ x: 500, y: i * 80, w: calloutSize.w, h: calloutSize.h }))
    const result = placeCallout({ codeRect: cramped, highlightRect, calloutSize, slideRect: tinySlide, placed: manyPlaced })
    expect(result.stacked).toBe(true)
    expect(result.rect.x).toBeGreaterThanOrEqual(tinySlide.x)
    expect(result.rect.x + result.rect.w).toBeLessThanOrEqual(tinySlide.x + tinySlide.w)
    expect(result.rect.y).toBeGreaterThanOrEqual(tinySlide.y)
    expect(result.rect.y + result.rect.h).toBeLessThanOrEqual(tinySlide.y + tinySlide.h)
  })
})

describe('estimateCalloutSize', () => {
  it('sizes a short comment narrower than the max width', () => {
    const size = estimateCalloutSize('Short note')
    expect(size.w).toBeLessThan(220)
    expect(size.h).toBeGreaterThan(0)
  })

  it('caps width and grows height for a long comment', () => {
    const shortSize = estimateCalloutSize('Short')
    const longSize = estimateCalloutSize('This is a much, much longer comment that should wrap across multiple lines inside the callout box')
    expect(longSize.w).toBeLessThanOrEqual(220)
    expect(longSize.h).toBeGreaterThan(shortSize.h)
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
