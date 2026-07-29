import { describe, it, expect } from 'vitest'
import { computeBelowPreset, computeRightPreset } from '../useImagePosition'

const CONTENT = { x: 0, y: 80, w: 876, h: 400 }
const SLIDE_WIDTH = 980

describe('computeBelowPreset', () => {
  it('resets content to full width at x=0', () => {
    const { content } = computeBelowPreset(CONTENT, SLIDE_WIDTH, 1, CONTENT.w)
    expect(content.x).toBe(0)
    expect(content.w).toBe(CONTENT.w)
    expect(content.h).toBe(CONTENT.h)
  })

  it('positions the image below the content box, horizontally centered', () => {
    const { content, image } = computeBelowPreset(CONTENT, SLIDE_WIDTH, 1, CONTENT.w)
    expect(image.y).toBeGreaterThan(content.y + content.h)
    expect(image.x + image.w / 2).toBeCloseTo(SLIDE_WIDTH / 2, 0)
  })

  it('derives image height from the given aspect ratio', () => {
    const { image } = computeBelowPreset(CONTENT, SLIDE_WIDTH, 2, CONTENT.w)
    expect(image.w / image.h).toBeCloseTo(2, 1)
  })

  it('does not overlap the content box vertically', () => {
    const { content, image } = computeBelowPreset(CONTENT, SLIDE_WIDTH, 1, CONTENT.w)
    expect(image.y).toBeGreaterThanOrEqual(content.y + content.h)
  })

  it('resets a previously narrowed content box back to the full width, not the narrowed one', () => {
    const narrowed = { ...CONTENT, w: 452 }
    const { content } = computeBelowPreset(narrowed, SLIDE_WIDTH, 1, CONTENT.w)
    expect(content.w).toBe(CONTENT.w)
  })
})

describe('computeRightPreset', () => {
  it('shrinks content width, keeping its x/y/h unchanged', () => {
    const { content } = computeRightPreset(CONTENT, 1)
    expect(content.w).toBeLessThan(CONTENT.w)
    expect(content.x).toBe(CONTENT.x)
    expect(content.y).toBe(CONTENT.y)
    expect(content.h).toBe(CONTENT.h)
  })

  it('positions the image to the right of the shrunk content box without overlap', () => {
    const { content, image } = computeRightPreset(CONTENT, 1)
    expect(image.x).toBeGreaterThanOrEqual(content.x + content.w)
  })

  it('matches the image height to the content box height', () => {
    const { content, image } = computeRightPreset(CONTENT, 1)
    expect(image.h).toBe(content.h)
  })

  it('caps image width at half the box for an extreme (e.g. panoramic) aspect ratio', () => {
    const { image } = computeRightPreset(CONTENT, 10)
    expect(image.w).toBeLessThanOrEqual(Math.round(CONTENT.w * 0.5))
    expect(image.h).toBeLessThan(CONTENT.h)
  })

  it('derives image width from height and aspect ratio for a narrow aspect ratio', () => {
    const { image } = computeRightPreset(CONTENT, 0.5)
    expect(image.w / image.h).toBeCloseTo(0.5, 1)
  })
})
