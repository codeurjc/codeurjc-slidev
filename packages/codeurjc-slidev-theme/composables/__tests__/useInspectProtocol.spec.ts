import { describe, expect, it } from 'vitest'
import { inspectKeyFor } from '../useInspectKeys'
import { parseEntryRef, parseInspectCommand, parseInspectEvent, parseInspectKey } from '../useInspectProtocol'
import { parseSlideGeometry } from '../useSlideGeometry'

describe('parseInspectCommand', () => {
  it('reads inspect on/off', () => {
    expect(parseInspectCommand({ type: 'inspect', on: true })).toEqual({ type: 'inspect', on: true })
    expect(parseInspectCommand({ type: 'inspect', on: false })).toEqual({ type: 'inspect', on: false })
  })

  it('reads a control claim', () => {
    expect(parseInspectCommand({ type: 'control', on: true })).toEqual({ type: 'control', on: true })
  })

  it('reads the deck-identity request', () => {
    expect(parseInspectCommand({ type: 'whichDeck' })).toEqual({ type: 'whichDeck' })
  })

  it('reads a highlight and a cleared highlight', () => {
    const entry = { slideNo: 14, collection: 'elements', index: 2 }
    expect(parseInspectCommand({ type: 'highlight', entry })).toEqual({ type: 'highlight', entry })
    expect(parseInspectCommand({ type: 'highlight', entry: null })).toEqual({ type: 'highlight', entry: null })
  })

  it('rejects malformed commands rather than guessing', () => {
    expect(parseInspectCommand(null)).toBeNull()
    expect(parseInspectCommand({ type: 'inspect' })).toBeNull()
    expect(parseInspectCommand({ type: 'inspect', on: 'yes' })).toBeNull()
    expect(parseInspectCommand({ type: 'nonsense' })).toBeNull()
    expect(parseInspectCommand({ type: 'highlight', entry: { slideNo: 0, collection: 'elements', index: 0 } })).toBeNull()
  })
})

describe('parseEntryRef', () => {
  it('accepts the three collections', () => {
    for (const collection of ['content', 'images', 'elements'])
      expect(parseEntryRef({ slideNo: 1, collection, index: 0 })).toMatchObject({ collection })
  })

  it('rejects an unknown collection, a zero slide, and a negative index', () => {
    expect(parseEntryRef({ slideNo: 1, collection: 'callouts', index: 0 })).toBeNull()
    expect(parseEntryRef({ slideNo: 0, collection: 'elements', index: 0 })).toBeNull()
    expect(parseEntryRef({ slideNo: 1, collection: 'elements', index: -1 })).toBeNull()
  })
})

describe('parseInspectKey', () => {
  it('reads each key form', () => {
    expect(parseInspectKey({ kind: 'content' })).toEqual({ kind: 'content' })
    expect(parseInspectKey({ kind: 'id', name: 'flow' })).toEqual({ kind: 'id', name: 'flow' })
    expect(parseInspectKey({ kind: 'code', text: '@/code/A.java' })).toEqual({ kind: 'code', text: '@/code/A.java' })
    expect(parseInspectKey({ kind: 'image', ref: '/images/a.png#2' })).toEqual({ kind: 'image', ref: '/images/a.png#2' })
  })

  it('rejects an empty or missing name', () => {
    expect(parseInspectKey({ kind: 'id', name: '' })).toBeNull()
    expect(parseInspectKey({ kind: 'id' })).toBeNull()
    expect(parseInspectKey({ kind: 'elsewhere' })).toBeNull()
  })
})

describe('parseInspectEvent', () => {
  const drag = {
    type: 'drag',
    slideNo: 14,
    key: { kind: 'id', name: 'flow' },
    from: { x: 510, y: 390, w: 440, h: 140 },
    to: { x: 300, y: 200, w: 440, h: 140 },
  }

  it('reads a drag carrying both the rect it came from and the rect it went to', () => {
    expect(parseInspectEvent(drag)).toEqual(drag)
  })

  it('reads the deck identity sent on attach', () => {
    expect(parseInspectEvent({ type: 'deck', entry: '/decks/tema1.md' })).toEqual({ type: 'deck', entry: '/decks/tema1.md' })
    expect(parseInspectEvent({ type: 'deck', entry: '' })).toBeNull()
  })

  it('rejects a drag missing a rect or carrying a non-numeric one', () => {
    expect(parseInspectEvent({ ...drag, to: undefined })).toBeNull()
    expect(parseInspectEvent({ ...drag, from: { x: 1, y: 2, w: 3 } })).toBeNull()
    expect(parseInspectEvent({ ...drag, to: { x: 1, y: 2, w: 3, h: Number.NaN } })).toBeNull()
  })

  it('rejects a drag with no usable key', () => {
    expect(parseInspectEvent({ ...drag, key: { kind: 'id', name: '' } })).toBeNull()
  })
})

describe('inspectKeyFor', () => {
  const geometry = parseSlideGeometry({
    geometry: {
      content: { x: 1, y: 2, w: 3, h: 4 },
      images: [
        { src: '/images/a.png', x: 1, y: 2, w: 3, h: 4 },
        { x: 1, y: 2, w: 3, h: 4 },
      ],
      elements: [
        { id: 'flow', x: 1, y: 2, w: 3, h: 4 },
        { code: '@/code/A.java', x: 1, y: 2, w: 3, h: 4 },
        { image: '/images/c.png#2', x: 1, y: 2, w: 3, h: 4 },
      ],
    },
  })
  const srcs = ['/images/a.png', '/images/b.png']

  it('names content, element keys and src image entries by their own keys', () => {
    expect(inspectKeyFor(geometry, { kind: 'content' }, srcs)).toEqual({ kind: 'content' })
    expect(inspectKeyFor(geometry, { kind: 'element', index: 0 }, srcs)).toEqual({ kind: 'id', name: 'flow' })
    expect(inspectKeyFor(geometry, { kind: 'element', index: 1 }, srcs)).toEqual({ kind: 'code', text: '@/code/A.java' })
    expect(inspectKeyFor(geometry, { kind: 'element', index: 2 }, srcs)).toEqual({ kind: 'image', ref: '/images/c.png#2' })
    expect(inspectKeyFor(geometry, { kind: 'image', index: 0 }, srcs)).toEqual({ kind: 'image', ref: '/images/a.png' })
  })

  it('names a positional image entry by the src of the image it resolves to', () => {
    // Entry 1 is positional: the 2nd content image, /images/b.png.
    expect(inspectKeyFor(geometry, { kind: 'image', index: 1 }, srcs)).toEqual({ kind: 'image', ref: '/images/b.png' })
  })

  it('is null when a positional entry resolves to nothing', () => {
    expect(inspectKeyFor(geometry, { kind: 'image', index: 1 }, ['/images/a.png'])).toBeNull()
  })
})
