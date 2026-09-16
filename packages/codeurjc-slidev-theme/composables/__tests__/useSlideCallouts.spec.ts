import { describe, expect, it } from 'vitest'
import {
  boxContainsAnchor,
  calloutAnchorKey,
  calloutBoxKey,
  calloutKeyPrefix,
  containedRect,
  fractionsInRect,
  hasSlideCallouts,
  isSlideCalloutKey,
  parseSlideCallouts,
  pointInRect,
  serializeSlideCallout,
  serializeSlideCallouts,
  withoutSlideCallout,
  withSlideCallout,
} from '../useSlideCallouts'

describe('parseSlideCallouts', () => {
  it('returns nothing when the frontmatter declares no callouts', () => {
    expect(parseSlideCallouts({ layout: 'default' })).toEqual({ callouts: [], warnings: [] })
    expect(parseSlideCallouts(undefined)).toEqual({ callouts: [], warnings: [] })
  })

  it('reads an image anchor with its text and box', () => {
    const parsed = parseSlideCallouts({
      callouts: [{ at: { image: 0, x: 0.45, y: 0.51 }, text: 'Le damos un nombre', box: { x: 620, y: 300 } }],
    })
    expect(parsed.warnings).toEqual([])
    expect(parsed.callouts).toEqual([{
      anchor: { kind: 'image', index: 0, x: 0.45, y: 0.51 },
      text: 'Le damos un nombre',
      box: { x: 620, y: 300 },
      step: null,
    }])
    expect(hasSlideCallouts(parsed)).toBe(true)
  })

  it('reads a free point anchor', () => {
    const [callout] = parseSlideCallouts({ callouts: [{ at: { x: 480, y: 210 }, text: 'Mira aquí' }] }).callouts
    expect(callout).toEqual({ anchor: { kind: 'point', x: 480, y: 210 }, text: 'Mira aquí', box: null, step: null })
  })

  it('reads a content-text anchor with a click step', () => {
    const [callout] = parseSlideCallouts({ callouts: [{ at: { text: 'Verificar' }, text: 'Lo que mide', step: 2 }] }).callouts
    expect(callout).toEqual({ anchor: { kind: 'text', text: 'Verificar' }, text: 'Lo que mide', box: null, step: 2 })
  })

  it('treats a callout with no text as a bare arrow', () => {
    const [callout] = parseSlideCallouts({ callouts: [{ at: { image: 0, x: 0.5, y: 0.32 } }] }).callouts
    expect(callout).toMatchObject({ text: '' })
  })

  it('keeps an invalid entry as a null placeholder so later entries keep their index', () => {
    const parsed = parseSlideCallouts({ callouts: [{ text: 'no anchor' }, { at: { x: 10, y: 20 }, text: 'ok' }] })
    expect(parsed.callouts[0]).toBeNull()
    expect(parsed.callouts[1]).toMatchObject({ text: 'ok' })
    expect(parsed.warnings).toEqual(['callouts[0].at must be an object: { image, x, y }, { x, y } or { text }'])
  })

  it('rejects an image anchor whose fractions are outside 0..1', () => {
    const parsed = parseSlideCallouts({ callouts: [{ at: { image: 0, x: 1.4, y: 0.5 } }] })
    expect(parsed.callouts).toEqual([null])
    expect(parsed.warnings).toEqual(['callouts[0].at.x must be a fraction between 0 and 1'])
  })

  it('rejects a negative image index and a non-numeric coordinate', () => {
    expect(parseSlideCallouts({ callouts: [{ at: { image: -1, x: 0.5, y: 0.5 } }] }).warnings)
      .toEqual(['callouts[0].at.image must be a non-negative whole number'])
    expect(parseSlideCallouts({ callouts: [{ at: { x: '10', y: 20 } }] }).warnings)
      .toEqual(['callouts[0].at.x must be a number'])
  })

  it('rejects an empty content anchor', () => {
    expect(parseSlideCallouts({ callouts: [{ at: { text: '   ' } }] }).warnings)
      .toEqual(['callouts[0].at.text must be a non-empty string'])
  })

  it('warns about a malformed optional field but keeps the callout', () => {
    const parsed = parseSlideCallouts({ callouts: [{ at: { x: 1, y: 2 }, text: 5, step: 0 }] })
    expect(parsed.callouts[0]).toEqual({ anchor: { kind: 'point', x: 1, y: 2 }, text: '', box: null, step: null })
    expect(parsed.warnings).toEqual([
      'callouts[0].text must be a string',
      'callouts[0].step must be a whole number of at least 1',
    ])
  })

  it('warns when callouts is not a list', () => {
    const parsed = parseSlideCallouts({ callouts: { at: { x: 1, y: 2 } } })
    expect(parsed.callouts).toEqual([])
    expect(parsed.warnings).toEqual(['callouts must be a list'])
  })
})

describe('serializeSlideCallouts', () => {
  it('omits the parts that carry no information', () => {
    expect(serializeSlideCallout({ anchor: { kind: 'point', x: 10.4, y: 20.6 }, text: '', box: null, step: null }))
      .toEqual({ at: { x: 10, y: 21 } })
  })

  it('rounds pixels to whole numbers and fractions to four decimals', () => {
    expect(serializeSlideCallout({
      anchor: { kind: 'image', index: 1, x: 0.123456, y: 0.5 },
      text: 'note',
      box: { x: 12.7, y: 44.2 },
      step: 3,
    })).toEqual({ at: { image: 1, x: 0.1235, y: 0.5 }, text: 'note', box: { x: 13, y: 44 }, step: 3 })
  })

  it('round-trips through the parser', () => {
    const raw = serializeSlideCallouts([
      { anchor: { kind: 'image', index: 0, x: 0.45, y: 0.51 }, text: 'uno', box: { x: 620, y: 300 }, step: 1 },
      { anchor: { kind: 'text', text: 'Verificar' }, text: '', box: null, step: null },
    ])
    const parsed = parseSlideCallouts({ callouts: raw })
    expect(parsed.warnings).toEqual([])
    expect(parsed.callouts).toEqual([
      { anchor: { kind: 'image', index: 0, x: 0.45, y: 0.51 }, text: 'uno', box: { x: 620, y: 300 }, step: 1 },
      { anchor: { kind: 'text', text: 'Verificar' }, text: '', box: null, step: null },
    ])
  })

  it('returns undefined for an empty list', () => {
    expect(serializeSlideCallouts([])).toBeUndefined()
  })
})

describe('withSlideCallout / withoutSlideCallout', () => {
  const authored = [{ at: { x: 1, y: 2 }, text: 'first' }, { at: { nonsense: true }, keep: 'me' }]

  it('replaces one entry and leaves the others exactly as written', () => {
    const next = withSlideCallout(authored, 0, { anchor: { kind: 'point', x: 9, y: 9 }, text: 'edited', box: null, step: null })
    expect(next[0]).toEqual({ at: { x: 9, y: 9 }, text: 'edited' })
    expect(next[1]).toEqual({ at: { nonsense: true }, keep: 'me' })
  })

  it('appends when the index is past the end', () => {
    const next = withSlideCallout(undefined, 0, { anchor: { kind: 'point', x: 5, y: 6 }, text: '', box: null, step: null })
    expect(next).toEqual([{ at: { x: 5, y: 6 } }])
  })

  it('removes one entry, keeping the rest as written', () => {
    const next = withoutSlideCallout(authored, 0)
    expect(next).toEqual([{ at: { nonsense: true }, keep: 'me' }])
  })
})

describe('anchor geometry', () => {
  it('fits a picture inside its box, centred, keeping its aspect ratio', () => {
    // A 2:1 picture in a square box letterboxes: full width, half height, centred.
    expect(containedRect({ x: 0, y: 0, w: 200, h: 200 }, 400, 200)).toEqual({ x: 0, y: 50, w: 200, h: 100 })
    // A 1:2 picture pillarboxes.
    expect(containedRect({ x: 10, y: 10, w: 200, h: 200 }, 200, 400)).toEqual({ x: 60, y: 10, w: 100, h: 200 })
  })

  it('falls back to the box when the natural size is unknown', () => {
    const box = { x: 5, y: 6, w: 100, h: 50 }
    expect(containedRect(box, 0, 0)).toBe(box)
  })

  it('resolves a fraction against the rendered rect, not the box', () => {
    const box = { x: 0, y: 0, w: 200, h: 200 }
    const rendered = containedRect(box, 400, 200)
    // The centre of the picture sits at the centre of the box here, but the
    // top of the picture is 50px down from the box's top.
    expect(pointInRect(rendered, 0.5, 0.5)).toEqual({ x: 100, y: 100 })
    expect(pointInRect(rendered, 0, 0)).toEqual({ x: 0, y: 50 })
  })

  it('round-trips a point back to fractions, clamping overshoot', () => {
    const rect = { x: 20, y: 40, w: 200, h: 100 }
    expect(fractionsInRect(rect, pointInRect(rect, 0.25, 0.75))).toEqual({ x: 0.25, y: 0.75 })
    expect(fractionsInRect(rect, { x: -50, y: 1000 })).toEqual({ x: 0, y: 1 })
  })

  it('detects a box that covers its own anchor', () => {
    const box = { x: 100, y: 100, w: 80, h: 40 }
    expect(boxContainsAnchor(box, { x: 120, y: 120 })).toBe(true)
    expect(boxContainsAnchor(box, { x: 100, y: 140 })).toBe(true)
    expect(boxContainsAnchor(box, { x: 99, y: 120 })).toBe(false)
    expect(boxContainsAnchor(box, { x: 120, y: 141 })).toBe(false)
  })
})

describe('editor keys', () => {
  it('scopes keys by slide and index', () => {
    expect(calloutKeyPrefix(3)).toBe('slide-callout:3:')
    expect(calloutBoxKey(3, 1)).toBe('slide-callout:3:1:box')
    expect(calloutAnchorKey(3, 1)).toBe('slide-callout:3:1:anchor')
  })

  it('recognizes its own keys only', () => {
    expect(isSlideCalloutKey(calloutBoxKey(1, 0))).toBe(true)
    expect(isSlideCalloutKey('geometry:1:content')).toBe(false)
    expect(isSlideCalloutKey('callout:0')).toBe(false)
  })
})
