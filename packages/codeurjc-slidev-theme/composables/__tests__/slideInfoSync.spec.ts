import { describe, expect, it, vi } from 'vitest'
import { onSlideInfoPublished, publishSlideInfo } from '../slideInfoSync'

describe('slideInfoSync', () => {
  it('delivers published slide info to subscribers until they unsubscribe', () => {
    const handler = vi.fn()
    const stop = onSlideInfoPublished(handler)
    publishSlideInfo(3, { frontmatter: { geometry: {} } })
    expect(handler).toHaveBeenCalledWith({ no: 3, info: { frontmatter: { geometry: {} } } })

    stop()
    publishSlideInfo(4, {})
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
