import { describe, expect, it } from 'vitest'
import { classifySlide, extractHeading, isMonospaceShape } from '../classify'
import { paragraphText, shapeText } from '../model'
import { parseOdp } from '../parse'
import { a, br, buildOdp, customShape, frame, header, image, item, line, list, p, page, span, textBox } from './odpFixture'

function classifyPages(...pages: string[]) {
  const deck = parseOdp(buildOdp({ pages }))
  return deck.slides.map(s => classifySlide(s, deck))
}

const TITLE = { x: 1.29, y: 1.7, w: 19.9, h: 2.8 }
const BODY = { x: 1.27, y: 4.52, w: 22.86, h: 12.6 }

describe('classifySlide: cover and copyright', () => {
  it('recognizes a cover and extracts its fields', () => {
    const [slide] = classifyPages(page([
      customShape('ooxml-rect', { x: 21.9, y: 0.38, w: 6.9, h: 1.27 }, p('12-2025')),
      frame(null, { x: 0, y: 6.8, w: 25.3, h: 1.7 }, textBox(p('Ampliación de Ingeniería del Software'))),
      frame('outline', { x: 0, y: 9.1, w: 25.4, h: 2.2 }, textBox(p('Bloque 1: Introducción a pruebas software'))),
      frame('outline', { x: 2, y: 12.1, w: 21, h: 3 }, textBox(p('Tema 1.1: Introducción a pruebas software'))),
      customShape('ooxml-rect', { x: 5.4, y: 17, w: 19, h: 0.9 }, p('Micael Gallego, Francisco Gortázar')),
    ].join('')))
    expect(slide.role).toBe('cover')
    expect(slide.cover).toEqual({
      subject: 'Ampliación de Ingeniería del Software',
      lesson: 'Bloque 1: Introducción a pruebas software',
      title: 'Tema 1.1: Introducción a pruebas software',
      date: '12-2025',
      authors: 'Micael Gallego, Francisco Gortázar',
    })
  })

  it('recognizes a copyright slide', () => {
    const [slide] = classifyPages(page(frame(null, { x: 1, y: 8.7, w: 24, h: 8.5 }, textBox(p('©2025'), p('Algunos derechos reservados')))))
    expect(slide.role).toBe('copyright')
  })
})

describe('classifySlide: titles', () => {
  it('uses the title placeholder and splits a line break into two lines', () => {
    const [slide] = classifyPages(page(frame('title', TITLE, textBox(p(`Tipos de pruebas${br}Qué características prueban`)))))
    expect(slide.titleLines).toEqual(['Tipos de pruebas', 'Qué características prueban'])
  })

  it('falls back to a short text shape in the top band (PPTX-style decks)', () => {
    const [slide] = classifyPages(page([
      customShape('ooxml-rect', { x: 1.4, y: 4.9, w: 25, h: 14 }, list(item(p('Cada test es un método')))),
      customShape('ooxml-rect', { x: 0.8, y: -0.1, w: 23.6, h: 3.2 }, p(span('Introducción', 'Tb'))),
    ].join('')))
    expect(slide.titleLines).toEqual(['Introducción'])
    expect(slide.bodyParagraphs.map(paragraphText)).toEqual(['Cada test es un método'])
  })
})

describe('extractHeading', () => {
  const para = (text: string, depth: number, opts: { bold?: boolean, header?: boolean } = {}) => ({
    runs: [{ text, bold: opts.bold ?? false, italic: false, mono: false }],
    depth,
    isListHeader: opts.header ?? false,
  })

  it('uses a leading list-header and renormalizes depths', () => {
    const { heading, rest } = extractHeading([para('Pruebas Funcionales', 1, { header: true }), para('a', 2), para('b', 3)])
    expect(heading).toBe('Pruebas Funcionales')
    expect(rest.map(r => [paragraphText(r), r.depth])).toEqual([['a', 1], ['b', 2]])
  })

  it('uses a lone bold first item with sub-items and promotes them', () => {
    const { heading, rest } = extractHeading([para('Ejercicio 1', 1, { bold: true }), para('Implementa', 2), para('Comprueba', 2)])
    expect(heading).toBe('Ejercicio 1')
    expect(rest.map(r => [paragraphText(r), r.depth])).toEqual([['Implementa', 1], ['Comprueba', 1]])
  })

  it('does not take a bold first item without sub-items (e.g. an agenda highlighting its current section)', () => {
    const { heading, rest } = extractHeading([para('Introducción', 1, { bold: true }), para('Casos de Test', 1), para('Dobles', 1)])
    expect(heading).toBeUndefined()
    expect(rest).toHaveLength(3)
  })

  it('uses a lone bold item that is the only body item (e.g. the code shape follows)', () => {
    const { heading, rest } = extractHeading([para('Ejercicio 8: GestorNotas', 1, { bold: true })])
    expect(heading).toBe('Ejercicio 8: GestorNotas')
    expect(rest).toEqual([])
  })

  it('uses a leading bold paragraph followed by a list', () => {
    const { heading } = extractHeading([para('¿Qué es Docker?', 0, { bold: true }), para('Es una nueva forma', 1)])
    expect(heading).toBe('¿Qué es Docker?')
  })

  it('drops empty paragraphs', () => {
    const { rest } = extractHeading([para('a', 1), para('  ', 1), para('b', 1)])
    expect(rest.map(paragraphText)).toEqual(['a', 'b'])
  })
})

describe('classifySlide: content shapes', () => {
  it('separates code, filename labels, project labels, links, images and texts', () => {
    const [slide] = classifyPages(page([
      frame('title', TITLE, textBox(p('Maven'))),
      frame('outline', BODY, textBox(list(item(p('ejem0'))))),
      customShape('ooxml-rect', { x: 10.7, y: 5.7, w: 16.7, h: 14 }, p(`package es.codeurjc;${br}import java.util.List;`, 'Pmono')),
      customShape('ooxml-rect', { x: 10.8, y: 4.5, w: 4.6, h: 1.1 }, p('ListTest.java', 'Pmono')),
      customShape('ooxml-rect', { x: 25.2, y: 4.0, w: 3, h: 1.4 }, p(span('ejem0', 'Tb'))),
      frame(null, { x: 9, y: 17.4, w: 11, h: 1.4 }, textBox(p(a('http://junit.org', 'http://junit.org/')))),
      image({ x: 1, y: 7.5, w: 7.9, h: 7 }, 'Pictures/a.png'),
      customShape('ooxml-rect', { x: 15, y: 13, w: 9, h: 2 }, p('Una nota suelta')),
    ].join('')))
    expect(slide.codes).toHaveLength(1)
    expect(slide.codes[0]).toMatchObject({ label: 'ListTest.java', projectLabel: 'ejem0', terminal: false })
    expect(slide.links.map(shapeText)).toEqual(['http://junit.org'])
    expect(slide.images).toHaveLength(1)
    expect(slide.texts.map(shapeText)).toEqual(['Una nota suelta'])
  })

  it('recognizes a bordered shell-prompt box as terminal code', () => {
    const [slide] = classifyPages(page(customShape('ooxml-rect', { x: 1.5, y: 8, w: 22, h: 4 }, `${p('$ docker run hello-world', 'Ta')}${p('Hello from Docker.', 'Ta')}`, 'grBox')))
    expect(slide.codes).toHaveLength(1)
    expect(slide.codes[0].terminal).toBe(true)
    expect(isMonospaceShape(slide.codes[0].shape)).toBe(false)
  })

  it('treats a bordered rectangle over code as an annotation, the code frame itself as nothing, and one elsewhere as a decoration', () => {
    const code = customShape('ooxml-rect', { x: 1, y: 4, w: 20, h: 10 }, p(`a:${br}b:${br}c:`, 'Pmono'))
    const [slide] = classifyPages(page([
      code,
      customShape('ooxml-rect', { x: 1.5, y: 5, w: 10, h: 1 }, '', 'grBox'),
      customShape('ooxml-rect', { x: 1, y: 4, w: 20.1, h: 10.1 }, '', 'grBox'),
      customShape('rectangle', { x: 2, y: 16, w: 10, h: 1 }, '', 'grBox'),
      customShape('right-arrow', { x: 22, y: 5, w: 1, h: 1 }),
      line(12, 5.5, 15, 5.5),
    ].join('')))
    expect(slide.annotationRects).toHaveLength(1)
    expect(slide.decorations.map(d => d.description)).toEqual(['highlight box omitted'])
    expect(slide.connectors).toHaveLength(2)
  })

  it('reports groups and embedded objects as decorations', () => {
    const [slide] = classifyPages(page(`<draw:g>${customShape('ellipse', { x: 1, y: 1, w: 1, h: 1 })}</draw:g>${frame(null, { x: 2, y: 2, w: 3, h: 3 }, '<draw:object xlink:href="./Object 1"/>')}`))
    expect(slide.decorations.map(d => d.description)).toEqual(['grouped shapes omitted', 'embedded object (OLE/chart) omitted'])
  })

  it('takes the body heading from a list-header inside the outline', () => {
    const [slide] = classifyPages(page([
      frame('title', TITLE, textBox(p('Integración Continua'))),
      frame('outline', BODY, textBox(list(header(p(span('¿Qué es GitHub Actions?', 'Tb'))), item(p('Es un sistema'))))),
    ].join('')))
    expect(slide.heading).toBe('¿Qué es GitHub Actions?')
    expect(slide.bodyParagraphs.map(r => [paragraphText(r), r.depth])).toEqual([['Es un sistema', 1]])
  })
})
