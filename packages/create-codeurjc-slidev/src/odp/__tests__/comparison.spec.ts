import type { OfficeRunner } from '../office'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comparisonMarkdown } from '../comparison'
import { convertOdp } from '../convert'
import { toYaml } from '../frontmatter'
import { detectLibreOffice, exportSvg } from '../office'
import { splitSvgSlides } from '../svg'
import { buildOdp, frame, item, line, list, p, page, textBox } from './odpFixture'

// A trimmed-down LibreOffice SVG export: meta slide table, animations, a
// master page in defs, the dummy slide, two slide groups in hidden wrappers,
// and the navigation script.
const SAMPLE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg version="1.2" viewBox="0 0 25400 19050" xmlns="http://www.w3.org/2000/svg" xmlns:ooo="http://xml.openoffice.org/svg/export" xmlns:xlink="http://www.w3.org/1999/xlink">
 <defs class="ClipPathGroup"><clipPath id="presentation_clip_path"><rect x="0" y="0" width="25400" height="19050"/></clipPath></defs>
 <defs><g id="ooo:meta_slides" ooo:number-of-slides="2"><g id="ooo:meta_slide_0" ooo:slide="id1" ooo:master="id9"/><g id="ooo:meta_slide_1" ooo:slide="id2" ooo:master="id9"/></g></defs>
 <defs id="presentation-animations"><g/></defs>
 <defs><g id="id9" ooo:name="codeurjc_" class="Master_Slide"><g class="BackgroundObjects"><rect class="red-bar" width="25400" height="400"/></g></g></defs>
 <g class="DummySlide"><g id="dummy-slide" class="Slide"><g ooo:name="dummy-page" class="Page"/></g></g>
 <g class="SlideGroup">
  <g visibility="hidden"><g id="container-id1"><g id="id1" class="Slide" clip-path="url(#presentation_clip_path)"><g ooo:name="page2" class="Page"><text>Slide two</text></g></g></g></g>
  <g visibility="hidden"><g id="container-id2"><g id="id2" class="Slide"><g ooo:name="page5" class="Page"><text>Slide five</text></g></g></g></g>
 </g>
 <script type="text/ecmascript"><![CDATA[ /* navigation engine */ ]]></script>
</svg>`

describe('splitSvgSlides', () => {
  it('produces a standalone SVG per requested slide, keyed by ODP page name', () => {
    const slides = splitSvgSlides(SAMPLE_SVG, new Set(['page5']))
    expect([...slides.keys()]).toEqual(['page5'])
    const svg = slides.get('page5')!
    expect(svg).toContain('viewBox="0 0 25400 19050"')
    expect(svg).toContain('Slide five')
    expect(svg).not.toContain('Slide two')
    expect(svg).toContain('xlink:href="#id9"')
    expect(svg).toContain('class="Master_Slide"')
    expect(svg).toContain('presentation_clip_path')
    expect(svg).not.toContain('<script')
    expect(svg).not.toContain('ooo:meta_slides')
    expect(svg).not.toContain('presentation-animations')
    expect(svg).not.toContain('visibility="hidden"')
    expect(svg).not.toContain('dummy-slide')
  })

  it('returns every exported slide when no names are requested', () => {
    expect([...splitSvgSlides(SAMPLE_SVG).keys()]).toEqual(['page2', 'page5'])
  })
})

describe('libreOffice detection and export', () => {
  const runner = (stdout: string, code = 0): OfficeRunner => async () => ({ code, stdout })

  it('accepts LibreOffice 7.4 or newer', async () => {
    expect(await detectLibreOffice(runner('LibreOffice 25.8.7.3 580(Build:3)'))).toEqual({ ok: true, version: '25.8.7.3' })
    expect(await detectLibreOffice(runner('LibreOffice 7.4.0.3 40(Build:3)'))).toEqual({ ok: true, version: '7.4.0.3' })
  })

  it('reports too-old and missing installations', async () => {
    expect(await detectLibreOffice(runner('LibreOffice 7.3.7.2 30(Build:2)'))).toEqual({ ok: false, reason: 'too-old', version: '7.3.7.2' })
    expect(await detectLibreOffice(runner('', -1))).toEqual({ ok: false, reason: 'missing' })
  })

  it('exports with an isolated profile and returns the SVG text', async () => {
    let seen: string[] = []
    const fake: OfficeRunner = async (args) => {
      seen = args
      const outDir = args[args.indexOf('--outdir') + 1]
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, 'Tema 1.1.svg'), '<svg/>')
      return { code: 0, stdout: '' }
    }
    expect(await exportSvg('/decks/Tema 1.1.odp', fake)).toBe('<svg/>')
    expect(seen[0]).toMatch(/^-env:UserInstallation=file:\/\//)
    expect(seen.slice(1, 4)).toEqual(['--headless', '--convert-to', 'svg'])
  })

  it('fails clearly when the export writes nothing', async () => {
    await expect(exportSvg('/decks/x.odp', runner('', 1))).rejects.toThrow(/SVG export failed/)
  })
})

describe('comparisonMarkdown', () => {
  it('lists only slides with losses, each followed by its imported converted slide', () => {
    const md = comparisonMarkdown([
      { odpNumbers: [5], slidevNumber: 4, fileIndex: 5, hidden: false, losses: [] },
      { odpNumbers: [16], slidevNumber: 14, fileIndex: 16, hidden: false, losses: ['2 arrows omitted'], originalImage: '/odp-originals/page16.svg' },
      { odpNumbers: [9, 10, 11], slidevNumber: 8, fileIndex: 9, hidden: false, losses: ['highlight box not aligned to code lines'] },
      { odpNumbers: [112], fileIndex: 100, hidden: true, losses: ['grouped shapes omitted'] },
    ], 'Tema 1.2')!
    expect(md).toContain('theme: codeurjc-slidev-theme')
    expect(md).toContain('title: Comparison — Tema 1.2')
    expect(md).toContain('layout: image-right\nimage: /odp-originals/page16.svg')
    expect(md).toContain('# Slide 14\n\nODP slide 16\n\n- 2 arrows omitted')
    expect(md).toContain('src: ./slides.md#16')
    expect(md).toContain('# Slide 8\n\nODP slides 9–11')
    expect(md).toContain('# Hidden slide\n\nODP slide 112')
    expect(md).not.toContain('src: ./slides.md#100')
    expect(md).not.toContain('ODP slide 5\n')
    expect(md).not.toMatch(/^layout: default/m)
  })

  it('marks only the first slide\'s headmatter as a comparison deck', () => {
    const entries = [
      { odpNumbers: [3], slidevNumber: 3, fileIndex: 4, hidden: false, losses: ['arrow omitted'] },
      { odpNumbers: [5], slidevNumber: 5, fileIndex: 6, hidden: false, losses: ['arrow omitted'] },
    ]
    const md = comparisonMarkdown(entries, 'x')!
    expect(md).toContain('theme: codeurjc-slidev-theme')
    expect(md.match(/^comparisonDeck: true$/gm)).toHaveLength(1)
    expect(md.indexOf('comparisonDeck: true')).toBeLessThan(md.indexOf('layout:'))
  })

  it('returns undefined when nothing was lost', () => {
    expect(comparisonMarkdown([{ odpNumbers: [1], slidevNumber: 1, fileIndex: 1, hidden: false, losses: [] }], 'x')).toBeUndefined()
  })

  it('includes converted slides from the deck file it is given', () => {
    const entries = [{ odpNumbers: [3], slidevNumber: 3, fileIndex: 4, hidden: false, losses: ['arrow omitted'] }]
    expect(comparisonMarkdown(entries, 'x')).toContain('src: ./slides.md#4')
    expect(comparisonMarkdown(entries, 'x', 'tema1.md')).toContain('src: ./tema1.md#4')
    expect(comparisonMarkdown(entries, 'x', 'tema1.md')).not.toContain('slides.md')
  })
})

describe('toYaml', () => {
  it('quotes ambiguous strings and writes rect lists as flow maps', () => {
    expect(toYaml({
      layout: 'cover',
      lesson: 'Bloque 1: Introducción a pruebas software',
      date: '12-2025',
      hide: true,
      geometry: { content: { x: 31, y: 98, w: 500, h: 424 }, images: [{ x: 1, y: 2, w: 3, h: 4 }] },
    })).toBe([
      'layout: cover',
      'lesson: "Bloque 1: Introducción a pruebas software"',
      'date: 12-2025',
      'hide: true',
      'geometry:',
      '  content: { x: 31, y: 98, w: 500, h: 424 }',
      '  images:',
      '    - { x: 1, y: 2, w: 3, h: 4 }',
    ].join('\n'))
  })

  it('writes a list of nested objects as block YAML, not as JSON blobs', () => {
    expect(toYaml({
      callouts: [
        { at: { image: 0, x: 0.45, y: 0.51 }, text: 'Le damos un nombre', box: { x: 620, y: 300 } },
        { at: { x: 480, y: 210 } },
      ],
    })).toBe([
      'callouts:',
      '  - at: { image: 0, x: 0.45, y: 0.51 }',
      '    text: Le damos un nombre',
      '    box: { x: 620, y: 300 }',
      '  - at: { x: 480, y: 210 }',
    ].join('\n'))
  })
})

describe('comparison deck with the real LibreOffice', () => {
  it('renders originals only for the lossy slides', async (ctx) => {
    const status = await detectLibreOffice()
    if (!status.ok) {
      console.warn(`[comparison] skipping the LibreOffice integration test: soffice ≥ 7.4 not available (${status.reason})`)
      ctx.skip()
    }
    const dir = mkdtempSync(join(tmpdir(), 'odp-office-'))
    try {
      const odpPath = join(dir, 'Deck.odp')
      const title = frame('title', { x: 1.29, y: 1.7, w: 19.9, h: 2.8 }, textBox(p('Docker')))
      const body = frame('outline', { x: 1.27, y: 4.457, w: 22.859, h: 11.048 }, textBox(list(item(p('uno')))))
      writeFileSync(odpPath, buildOdp({ pages: [
        page(title + body, { name: 'clean' }),
        page(frame('title', { x: 1.29, y: 1.7, w: 19.9, h: 2.8 }, textBox(p('Otra'))) + body + line(2, 16, 10, 17), { name: 'lossy' }),
      ] }))
      const result = await convertOdp({ odpPath, git: () => null })
      expect(result.comparison).toBe('written')
      expect([...result.originals.keys()]).toEqual(['odp-originals/lossy.svg'])
      expect(result.originals.get('odp-originals/lossy.svg')).toMatch(/^<\?xml|<svg/)
      expect(result.comparisonMarkdown).toContain('# Slide 2\n\nODP slide 2')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
