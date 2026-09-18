import type { OfficeRunner } from '../office'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LINE_HEIGHT_FACTOR, PT_TO_CM } from '../constants'
import { convertOdp } from '../convert'
import { a, br, buildOdp, customShape, frame, header, image, item, line, list, p, page, span, textBox, xmlEscape } from './odpFixture'

const TITLE = { x: 1.29, y: 1.7, w: 19.9, h: 2.8 }
const BODY = { x: 1.27, y: 4.457, w: 22.859, h: 11.048 }
const LH = 14 * LINE_HEIGHT_FACTOR * PT_TO_CM

const LIST_TEST = [
  'package es.codeurjc.test.ejem;',
  '',
  'public class ListTest {',
  '',
  '    @Test',
  '    public void emptyList() {',
  '        assertTrue(list.isEmpty());',
  '    }',
  '}',
].join('\n')

const YAML = ['name: CI', 'on: push', 'jobs:']

function monoLines(lines: string[]): string {
  return lines.map(l => p(xmlEscape(l), 'Pmono')).join('')
}

function cover(subject: string, hidden: boolean, name: string) {
  return page([
    customShape('ooxml-rect', { x: 21.9, y: 0.38, w: 6.9, h: 1.27 }, p('12-2025')),
    frame(null, { x: 0, y: 6.8, w: 25.3, h: 1.7 }, textBox(p(subject))),
    frame('outline', { x: 0, y: 9.1, w: 25.4, h: 2.2 }, textBox(p('Bloque 1: Introducción a pruebas software'))),
    frame('outline', { x: 2, y: 12.1, w: 21, h: 3 }, textBox(p('Tema 1.1: Introducción'))),
    customShape('ooxml-rect', { x: 5.4, y: 17, w: 19, h: 0.9 }, p('Micael Gallego, Iván Chicano')),
  ].join(''), { hidden, name })
}

function yamlCode(extra = '') {
  return customShape('ooxml-rect', { x: 1, y: 4, w: 20, h: 6 }, monoLines(YAML)) + extra
}

const WORKFLOW_BOX = customShape('ooxml-rect', { x: 1.2, y: 4.125 - 0.05, w: 18, h: 3 * LH + 0.1 }, '', 'grBox')
  + customShape('ooxml-rect', { x: 15, y: 4.2, w: 4, h: 0.6 }, p('WORKFLOW'))

const PAGES = [
  cover('Calidad Software', true, 'page1'),
  cover('Ampliación de Ingeniería del Software', false, 'page2'),
  page(frame(null, { x: 1, y: 8.7, w: 24, h: 8.5 }, textBox(p('©2025'), p('Algunos derechos reservados'))), { name: 'page3' }),
  page([
    frame('title', TITLE, textBox(p('Justificación y objetivos'))),
    frame('outline', BODY, textBox(list(header(p(span('Objetivos (1/3)', 'Tb'))), item(p(`${span('Verificar', 'Tb')} que funciona`), list(item(p('en detalle'))))))),
  ].join(''), { name: 'page4' }),
  page([
    frame('title', TITLE, textBox(p('Justificación y objetivos'))),
    frame('outline', { x: 1.27, y: 4.52, w: 14.53, h: 12.6 }, textBox(list(item(p('Probar su funcionamiento'))))),
    image({ x: 16.4, y: 3.2, w: 8.2, h: 14.6 }, 'Pictures/chair.svg', 'Pictures/chair.png'),
  ].join(''), { name: 'page5' }),
  page([
    frame('title', TITLE, textBox(p(`Tipos de pruebas${br}Qué características prueban`))),
    frame('outline', BODY, textBox(list(header(p('Pruebas Funcionales')), item(p('Verifican la funcionalidad'))))),
  ].join(''), { name: 'page6' }),
  page([
    frame('title', TITLE, textBox(p('Calidad de las pruebas'))),
    frame('outline', BODY, textBox(list(item(p('Es el % de código ejecutado'))))),
    frame(null, { x: 6, y: 17.8, w: 12, h: 1 }, textBox(p(a('http://www.bullseye.com/minimum.html', 'http://www.bullseye.com/minimum.html')))),
    frame(null, { x: 1, y: 15, w: 20, h: 1 }, textBox(p('Google recomienda 70% unitarios'))),
    customShape('rectangle', { x: 18, y: 6, w: 6, h: 2 }, p('Given (Situación inicial)'), 'grBox'),
    line(1, 1, 5, 5),
  ].join(''), { name: 'page7' }),
  page([
    frame('title', TITLE, textBox(p('Casos de Test'))),
    customShape('ooxml-rect', { x: 2, y: 5, w: 20, h: 10 }, monoLines(LIST_TEST.split('\n'))),
    customShape('ooxml-rect', { x: 2, y: 4, w: 4, h: 0.8 }, p('ejem1', 'Pmono')),
  ].join(''), { name: 'page8' }),
  page([
    frame('title', TITLE, textBox(p('Casos de Test'))),
    customShape('ooxml-rect', { x: 2, y: 5, w: 20, h: 10 }, monoLines(['public class ListTest {', '@Test', 'public void emptyList() { … }', '}'])),
  ].join(''), { name: 'page9' }),
  page(frame('title', TITLE, textBox(p('Integración Continua'))) + yamlCode(), { name: 'page10' }),
  page(frame('title', TITLE, textBox(p('Integración Continua'))) + yamlCode(WORKFLOW_BOX), { name: 'page11' }),
  page(frame('title', TITLE, textBox(p('Integración Continua'))) + frame('outline', BODY, textBox(list(item(p('Oculta'))))), { name: 'page12', hidden: true }),
]

let dir: string
let odpPath: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'odp-convert-'))
  odpPath = join(dir, 'Deck.odp')
  writeFileSync(odpPath, buildOdp({
    pages: PAGES,
    files: { 'Pictures/chair.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>', 'Pictures/chair.png': new Uint8Array([137, 80]) },
  }))
  mkdirSync(join(dir, 'Deck/ejem1/src'), { recursive: true })
  writeFileSync(join(dir, 'Deck/ejem1/src/ListTest.java'), LIST_TEST)
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A fake LibreOffice: reports 25.8 and "exports" an SVG with one slide group per visible page. */
const fakeOffice: OfficeRunner = async (args) => {
  if (args[0] === '--version')
    return { code: 0, stdout: 'LibreOffice 25.8.7.3 580(Build:3)' }
  const outDir = args[args.indexOf('--outdir') + 1]
  mkdirSync(outDir, { recursive: true })
  const groups = ['page2', 'page7', 'page9'].map((name, i) => `<g visibility="hidden"><g id="container-id${i + 1}"><g id="id${i + 1}" class="Slide"><g ooo:name="${name}" class="Page"><text>${name}</text></g></g></g></g>`).join('')
  writeFileSync(join(outDir, 'Deck.svg'), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:ooo="http://xml.openoffice.org/svg/export" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 25400 19050"><defs><g id="ooo:meta_slides"><g ooo:slide="id2" ooo:master="id9"/></g></defs><defs><g id="id9" class="Master_Slide"/></defs><g class="SlideGroup">${groups}</g><script/></svg>`)
  return { code: 0, stdout: '' }
}

describe('convertOdp', () => {
  it('converts the synthetic deck end to end', async () => {
    const result = await convertOdp({ odpPath, codeRepo: 'https://github.com/o/r/tree/main', office: fakeOffice })
    const slides = result.slideSources
    expect(result.slidesMarkdown).toBe(slides.join('\n'))

    expect(result.stats).toMatchObject({ odpSlides: 12, slides: 11, mergedBuildUps: 1, imports: 1 })
    expect(result.deckTitle).toBe('Tema 1.1: Introducción')

    // Headmatter on the (hidden) first cover; the visible cover next; copyright.
    expect(slides[0]).toMatch(/^---\ntheme: codeurjc-slidev-theme\ncolorSchema: light\naspectRatio: 16\/9\ntitle: "Tema 1.1: Introducción"\nlayout: cover\nsubject: Calidad Software/)
    expect(slides[0]).toContain('hide: true')
    expect(slides[1]).toContain('subject: Ampliación de Ingeniería del Software')
    expect(slides[1]).toContain('lesson: "Bloque 1: Introducción a pruebas software"')
    expect(slides[1]).toContain('# Tema 1.1: Introducción')
    expect(slides[2]).toContain('layout: copyright')

    // Carry-over-minimized headings, lists and inline formatting.
    expect(slides[3]).toContain('# Justificación y objetivos\n## Objetivos (1/3)\n\n- **Verificar** que funciona\n  - en detalle')
    expect(slides[4]).not.toContain('# Justificación')
    expect(slides[4]).toContain('\n##\n')
    expect(slides[4]).toMatch(/geometry:\n {2}content: \{ x: 31, y: 98, w: \d+, h: 424 \}\n {2}images:\n {4}- \{ src: \/images\/chair\.svg, x: \d+, y: \d+, w: \d+, h: \d+ \}/)
    expect(slides[4]).toContain('![](/images/chair.svg)')
    expect([...result.images.keys()]).toEqual(['images/chair.svg'])
    expect(slides[5]).toContain('# Tipos de pruebas\n## Qué características prueban\n\n### Pruebas Funcionales\n\n- Verifican la funcionalidad')
    expect(slides[6]).toContain('# Calidad de las pruebas\n##')
    expect(slides[6]).toContain('Google recomienda 70% unitarios')
    expect(slides[6]).toContain('<http://www.bullseye.com/minimum.html>')

    // Code: exact import with a source directive; near match stays inline with a link.
    expect(slides[7]).toContain('<<< @/code/ejem1/src/ListTest.java java\n[!source https://github.com/o/r/blob/main/ejem1/src/ListTest.java]')
    expect(slides[8]).toMatch(/```java\n\/\/ \[!source https:\/\/github\.com\/o\/r\/blob\/main\/ejem1\/src\/ListTest\.java#L3-L\d+\]\npublic class ListTest \{/)

    // Build-up merged: the highlight added on the second slide is revealed on click 1.
    expect(slides[9]).toContain('name: CI # [!mark:start{1}] WORKFLOW')
    expect(slides[10]).toContain('hide: true')

    // Reports and losses, with Slidev numbering skipping hidden slides.
    const byOdp = (n: number) => result.reports.find(r => r.odpNumbers.includes(n))!
    expect(byOdp(2).slidevNumber).toBe(1)
    expect(byOdp(7)).toMatchObject({ slidevNumber: 6, fileIndex: 7 })
    expect(byOdp(7).losses).toEqual(expect.arrayContaining(['positioned text box flattened into a paragraph', 'shape with text omitted ("Given (Situación inicial)")', 'arrow or line omitted']))
    expect(byOdp(9).losses).toContain('code differs from ListTest.java')
    expect(byOdp(10)).toMatchObject({ odpNumbers: [10, 11], fileIndex: 10 })

    // Comparison deck with originals for the lossy visible slides.
    expect(result.comparison).toBe('written')
    expect([...result.originals.keys()].sort()).toEqual(['odp-originals/page7.svg', 'odp-originals/page9.svg'])
    expect(result.comparisonMarkdown).toContain('# Slide 6\n\nODP slide 7')
    expect(result.comparisonMarkdown).toContain('src: ./slides.md#7')
  })

  it('writes everything under a namespaced deck\'s own bases', async () => {
    const result = await convertOdp({
      odpPath,
      codeRepo: 'https://github.com/o/r/tree/main',
      office: fakeOffice,
      deckFile: 'tema1.md',
      codeBase: 'code/tema1',
      imagesBase: 'images/tema1',
      originalsBase: 'odp-originals/tema1',
    })
    expect([...result.images.keys()]).toEqual(['images/tema1/chair.svg'])
    expect(result.slideSources[4]).toContain('![](/images/tema1/chair.svg)')
    expect(result.slideSources[4]).toContain('src: /images/tema1/chair.svg')
    expect(result.slideSources[7]).toContain('<<< @/code/tema1/ejem1/src/ListTest.java java')
    expect(result.comparison).toBe('written')
    expect(result.comparisonMarkdown).toContain('src: ./tema1.md#')
    expect(result.comparisonMarkdown).not.toContain('src: ./slides.md')
    expect(result.comparisonMarkdown).toContain('image: /odp-originals/tema1/')
    expect([...result.originals.keys()].every(k => k.startsWith('odp-originals/tema1/'))).toBe(true)
  })

  it('skips the comparison deck when LibreOffice is missing, and notes code/source-link fallbacks', async () => {
    const missing: OfficeRunner = async () => ({ code: -1, stdout: '' })
    const result = await convertOdp({ odpPath, office: missing, git: () => null })
    expect(result.comparison).toBe('skipped')
    expect(result.comparisonMarkdown).toBeUndefined()
    expect(result.notices).toEqual(expect.arrayContaining([
      'Comparison deck skipped: LibreOffice ≥ 7.4 (soffice) was not found',
      expect.stringMatching(/^No GitHub origin found for the code folder/),
    ]))
    expect(result.slidesMarkdown).not.toContain('[!source')
  })

  it('keeps code inline without a code folder', async () => {
    const result = await convertOdp({ odpPath, codeDir: join(dir, 'nope'), office: false })
    expect(result.stats.imports).toBe(0)
    expect(result.notices).toContain(`--code folder not found: ${join(dir, 'nope')}; code stays inline`)
  })
})
