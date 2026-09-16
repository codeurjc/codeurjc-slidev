import { describe, expect, it } from 'vitest'
import { annotateCodes } from '../annotations'
import { classifySlide } from '../classify'
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
  // The slide's single image is emitted first, so its anchor index is 0.
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
    expect(callout.anchor).toEqual({ kind: 'image', index: 0, x: 0.5, y: 0.5 })
    expect(callout.text).toBe('Le damos un nombre')
    expect(callout.box).not.toBeNull()
    expect(result.consumedConnectors.size).toBe(1)
    expect(result.consumedTexts.size).toBe(1)
  })

  it('turns an arrow into a screenshot with no text into a bare arrow', () => {
    const result = slideWith(line(20, 20, 9, 9))
    expect(result.callouts).toEqual([
      { anchor: { kind: 'image', index: 0, x: 0.5, y: 0.5 }, text: '', box: null, step: null },
    ])
    expect(result.consumedConnectors.size).toBe(1)
  })

  it('turns a text box drawn on the image into a label whose box covers its anchor', () => {
    const result = slideWith(customShape('ooxml-rect', { x: 7, y: 8, w: 4, h: 1 }, p('MODELO DE DOMINIO')))
    expect(result.callouts).toHaveLength(1)
    const [callout] = result.callouts
    // Centre of the text box (9, 8.5) inside the image at (4, 5) 10x8.
    expect(callout.anchor).toEqual({ kind: 'image', index: 0, x: 0.5, y: 0.4375 })
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
