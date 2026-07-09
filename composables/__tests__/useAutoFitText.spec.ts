import { describe, it, expect, vi } from 'vitest'
import { findFitFontSize, AUTOFIT_MIN_PT, AUTOFIT_MAX_PT } from '../useAutoFitText'

describe('findFitFontSize', () => {
  it('returns the max size when content never overflows', () => {
    const overflows = vi.fn(() => false)
    const size = findFitFontSize(AUTOFIT_MIN_PT, AUTOFIT_MAX_PT, overflows)
    expect(size).toBe(AUTOFIT_MAX_PT)
    expect(overflows).toHaveBeenCalledTimes(1)
  })

  it('returns the min size when content overflows even at the floor', () => {
    const overflows = vi.fn(() => true)
    const size = findFitFontSize(AUTOFIT_MIN_PT, AUTOFIT_MAX_PT, overflows)
    expect(size).toBe(AUTOFIT_MIN_PT)
  })

  it('converges on a size between min and max when overflow depends on size', () => {
    // Simulate content that fits at sizes <= 18 but overflows above that.
    const threshold = 18
    const overflows = (size: number) => size > threshold
    const size = findFitFontSize(AUTOFIT_MIN_PT, AUTOFIT_MAX_PT, overflows)
    expect(size).toBeLessThanOrEqual(threshold)
    expect(size).toBeGreaterThan(AUTOFIT_MIN_PT)
    // Should converge close to the threshold, not just fall back to the floor.
    expect(threshold - size).toBeLessThan(1)
  })

  it('respects a custom min/max range', () => {
    const overflows = () => false
    expect(findFitFontSize(8, 32, overflows)).toBe(32)
  })

  it('never calls overflows with a size outside [min, max]', () => {
    const seen: number[] = []
    const overflows = (size: number) => {
      seen.push(size)
      return size > 20
    }
    findFitFontSize(AUTOFIT_MIN_PT, AUTOFIT_MAX_PT, overflows)
    for (const size of seen) {
      expect(size).toBeGreaterThanOrEqual(AUTOFIT_MIN_PT)
      expect(size).toBeLessThanOrEqual(AUTOFIT_MAX_PT)
    }
  })

  it('is bounded by maxIterations', () => {
    let calls = 0
    const overflows = (size: number) => {
      calls++
      return size > 18
    }
    findFitFontSize(AUTOFIT_MIN_PT, AUTOFIT_MAX_PT, overflows, 3)
    // 2 calls for the min/max short-circuit checks + up to `maxIterations` binary-search steps.
    expect(calls).toBeLessThanOrEqual(2 + 3)
  })
})
