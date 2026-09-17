import { describe, expect, it } from 'vitest'
import {
  geometryContentKey,
  geometryContentVars,
  geometryImageKey,
  geometryKeyPrefix,
  hasGeometryImages,
  isGeometryKey,
  parseSlideGeometry,
  resolveGeometryImages,
  serializeSlideGeometry,
  withGeometryRect,
  withPositionedImage,
} from '../useSlideGeometry'

describe('parseSlideGeometry', () => {
  it('returns an empty geometry when the frontmatter has none', () => {
    expect(parseSlideGeometry({ layout: 'default' })).toEqual({ content: null, images: [], imageRefs: [], warnings: [] })
    expect(parseSlideGeometry(undefined)).toEqual({ content: null, images: [], imageRefs: [], warnings: [] })
  })

  it('reads content only', () => {
    const g = parseSlideGeometry({ geometry: { content: { x: 31, y: 98, w: 560, h: 424 } } })
    expect(g.content).toEqual({ x: 31, y: 98, w: 560, h: 424 })
    expect(g.images).toEqual([])
    expect(g.warnings).toEqual([])
    expect(hasGeometryImages(g)).toBe(false)
  })

  it('reads images only, in order', () => {
    const g = parseSlideGeometry({ geometry: { images: [{ x: 1, y: 2, w: 3, h: 4 }, { x: 5, y: 6, w: 7, h: 8 }] } })
    expect(g.content).toBeNull()
    expect(g.images).toEqual([{ x: 1, y: 2, w: 3, h: 4 }, { x: 5, y: 6, w: 7, h: 8 }])
    expect(hasGeometryImages(g)).toBe(true)
  })

  it('reads both content and images', () => {
    const g = parseSlideGeometry({ geometry: { content: { x: 0, y: 0, w: 10, h: 10 }, images: [{ x: 1, y: 1, w: 1, h: 1 }] } })
    expect(g.content).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    expect(g.images).toHaveLength(1)
  })

  it('drops content with a missing field and names it in the warning', () => {
    const g = parseSlideGeometry({ geometry: { content: { x: 1, y: 2, w: 3 } } })
    expect(g.content).toBeNull()
    expect(g.warnings).toEqual(['geometry.content.h must be a number'])
  })

  it('rejects non-numeric, negative and non-positive values', () => {
    expect(parseSlideGeometry({ geometry: { content: { x: '1', y: 2, w: 3, h: 4 } } }).warnings).toEqual(['geometry.content.x must be a number'])
    expect(parseSlideGeometry({ geometry: { content: { x: -1, y: 2, w: 3, h: 4 } } }).warnings).toEqual(['geometry.content.x must not be negative'])
    expect(parseSlideGeometry({ geometry: { content: { x: 1, y: 2, w: 0, h: 4 } } }).warnings).toEqual(['geometry.content.w must be greater than 0'])
    expect(parseSlideGeometry({ geometry: { content: { x: 1, y: 2, w: 3, h: -4 } } }).warnings).toEqual(['geometry.content.h must be greater than 0'])
  })

  it('keeps an invalid image entry as a null placeholder so later entries keep their index', () => {
    const g = parseSlideGeometry({ geometry: { images: [{ x: 1 }, { x: 5, y: 6, w: 7, h: 8 }] } })
    expect(g.images).toEqual([null, { x: 5, y: 6, w: 7, h: 8 }])
    expect(g.warnings).toEqual(['geometry.images[0].y must be a number'])
    expect(hasGeometryImages(g)).toBe(true)
  })

  it('warns when images is not a list', () => {
    const g = parseSlideGeometry({ geometry: { images: { x: 1, y: 1, w: 1, h: 1 } } })
    expect(g.images).toEqual([])
    expect(g.warnings).toEqual(['geometry.images must be a list'])
  })

  it('warns when geometry itself is not an object', () => {
    expect(parseSlideGeometry({ geometry: 'wide' }).warnings).toEqual(['geometry must be an object with optional content and images'])
  })

  it('ignores extra unknown keys', () => {
    const g = parseSlideGeometry({ geometry: { content: { x: 1, y: 2, w: 3, h: 4, z: 9 }, title: { x: 0 } } })
    expect(g.content).toEqual({ x: 1, y: 2, w: 3, h: 4 })
    expect(g.warnings).toEqual([])
  })
})

describe('serializeSlideGeometry', () => {
  it('rounds to whole pixels and omits empty parts', () => {
    expect(serializeSlideGeometry({ content: { x: 1.4, y: 2.6, w: 3, h: 4 } })).toEqual({ content: { x: 1, y: 3, w: 3, h: 4 } })
    expect(serializeSlideGeometry({ images: [{ x: 0, y: 0, w: 10.5, h: 10 }] })).toEqual({ images: [{ x: 0, y: 0, w: 11, h: 10 }] })
    expect(serializeSlideGeometry({ content: null, images: [] })).toBeUndefined()
  })
})

describe('withGeometryRect', () => {
  it('replaces only the targeted image, keeping other entries as authored', () => {
    const raw = { content: { x: 1, y: 1, w: 1, h: 1 }, images: [{ x: 'bad' }, { x: 5, y: 6, w: 7, h: 8 }] }
    const next = withGeometryRect(raw, { kind: 'image', index: 1 }, { x: 55, y: 6, w: 7, h: 8 })
    expect(next).toEqual({ content: { x: 1, y: 1, w: 1, h: 1 }, images: [{ x: 'bad' }, { x: 55, y: 6, w: 7, h: 8 }] })
    // the input is not mutated
    expect(raw.images[1]).toEqual({ x: 5, y: 6, w: 7, h: 8 })
  })

  it('replaces the content rect', () => {
    expect(withGeometryRect({ images: [] }, { kind: 'content' }, { x: 2.2, y: 3, w: 4, h: 5 })).toEqual({ images: [], content: { x: 2, y: 3, w: 4, h: 5 } })
  })

  it('starts from an empty object when there is no authored geometry', () => {
    expect(withGeometryRect(undefined, { kind: 'image', index: 0 }, { x: 1, y: 2, w: 3, h: 4 })).toEqual({ images: [{ x: 1, y: 2, w: 3, h: 4 }] })
  })

  it('keeps an entry\'s src when replacing its rect', () => {
    const next = withGeometryRect({ images: [{ src: '/images/a.png', x: 1, y: 1, w: 1, h: 1 }] }, { kind: 'image', index: 0 }, { x: 9, y: 9, w: 9, h: 9 })
    expect(next).toEqual({ images: [{ src: '/images/a.png', x: 9, y: 9, w: 9, h: 9 }] })
  })

  it('migrates resolvable positional entries to src references, keeping the rest as written', () => {
    const raw = { images: [{ x: 1, y: 1, w: 1, h: 1 }, { x: 2, y: 2, w: 2, h: 2 }, { x: 3, y: 3, w: 3, h: 3 }] }
    // The third entry has no image to resolve to.
    const next = withGeometryRect(raw, { kind: 'image', index: 1 }, { x: 20, y: 2, w: 2, h: 2 }, ['/images/a.png', '/images/a.png'])
    expect(next.images).toEqual([
      { src: '/images/a.png#1', x: 1, y: 1, w: 1, h: 1 },
      { src: '/images/a.png#2', x: 20, y: 2, w: 2, h: 2 },
      { x: 3, y: 3, w: 3, h: 3 },
    ])
  })

  it('doesn\'t migrate a positional entry onto an image a src entry already positions', () => {
    const raw = { images: [{ x: 1, y: 1, w: 1, h: 1 }, { src: '/images/a.png', x: 2, y: 2, w: 2, h: 2 }] }
    const next = withGeometryRect(raw, { kind: 'image', index: 1 }, { x: 5, y: 5, w: 5, h: 5 }, ['/images/a.png'])
    expect(next.images).toEqual([{ x: 1, y: 1, w: 1, h: 1 }, { src: '/images/a.png', x: 5, y: 5, w: 5, h: 5 }])
  })
})

describe('src-keyed geometry images', () => {
  it('parses src entries next to positional ones and rejects invalid srcs', () => {
    const g = parseSlideGeometry({ geometry: { images: [{ src: '/images/b.png#2', x: 1, y: 2, w: 3, h: 4 }, { x: 5, y: 6, w: 7, h: 8 }, { src: '/images/c.png#0', x: 1, y: 1, w: 1, h: 1 }] } })
    expect(g.imageRefs).toEqual([{ kind: 'src', src: '/images/b.png', occurrence: 2 }, { kind: 'position', index: 1 }, { kind: 'position', index: 2 }])
    expect(g.images).toEqual([{ x: 1, y: 2, w: 3, h: 4 }, { x: 5, y: 6, w: 7, h: 8 }, null])
    expect(g.warnings).toEqual(['geometry.images[2].src must be an image src, optionally with #N (N >= 1)'])
  })

  it('resolves src entries first, so an inserted image doesn\'t move them', () => {
    const g = parseSlideGeometry({ geometry: { images: [{ src: '/images/b.png', x: 1, y: 1, w: 1, h: 1 }] } })
    expect(resolveGeometryImages(g, ['/images/new.png', '/images/a.png', '/images/b.png']).indexes).toEqual([2])
  })

  it('skips a positional entry whose image a src entry claimed, and warns about unresolvable srcs', () => {
    const g = parseSlideGeometry({ geometry: { images: [{ x: 1, y: 1, w: 1, h: 1 }, { src: '/images/a.png', x: 2, y: 2, w: 2, h: 2 }, { src: '/images/gone.png', x: 3, y: 3, w: 3, h: 3 }] } })
    const { indexes, warnings } = resolveGeometryImages(g, ['/images/a.png', '/images/b.png'])
    expect(indexes).toEqual([-1, 0, -1])
    expect(warnings).toEqual([
      'geometry.images[2]: no image with src "/images/gone.png"',
      'geometry.images[0]: image 0 is already positioned by another entry',
    ])
  })

  it('serializes src-keyed entries with the src first', () => {
    expect(serializeSlideGeometry({ images: [{ src: '/images/a.png', x: 1.2, y: 2, w: 3, h: 4 }] })).toEqual({ images: [{ src: '/images/a.png', x: 1, y: 2, w: 3, h: 4 }] })
  })
})

describe('editor keys and CSS vars', () => {
  it('scopes keys by slide number without prefix collisions', () => {
    expect(geometryContentKey(1)).toBe('geometry:1:content')
    expect(geometryImageKey(10, 2)).toBe('geometry:10:image:2')
    expect(geometryImageKey(10, 2).startsWith(geometryKeyPrefix(1))).toBe(false)
    expect(isGeometryKey('geometry:3:content')).toBe(true)
    expect(isGeometryKey('callout:0')).toBe(false)
  })

  it('maps a content rect to --ed-content-* variables', () => {
    expect(geometryContentVars({ x: 31, y: 98, w: 560, h: 424 })).toEqual({
      '--ed-content-x': '31px',
      '--ed-content-y': '98px',
      '--ed-content-w': '560px',
      '--ed-content-h': '424px',
    })
  })
})

describe('withPositionedImage', () => {
  const content = { x: 0, y: 80, w: 876, h: 137 }
  const rect = { x: 245, y: 241, w: 490, h: 290 }
  const pasted = { kind: 'src' as const, src: '/images/paste-2.png' }

  it('writes content and a src-keyed entry on a slide without geometry', () => {
    expect(withPositionedImage(undefined, content, pasted, rect, ['/images/paste-2.png'])).toEqual({
      content,
      images: [{ src: '/images/paste-2.png', ...rect }],
    })
  })

  it('appends next to other entries, keeping (and migrating) them', () => {
    const raw = { images: [{ x: 600, y: 120, w: 300, h: 200 }] }
    const next = withPositionedImage(raw, content, pasted, rect, ['/images/screenshot.png', '/images/paste-2.png'])
    expect(next.images).toEqual([
      { src: '/images/screenshot.png', x: 600, y: 120, w: 300, h: 200 },
      { src: '/images/paste-2.png', ...rect },
    ])
  })

  it('replaces the entry that already positions the pasted image', () => {
    const raw = { content: { x: 0, y: 80, w: 452, h: 400 }, images: [{ src: '/images/paste-2.png', x: 476, y: 80, w: 400, h: 400 }] }
    const next = withPositionedImage(raw, content, pasted, rect, ['/images/paste-2.png'])
    expect(next).toEqual({ content, images: [{ src: '/images/paste-2.png', ...rect }] })
  })
})
