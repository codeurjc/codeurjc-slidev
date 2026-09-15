import type { Paragraph, TextRun } from '../model'
import { advanceCarryState } from 'codeurjc-slidev-theme/composables/useSlideTitleCarryover'
import { describe, expect, it } from 'vitest'
import { bodyRegionFor, contentGeometryFor, mapRect } from '../geometry'
import { emitHeadings } from '../headings'
import { escapeMarkdown, paragraphsToMarkdown, runsToMarkdown, tableToMarkdown } from '../markdown'

const run = (text: string, opts: Partial<TextRun> = {}): TextRun => ({ text, bold: false, italic: false, mono: false, ...opts })
const para = (runs: TextRun[] | string, depth = 0): Paragraph => ({ runs: typeof runs === 'string' ? [run(runs)] : runs, depth, isListHeader: false })

describe('runsToMarkdown', () => {
  it('moves whitespace outside bold markers', () => {
    expect(runsToMarkdown([run('Verificar', { bold: true }), run(' que el software funciona')])).toBe('**Verificar** que el software funciona')
    expect(runsToMarkdown([run('Disponer de '), run('pruebas automáticas ', { bold: true }), run('del desarrollo')])).toBe('Disponer de **pruebas automáticas** del desarrollo')
  })

  it('renders italic, inline code and links', () => {
    expect(runsToMarkdown([run('un '), run('push', { italic: true })])).toBe('un *push*')
    expect(runsToMarkdown([run('la clase '), run('Complex(0,0)', { mono: true })])).toBe('la clase `Complex(0,0)`')
    expect(runsToMarkdown([run('https://junit.org', { href: 'https://junit.org/' })])).toBe('<https://junit.org/>')
    expect(runsToMarkdown([run('JUnit', { href: 'https://junit.org/' })])).toBe('[JUnit](https://junit.org/)')
  })

  it('escapes markdown-significant characters in plain text, but not inside code', () => {
    expect(escapeMarkdown('a*b_c [x] <y>')).toBe('a\\*b\\_c \\[x\\] \\<y\\>')
    expect(runsToMarkdown([run('*ptr', { mono: true })])).toBe('`*ptr`')
  })

  it('turns line breaks into <br> and collapses tabs/spaces', () => {
    expect(runsToMarkdown([run('Controller\nREST')])).toBe('Controller<br>REST')
    expect(runsToMarkdown([run('a\t  b')])).toBe('a b')
  })
})

describe('paragraphsToMarkdown and tableToMarkdown', () => {
  it('renders nested lists and paragraphs as separate blocks', () => {
    const md = paragraphsToMarkdown([
      para('Una de las actividades:', 1),
      para('Validar', 2),
      para('¿Estamos construyendo el sistema correcto?', 3),
      para('Un párrafo suelto', 0),
      para('Otra lista', 1),
    ])
    expect(md).toBe([
      '- Una de las actividades:',
      '  - Validar',
      '    - ¿Estamos construyendo el sistema correcto?',
      '',
      'Un párrafo suelto',
      '',
      '- Otra lista',
    ].join('\n'))
  })

  it('renders a table with the first row as header', () => {
    const cell = (text: string) => [para(text)]
    expect(tableToMarkdown([[cell('Proyecto'), cell('Descripción')], [cell('Selenium IDE'), cell('Plugin | Firefox')]])).toBe([
      '| Proyecto | Descripción |',
      '| --- | --- |',
      '| Selenium IDE | Plugin \\| Firefox |',
    ].join('\n'))
  })
})

describe('emitHeadings', () => {
  const content = (lines: string[]) => lines.join('\n')

  function simulate(slides: Parameters<typeof emitHeadings>[0]) {
    const emitted = emitHeadings(slides)
    let state = {}
    return emitted.map((e, i) => {
      state = advanceCarryState(state, { content: content(e.lines), frontmatter: e.resetTitle ? { ...slides[i].frontmatter, resetTitle: true } : slides[i].frontmatter })
      return { emitted: e, resolved: { ...state } }
    })
  }

  it('omits a repeated title', () => {
    const results = simulate([
      { frontmatter: {}, desired: { title: 'Justificación y objetivos' } },
      { frontmatter: {}, desired: { title: 'Justificación y objetivos' } },
    ])
    expect(results.map(r => r.emitted.lines)).toEqual([['# Justificación y objetivos'], []])
    expect(results[1].resolved).toEqual({ title: 'Justificación y objetivos', subtitle: undefined })
  })

  it('clears a carried subtitle when the title changes without one', () => {
    const results = simulate([
      { frontmatter: {}, desired: { title: 'Tipos de pruebas', subtitle: 'Con qué conocimientos se diseñan' } },
      { frontmatter: {}, desired: { title: 'Calidad de las pruebas' } },
    ])
    expect(results[1].emitted.lines).toEqual(['# Calidad de las pruebas', '##'])
    expect(results[1].resolved).toEqual({ title: 'Calidad de las pruebas', subtitle: undefined })
  })

  it('uses resetTitle when both levels must stop', () => {
    const results = simulate([
      { frontmatter: {}, desired: { title: 'A', subtitle: 'B' } },
      { frontmatter: {}, desired: {} },
    ])
    expect(results[1].emitted).toEqual({ lines: [], resetTitle: true })
    expect(results[1].resolved).toEqual({ title: undefined, subtitle: undefined })
  })

  it('accounts for hidden slides and skips other layouts', () => {
    const results = simulate([
      { frontmatter: { layout: 'cover' }, desired: {} },
      { frontmatter: { hide: true }, desired: { title: 'Dobles' } },
      { frontmatter: {}, desired: { title: 'Dobles', subtitle: 'Ejercicio 8' } },
    ])
    expect(results.map(r => r.emitted.lines)).toEqual([[], ['# Dobles'], ['## Ejercicio 8']])
  })

  it('always resolves to the desired headings over a mixed sequence', () => {
    const desired = [
      { title: 'A' },
      { title: 'A', subtitle: 'x' },
      { title: 'A', subtitle: 'y' },
      { title: 'B' },
      {},
      { subtitle: 'z' },
      { title: 'C', subtitle: 'z' },
    ]
    const results = simulate(desired.map(d => ({ frontmatter: {}, desired: d })))
    expect(results.map(r => r.resolved)).toEqual(desired.map(d => ({ title: d.title, subtitle: (d as { subtitle?: string }).subtitle })))
  })
})

describe('geometry', () => {
  const region = { x: 1.27, y: 4.457, w: 22.859, h: 11.048 }

  it('maps the body region onto the theme content box', () => {
    expect(mapRect(region, region)).toEqual({ x: 31, y: 98, w: 901, h: 424 })
  })

  it('clamps to the canvas', () => {
    const r = mapRect({ x: 20, y: 17, w: 10, h: 5 }, region)
    expect(r.x + r.w).toBeLessThanOrEqual(980)
    expect(r.y + r.h).toBeLessThanOrEqual(552)
  })

  it('emits content geometry only when the body frame is narrowed or shifted', () => {
    expect(contentGeometryFor({ x: 1.27, y: 4.52, w: 22.86, h: 12.6 }, region)).toBeUndefined()
    const narrowed = contentGeometryFor({ x: 1.27, y: 4.52, w: 14.53, h: 12.6 }, region)!
    expect(narrowed.x).toBe(31)
    expect(narrowed.w).toBeLessThan(901)
    expect([narrowed.y, narrowed.h]).toEqual([98, 424])
  })

  it('falls back to the default body region scaled to the page width', () => {
    const deck = { pageWidth: 28, pageHeight: 21, masters: new Map(), slides: [], pictures: new Map() }
    const r = bodyRegionFor(deck, { index: 1, name: 'p', hidden: false, masterName: 'none', shapes: [] })
    expect(r.x).toBeCloseTo(1.27 * 28 / 25.4)
  })
})
