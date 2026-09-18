import { describe, expect, it } from 'vitest'
import { deckMatches, geometryEntryAt, readEventStream, sameEntry } from '../liveLink'

describe('deckMatches', () => {
  it('matches an absolute announced path', () => {
    expect(deckMatches('/course/tema1.md', '/course', '/course/tema1.md')).toBe(true)
  })

  it('resolves a relative announced path against the project root', () => {
    expect(deckMatches('tema1.md', '/course', '/course/tema1.md')).toBe(true)
  })

  it('refuses a different deck of the same course', () => {
    expect(deckMatches('/course/tema1.md', '/course', '/course/tema2.md')).toBe(false)
  })
})

describe('readEventStream', () => {
  it('reads complete events and keeps a partial one', () => {
    const { events, rest } = readEventStream('data: {"type":"deck","entry":"a.md"}\n\ndata: {"type":"dr')
    expect(events).toEqual([{ type: 'deck', entry: 'a.md' }])
    expect(rest).toBe('data: {"type":"dr')
  })

  it('reads several events and drops non-JSON payloads', () => {
    const { events, rest } = readEventStream('data: 1\n\ndata: nope\n\ndata: {"a":2}\n\n')
    expect(events).toEqual([1, { a: 2 }])
    expect(rest).toBe('')
  })
})

describe('geometryEntryAt', () => {
  const text = [
    '---',
    'theme: codeurjc-slidev-theme',
    '---',
    '',
    '# Cover',
    '',
    '---',
    'layout: default',
    'geometry:',
    '  content: {x: 31, y: 98, w: 400, h: 424}',
    '  images:',
    '    - {src: /images/a.png, x: 1, y: 2, w: 3, h: 4}',
    '  elements:',
    '    - {id: flow, x: 1, y: 2, w: 3, h: 4}',
    '    - id: table',
    '      x: 1',
    '      y: 2',
    '      w: 3',
    '      h: 4',
    '---',
    '',
    '# Two',
  ]
  const at = (needle: string) => geometryEntryAt(text.join('\n'), text.findIndex(l => l.includes(needle)))

  it('names the content box', () => {
    expect(at('content:')).toEqual({ slideNo: 2, collection: 'content', index: 0 })
  })

  it('names images and elements entries by index', () => {
    expect(at('/images/a.png')).toEqual({ slideNo: 2, collection: 'images', index: 0 })
    expect(at('{id: flow')).toEqual({ slideNo: 2, collection: 'elements', index: 0 })
  })

  it('names a block-style entry from any of its lines', () => {
    expect(at('      w: 3')).toEqual({ slideNo: 2, collection: 'elements', index: 1 })
  })

  it('is null outside geometry', () => {
    expect(at('layout: default')).toBeNull()
    expect(at('# Two')).toBeNull()
    expect(at('# Cover')).toBeNull()
  })
})

describe('sameEntry', () => {
  it('compares by slide, collection and index', () => {
    const a = { slideNo: 2, collection: 'elements' as const, index: 0 }
    expect(sameEntry(a, { ...a })).toBe(true)
    expect(sameEntry(a, { ...a, index: 1 })).toBe(false)
    expect(sameEntry(null, null)).toBe(true)
    expect(sameEntry(a, null)).toBe(false)
  })
})
