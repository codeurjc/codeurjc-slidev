import { describe, expect, it } from 'vitest'
import { formatStepRange, isVisibleAt, parseStepRange, rangeRegistrations, rangesOverlap } from '../stepRange'

describe('parseStepRange', () => {
  it.each([
    ['2', { from: 2 }],
    ['2-', { from: 2 }],
    ['2-4', { from: 2, to: 4 }],
    ['2-2', { from: 2, to: 2 }],
    ['-1', { to: 1 }],
    ['-0', { to: 0 }],
    [3, { from: 3 }],
    [-1, { to: 1 }],
    [-0, { to: 0 }],
  ] as const)('%s → %j', (text, range) => {
    expect(parseStepRange(text)).toEqual(range)
  })

  it.each(['0', '0-2', '3-2', '-', '2-3-4', '', 'x', '1.5', '+2', ' 2 x'])('rejects %j', (text) => {
    expect(parseStepRange(text)).toBeNull()
  })
})

describe('formatStepRange', () => {
  it.each([
    [{ from: 2 }, '2'],
    [{ from: 2, to: 4 }, '2-4'],
    [{ to: 0 }, '-0'],
    [{ to: 3 }, '-3'],
  ])('%j → %s', (range, text) => {
    expect(formatStepRange(range)).toBe(text)
  })
})

describe('isVisibleAt', () => {
  it('follows inclusive bounds and open ends', () => {
    const at = (range: object) => [0, 1, 2, 3, 4, 5].filter(c => isVisibleAt(range, c))
    expect(at({ from: 2 })).toEqual([2, 3, 4, 5])
    expect(at({ from: 2, to: 4 })).toEqual([2, 3, 4])
    expect(at({ to: 1 })).toEqual([0, 1])
    expect(at({ to: 0 })).toEqual([0])
  })
})

describe('rangeRegistrations', () => {
  it('registers the start and the click after the end', () => {
    expect(rangeRegistrations({ from: 2 })).toEqual([2])
    expect(rangeRegistrations({ from: 2, to: 4 })).toEqual([2, 5])
    expect(rangeRegistrations({ to: 0 })).toEqual([1])
  })
})

describe('rangesOverlap', () => {
  it('treats a missing range as always visible', () => {
    expect(rangesOverlap(undefined, { from: 9 })).toBe(true)
    expect(rangesOverlap({ to: 0 }, { from: 1, to: 1 })).toBe(false)
    expect(rangesOverlap({ from: 1, to: 2 }, { from: 2 })).toBe(true)
    expect(rangesOverlap({ from: 3 }, { to: 2 })).toBe(false)
  })
})
