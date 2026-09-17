import type { DraftContext } from '../draft'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { annotateCodes } from '../annotations'
import { classifySlide } from '../classify'
import { convertOdp } from '../convert'
import { draftSlide } from '../draft'
import { slideCalloutsFor } from '../imageCallouts'
import { parseOdp } from '../parse'
import { buildOdp, customShape, frame, image, line, p, page, textBox } from './odpFixture'

// The four shapes the corpus contains, modeled on the Azure portal tutorial
// (arrow from a text box into a screenshot), `2.5 Análisis estático` (arrows
// into a screenshot with nothing to say) and `2.2 Código de calidad` (labels
// written on top of a diagram image).

const BODY_REGION = { x: 1.27, y: 4.457, w: 22.859, h: 11.048 }
const IMAGE_RECT = { x: 4, y: 5, w: 10, h: 8 }
const TITLE = frame('title', { x: 1.29, y: 1.7, w: 19.9, h: 2.8 }, textBox(p('Portal')))

function slideWith(extra: string) {
  const deck = parseOdp(buildOdp({
    pages: [page(TITLE + image(IMAGE_RECT, 'Pictures/shot.png') + extra)],
    files: { 'Pictures/shot.png': new Uint8Array([1]) },
  }))
  const cs = classifySlide(deck.slides[0], deck)
  const annotations = annotateCodes(cs, BODY_REGION)
  // The slide's single image is emitted first. Anchors name it by position
  // here; the draft rewrites them to src references (tested below).
  return slideCalloutsFor(cs, BODY_REGION, annotations, [{ shape: cs.images[0], index: 0 }])
}

describe('slideCalloutsFor', () => {
  it('turns an arrow from a text box into a screenshot into a connected callout', () => {
    // Arrow tip at the middle of the image, tail at the text box beside it.
    const result = slideWith(
      line(9, 9, 16, 9)
      + customShape('ooxml-rect', { x: 16, y: 8.5, w: 6, h: 1.4 }, p('Le damos un nombre')),
    )
    expect(result.callouts).toHaveLength(1)
    const [callout] = result.callouts
    expect(callout.anchor).toEqual({ kind: 'image', ref: { kind: 'position', index: 0 }, x: 0.5, y: 0.5 })
    expect(callout.text).toBe('Le damos un nombre')
    expect(callout.box).not.toBeNull()
    expect(result.consumedConnectors.size).toBe(1)
    expect(result.consumedTexts.size).toBe(1)
  })

  it('turns an arrow into a screenshot with no text into a bare arrow', () => {
    const result = slideWith(line(20, 20, 9, 9))
    expect(result.callouts).toEqual([
      { anchor: { kind: 'image', ref: { kind: 'position', index: 0 }, x: 0.5, y: 0.5 }, text: '', box: null, step: null },
    ])
    expect(result.consumedConnectors.size).toBe(1)
  })

  it('turns a text box drawn on the image into a label whose box covers its anchor', () => {
    const result = slideWith(customShape('ooxml-rect', { x: 7, y: 8, w: 4, h: 1 }, p('MODELO DE DOMINIO')))
    expect(result.callouts).toHaveLength(1)
    const [callout] = result.callouts
    // Centre of the text box (9, 8.5) inside the image at (4, 5) 10x8.
    expect(callout.anchor).toEqual({ kind: 'image', ref: { kind: 'position', index: 0 }, x: 0.5, y: 0.4375 })
    expect(callout.text).toBe('MODELO DE DOMINIO')
    expect(result.consumedTexts.size).toBe(1)
  })

  it('anchors a labelled arrow that points at slide content to a slide point', () => {
    // Tip well clear of the image, tail at a text box.
    const result = slideWith(
      line(20, 16, 24, 17)
      + customShape('ooxml-rect', { x: 24, y: 16.5, w: 4, h: 1 }, p('Necesario si no es un repositorio Git')),
    )
    expect(result.callouts).toHaveLength(1)
    const [callout] = result.callouts
    expect(callout.anchor.kind).toBe('point')
    expect(callout.text).toBe('Necesario si no es un repositorio Git')
  })

  it('leaves shapes the code annotations already claimed alone', () => {
    const deck = parseOdp(buildOdp({
      pages: [page(TITLE + image(IMAGE_RECT, 'Pictures/shot.png'))],
      files: { 'Pictures/shot.png': new Uint8Array([1]) },
    }))
    const cs = classifySlide(deck.slides[0], deck)
    const annotations = annotateCodes(cs, BODY_REGION)
    for (const text of cs.texts)
      annotations.consumedTexts.add(text)
    for (const connector of cs.connectors)
      annotations.consumedConnectors.add(connector)
    const result = slideCalloutsFor(cs, BODY_REGION, annotations, [{ shape: cs.images[0], index: 0 }])
    expect(result.callouts).toEqual([])
  })
})

describe('image references in converted slides', () => {
  const draftOf = (inner: string, files: Record<string, Uint8Array>, canEmbedDiagrams = false) => {
    const deck = parseOdp(buildOdp({ pages: [page(inner)], files }))
    const ctx: DraftContext = { deck, codeIndex: [], images: new Map(), imagePaths: new Map(), canEmbedDiagrams }
    return draftSlide(classifySlide(deck.slides[0], deck), ctx)
  }

  it('anchors a screenshot callout by the src the slide uses', () => {
    const draft = draftOf(TITLE + image(IMAGE_RECT, 'Pictures/shot.png') + line(9, 9, 16, 9) + customShape('ooxml-rect', { x: 16, y: 8.5, w: 6, h: 1.4 }, p('Le damos un nombre')), { 'Pictures/shot.png': new Uint8Array([1]) })
    expect(draft.callouts[0].anchor).toEqual({ kind: 'image', ref: { kind: 'src', src: '/images/shot.png' }, x: 0.5, y: 0.5 })
  })

  it('keeps anchoring the right picture when a diagram took an image before it', () => {
    // The first image carries a hexagon no callout can express, so it becomes
    // a diagram candidate and leaves the slide's images; the screenshot below
    // keeps its callout, referenced by its own src.
    const diagram = image({ x: 2, y: 5, w: 6, h: 4 }, 'Pictures/arch.png') + customShape('hexagon', { x: 3, y: 6, w: 2, h: 2 }, '', 'grFilled')
    const shot = image({ x: 4, y: 11, w: 10, h: 6 }, 'Pictures/shot.png') + line(20, 14, 9, 14)
    const draft = draftOf(TITLE + diagram + shot, { 'Pictures/arch.png': new Uint8Array([1]), 'Pictures/shot.png': new Uint8Array([2]) }, true)
    expect(draft.diagramCandidates).toHaveLength(1)
    expect(draft.images.map(i => i.publicPath)).toEqual(['images/shot.png'])
    expect(draft.callouts[0].anchor).toMatchObject({ kind: 'image', ref: { kind: 'src', src: '/images/shot.png' } })
  })

  it('keys geometry entries by src, with #N for a picture shown twice', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'odp-image-refs-'))
    try {
      const odpPath = join(dir, 'Deck.odp')
      writeFileSync(odpPath, buildOdp({
        pages: [page(TITLE + image({ x: 2, y: 5, w: 6, h: 4 }, 'Pictures/logo.png') + image({ x: 12, y: 5, w: 6, h: 4 }, 'Pictures/logo.png'))],
        files: { 'Pictures/logo.png': new Uint8Array([1]) },
      }))
      const { slideSources } = await convertOdp({ odpPath, office: false, git: () => null })
      // toYaml quotes values containing `#`; both spellings parse to the same reference.
      expect(slideSources[0]).toMatch(/images:\n {4}- \{ src: "\/images\/logo\.png#1", x: \d+/)
      expect(slideSources[0]).toMatch(/\n {4}- \{ src: "\/images\/logo\.png#2", x: \d+/)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
