import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { flattenShapes, paragraphText, shapeText } from '../model'
import { parseOdp } from '../parse'
import { a, br, buildOdp, customShape, frame, header, image, item, line, list, p, page, span, tab, textBox } from './odpFixture'

describe('parseOdp: deck structure', () => {
  it('reads page size, master placeholder regions, slide names and hidden slides', () => {
    const deck = parseOdp(buildOdp({
      pageWidthCm: 28,
      pageHeightCm: 21,
      pages: [page('', { name: 'page1', hidden: true }), page('', { name: 'page2' })],
    }))
    expect(deck.pageWidth).toBe(28)
    expect(deck.pageHeight).toBe(21)
    expect(deck.masters.get('codeurjc')?.bodyRegion).toEqual({ x: 1.27, y: 4.457, w: 22.859, h: 11.048 })
    expect(deck.slides.map(s => [s.index, s.name, s.hidden, s.masterName])).toEqual([
      [1, 'page1', true, 'codeurjc'],
      [2, 'page2', false, 'codeurjc'],
    ])
  })

  it('collects Pictures/ entries', () => {
    const deck = parseOdp(buildOdp({ pages: [page('')], files: { 'Pictures/a.png': new Uint8Array([1, 2, 3]), 'Thumbnails/t.png': 'x' } }))
    expect([...deck.pictures.keys()]).toEqual(['Pictures/a.png'])
  })

  it('reports unreadable archives and archives without content.xml', () => {
    expect(() => parseOdp(new Uint8Array([1, 2, 3]))).toThrow(/Not a readable ODP file/)
    expect(() => parseOdp(zipSync({ 'styles.xml': strToU8('<x/>') }))).toThrow(/content.xml is missing/)
  })
})

describe('parseOdp: text', () => {
  it('keeps a title line break inside one paragraph', () => {
    const deck = parseOdp(buildOdp({ pages: [page(frame('title', { x: 1, y: 1, w: 20, h: 3 }, textBox(p(`Tipos de pruebas${br}Qué características prueban`))))] }))
    const [title] = deck.slides[0].shapes
    expect(title.kind).toBe('text')
    expect(title.presentationClass).toBe('title')
    expect(shapeText(title)).toBe('Tipos de pruebas\nQué características prueban')
  })

  it('tracks list depth and list-header paragraphs', () => {
    const body = textBox(list(
      header(p('Pruebas Funcionales'), list(item(p('nested under header')))),
      item(p('first'), list(item(p('second')))),
      item(p('')),
    ))
    const deck = parseOdp(buildOdp({ pages: [page(frame('outline', { x: 1, y: 4, w: 20, h: 12 }, body))] }))
    const paragraphs = deck.slides[0].shapes[0].paragraphs
    expect(paragraphs.map(pp => [paragraphText(pp), pp.depth, pp.isListHeader])).toEqual([
      ['Pruebas Funcionales', 1, true],
      ['nested under header', 2, false],
      ['first', 1, false],
      ['second', 2, false],
      ['', 1, false],
    ])
  })

  it('resolves bold/italic/monospace through spans and paragraph styles, and spaces/tabs', () => {
    const deck = parseOdp(buildOdp({
      pages: [page(frame(null, { x: 1, y: 1, w: 10, h: 2 }, textBox(
        p(`${span('Verificar', 'Tb')} que <text:s text:c="2"/>${span('assert', 'Tm')}${tab}${span('ok', 'Ti')}`),
        p('code line', 'Pmono'),
        p(a('https://junit.org', 'https://junit.org/')),
      )))],
    }))
    const [p1, p2, p3] = deck.slides[0].shapes[0].paragraphs
    expect(p1.runs).toEqual([
      { text: 'Verificar', bold: true, italic: false, mono: false },
      { text: ' que   ', bold: false, italic: false, mono: false },
      { text: 'assert', bold: false, italic: false, mono: true, fontSizePt: 14 },
      { text: '\t', bold: false, italic: false, mono: false },
      { text: 'ok', bold: false, italic: true, mono: false },
    ])
    expect(p2.runs).toEqual([{ text: 'code line', bold: false, italic: false, mono: true, fontSizePt: 14 }])
    expect(p3.runs).toEqual([{ text: 'https://junit.org', bold: false, italic: false, mono: false, href: 'https://junit.org/' }])
  })
})

describe('parseOdp: other shapes', () => {
  it('reads image frames with all their images, in order', () => {
    const deck = parseOdp(buildOdp({ pages: [page(image({ x: 2, y: 8, w: 20, h: 6 }, 'Pictures/a.svg', 'Pictures/a.png'))] }))
    const [shape] = deck.slides[0].shapes
    expect(shape.kind).toBe('image')
    expect(shape.images).toEqual(['Pictures/a.svg', 'Pictures/a.png'])
    expect(shape.rect).toEqual({ x: 2, y: 8, w: 20, h: 6 })
  })

  it('reads tables as rows of cells of paragraphs', () => {
    const table = `<table:table><table:table-row><table:table-cell>${p('Proyecto')}</table:table-cell><table:table-cell>${p('Descripción')}</table:table-cell></table:table-row><table:table-row><table:table-cell>${p('Selenium IDE')}</table:table-cell><table:table-cell>${p('Plugin')}</table:table-cell></table:table-row></table:table>`
    const deck = parseOdp(buildOdp({ pages: [page(frame(null, { x: 2, y: 7, w: 24, h: 11 }, table))] }))
    const [shape] = deck.slides[0].shapes
    expect(shape.kind).toBe('table')
    expect(shape.table!.map(row => row.map(cell => cell.map(paragraphText).join(' ')))).toEqual([['Proyecto', 'Descripción'], ['Selenium IDE', 'Plugin']])
  })

  it('reads custom shapes, lines and groups', () => {
    const deck = parseOdp(buildOdp({
      pages: [page(`${customShape('right-arrow', { x: 1, y: 1, w: 2, h: 1 })}${customShape('ooxml-rect', { x: 3, y: 3, w: 4, h: 1 }, p('JOB'), 'grBox')}${line(1, 2, 3, 4)}<draw:g>${customShape('ellipse', { x: 5, y: 5, w: 1, h: 1 })}</draw:g>`)],
    }))
    const [arrow, rect, ln, group] = deck.slides[0].shapes
    expect([arrow.kind, arrow.geometryType, arrow.hasBorder]).toEqual(['shape', 'right-arrow', false])
    expect([rect.geometryType, shapeText(rect), rect.hasBorder, rect.paddingTop]).toEqual(['ooxml-rect', 'JOB', true, 0.125])
    expect([ln.kind, ln.endpoints]).toEqual(['line', { x1: 1, y1: 2, x2: 3, y2: 4 }])
    expect(group.kind).toBe('group')
    expect(flattenShapes(deck.slides[0].shapes)).toHaveLength(4)
  })
})
