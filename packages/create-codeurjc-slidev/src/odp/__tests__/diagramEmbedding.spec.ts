import type { OfficeRunner } from '../office'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { convertOdp } from '../convert'
import { formatReport } from '../index'
import { detectLibreOffice } from '../office'
import { cropDiagram, parseSvgExport } from '../svgCrop'
import { buildOdp, customShape, frame, item, line, list, p, page, textBox } from './odpFixture'

// SVG-tier diagrams end to end: cropping LibreOffice's export, the single
// shared export run, fallbacks, and how conversions are reported.

/** One exported shape: its class group, an id group, the bounding box (1/100 mm) and some drawing. */
function exportedShape(cls: string, box: [number, number, number, number], text = ''): string {
  const [x, y, w, h] = box
  return `<g class="${cls}"><g id="s${x}-${y}"><rect class="BoundingBox" stroke="none" fill="none" x="${x}" y="${y}" width="${w}" height="${h}"/><path d="M ${x},${y} L ${x + w},${y + h}"/>${text ? `<text>${text}</text>` : ''}</g></g>`
}

/** A trimmed LibreOffice export: shared defs, a master page, metadata, and one hidden-wrapped group per slide. */
function exportOf(slides: Record<string, string>): string {
  const groups = Object.entries(slides).map(([name, shapes], i) => `<g visibility="hidden"><g id="container-id${i + 1}"><g id="id${i + 1}" class="Slide" clip-path="url(#presentation_clip_path)"><g ooo:name="${name}" class="Page">${shapes}</g></g></g></g>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><svg version="1.2" width="254mm" height="190.5mm" viewBox="0 0 25400 19050" xmlns="http://www.w3.org/2000/svg" xmlns:ooo="http://xml.openoffice.org/svg/export" xmlns:xlink="http://www.w3.org/1999/xlink"><defs class="ClipPathGroup"><clipPath id="presentation_clip_path"><rect x="0" y="0" width="25400" height="19050"/></clipPath></defs><defs><g id="ooo:meta_slides" ooo:number-of-slides="1"/></defs><defs id="presentation-animations"><g/></defs><defs><g id="id9" class="Master_Slide"><g class="BackgroundObjects"><rect class="red-bar" width="25400" height="400"/></g></g></defs><g class="SlideGroup">${groups}</g><script type="text/ecmascript"><![CDATA[ /* navigation */ ]]></script></svg>`
}

// A class diagram: two class boxes, a compartment line across the first, and
// an inheritance line ending in a triangle. Not a clear graph, and no callout
// can express the triangle, so an SVG candidate.
const TITLE = (text: string) => frame('title', { x: 1.29, y: 1.7, w: 19.9, h: 2.8 }, textBox(p(text)))
const UML = customShape('rectangle', { x: 5, y: 5, w: 6, h: 3 }, p('Chat') + p('addUser()'), 'grFilled')
  + customShape('mso-spt32', { x: 5, y: 6, w: 6, h: 0.001 }, '', 'grBox')
  + line(8, 8, 8, 9.6)
  + customShape('triangle', { x: 7.8, y: 9.6, w: 0.4, h: 0.4 }, '', 'grFilled')
  + customShape('rectangle', { x: 5, y: 10, w: 6, h: 3 }, p('User'), 'grFilled')
const UML_EXPORT = [
  exportedShape('TitleText', [1290, 1700, 19900, 2800], 'Clases'),
  // The body frame overlaps the whole diagram but isn't part of it.
  exportedShape('Outline', [1270, 4457, 22859, 11048], 'Ejercicio 8'),
  exportedShape('com.sun.star.drawing.CustomShape', [4986, 4986, 6028, 3028], 'Chat'),
  exportedShape('com.sun.star.drawing.CustomShape', [4986, 5986, 6028, 29]),
  exportedShape('com.sun.star.drawing.LineShape', [7986, 7986, 29, 1628]),
  exportedShape('com.sun.star.drawing.CustomShape', [7786, 9586, 428, 428]),
  exportedShape('com.sun.star.drawing.CustomShape', [4986, 9986, 6028, 3028], 'User'),
].join('')

describe('cropDiagram', () => {
  const svg = parseSvgExport(exportOf({ uml: UML_EXPORT }))!
  const members = [{ x: 5, y: 5, w: 6, h: 3 }, { x: 5, y: 6, w: 6, h: 0.001 }, { x: 8, y: 8, w: 0, h: 1.6 }, { x: 7.8, y: 9.6, w: 0.4, h: 0.4 }, { x: 5, y: 10, w: 6, h: 3 }]

  it('keeps only the diagram\'s shapes, framed by their union', () => {
    const cropped = cropDiagram(svg, 'uml', members)!
    expect(cropped).toContain('<text>Chat</text>')
    expect(cropped).toContain('<text>User</text>')
    expect(cropped).toContain('com.sun.star.drawing.LineShape')
    // The overlapping body, the title, the master page and the slide machinery stay out.
    expect(cropped).not.toContain('Ejercicio 8')
    expect(cropped).not.toContain('Clases')
    expect(cropped).not.toContain('Master_Slide')
    expect(cropped).not.toContain('ooo:meta_slides')
    expect(cropped).not.toContain('<script')
    expect(cropped).toContain('presentation_clip_path')
    // Union 4986..11014 x 4986..13014, plus a 20-unit margin; no fixed size.
    expect(cropped).toContain('viewBox="4966 4966 6068 8068"')
    expect(cropped).not.toMatch(/<svg[^>]* width=/)
  })

  it('fails closed when a member has no match, and skips unmatched extras', () => {
    expect(cropDiagram(svg, 'uml', [...members, { x: 20, y: 15, w: 2, h: 2 }])).toBeUndefined()
    expect(cropDiagram(svg, 'missing-page', members)).toBeUndefined()
    expect(cropDiagram(svg, 'uml', members, [{ x: 20, y: 15, w: 2, h: 2 }])).toBeDefined()
  })

  it('matches a box whose text overflows its frame, but not a wider one', () => {
    const overflowing = parseSvgExport(exportOf({ uml: UML_EXPORT.replace('<rect class="BoundingBox" stroke="none" fill="none" x="4986" y="9986" width="6028" height="3028"/>', '<rect class="BoundingBox" stroke="none" fill="none" x="4986" y="9986" width="6028" height="3300"/>') }))!
    expect(cropDiagram(overflowing, 'uml', members)).toContain('viewBox="4966 4966 6068 8340"')
    const wider = parseSvgExport(exportOf({ uml: UML_EXPORT.replace('<rect class="BoundingBox" stroke="none" fill="none" x="4986" y="9986" width="6028" height="3028"/>', '<rect class="BoundingBox" stroke="none" fill="none" x="4986" y="9986" width="9000" height="3300"/>') }))!
    expect(cropDiagram(wider, 'uml', members)).toBeUndefined()
  })

  it('matches an extra to a smaller drawn shape inside its frame, as a curve is tighter than its box', () => {
    const withCurve = parseSvgExport(exportOf({ uml: UML_EXPORT + exportedShape('com.sun.star.drawing.OpenBezierShape', [6500, 11000, 1000, 1500]) }))!
    expect(cropDiagram(withCurve, 'uml', members, [{ x: 6, y: 10.5, w: 3, h: 3 }])).toContain('OpenBezierShape')
  })
})

describe('convertOdp: diagrams', () => {
  let dir: string
  let odpPath: string
  let onlyDiagramPath: string

  const PIPELINE = customShape('rectangle', { x: 2, y: 7.6, w: 6, h: 2.2 }, p('Requisitos'), 'grFilled')
    + customShape('right-arrow', { x: 8.1, y: 8.3, w: 1.2, h: 0.8 }, '', 'grFilled')
    + customShape('rectangle', { x: 9.4, y: 7.6, w: 6, h: 2.2 }, p('Diseño'), 'grFilled')

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'odp-diagrams-'))
    odpPath = join(dir, 'Deck.odp')
    writeFileSync(odpPath, buildOdp({
      pages: [
        page(TITLE('Metodologías') + PIPELINE, { name: 'pipeline' }),
        page(TITLE('Clases') + UML, { name: 'uml' }),
        page(TITLE('Clases ocultas') + UML, { name: 'hiddenuml', hidden: true }),
        page(TITLE('Otra') + frame('outline', { x: 1.27, y: 4.457, w: 22.859, h: 5 }, textBox(list(item(p('uno'))))) + frame(null, { x: 1, y: 15, w: 20, h: 1 }, textBox(p('Suelto'))), { name: 'lossy' }),
      ],
    }))
    onlyDiagramPath = join(dir, 'Only.odp')
    writeFileSync(onlyDiagramPath, buildOdp({ pages: [page(TITLE('Clases') + UML, { name: 'uml' })] }))
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  function fakeOffice(slides: Record<string, string>, calls: string[][] = []): OfficeRunner {
    return async (args) => {
      calls.push(args)
      if (args[0] === '--version')
        return { code: 0, stdout: 'LibreOffice 25.8.7.3 580(Build:3)' }
      const outDir = args[args.indexOf('--outdir') + 1]
      const odp = args[args.length - 1]
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, `${odp.endsWith('Only.odp') ? 'Only' : 'Deck'}.svg`), exportOf(slides))
      return { code: 0, stdout: '' }
    }
  }

  const exports = (calls: string[][]) => calls.filter(c => c.includes('--convert-to')).length

  it('converts clear graphs to mermaid and embeds other diagrams, exporting once for diagrams and the comparison deck', async () => {
    const calls: string[][] = []
    const result = await convertOdp({ odpPath, office: fakeOffice({ pipeline: '', uml: UML_EXPORT, lossy: '' }, calls), git: () => null })
    expect(exports(calls)).toBe(1)
    const [pipeline, uml, hidden, lossy] = result.reports

    expect(result.slideSources[0]).toContain('```mermaid\nflowchart LR')
    expect(pipeline).toMatchObject({ losses: [], info: ['diagram converted to a mermaid flowchart'] })

    expect(result.slideSources[1]).toContain('![](/images/diagram-uml.svg)')
    expect(result.slideSources[1]).toMatch(/geometry:\n {2}images:\n {4}- \{ x: \d+, y: \d+, w: \d+, h: \d+ \}/)
    expect(new TextDecoder().decode(result.images.get('images/diagram-uml.svg'))).toContain('<text>User</text>')
    expect(uml).toMatchObject({ losses: [], info: ['diagram embedded as an SVG image (not editable)'] })

    // Hidden slides aren't exported by LibreOffice: ordinary conversion, with losses.
    expect(hidden.info).toEqual([])
    expect(hidden.losses).toContain('decorative shape (triangle) omitted')

    // The comparison deck only lists slides with losses.
    expect(lossy.losses).toEqual(['positioned text box flattened into a paragraph'])
    expect(result.comparisonMarkdown).toContain('ODP slide 4')
    expect(result.comparisonMarkdown).not.toContain('ODP slide 2\n')
    expect([...result.originals.keys()]).toEqual(['odp-originals/lossy.svg'])
  })

  it('exports for diagrams even when nothing was lost', async () => {
    const calls: string[][] = []
    const result = await convertOdp({ odpPath: onlyDiagramPath, office: fakeOffice({ uml: UML_EXPORT }, calls), git: () => null })
    expect(exports(calls)).toBe(1)
    expect(result.comparison).toBe('no-losses')
    expect(result.images.has('images/diagram-uml.svg')).toBe(true)
  })

  it('reports a diagram that isn\'t in the export as a single loss', async () => {
    const result = await convertOdp({ odpPath: onlyDiagramPath, office: fakeOffice({ uml: exportedShape('com.sun.star.drawing.CustomShape', [4986, 4986, 6028, 3028]) }), git: () => null })
    expect(result.reports[0].losses).toEqual(['diagram omitted (not found in LibreOffice\'s SVG export)'])
    expect(result.images.size).toBe(0)
  })

  it('keeps the ordinary conversion without LibreOffice, and says why once', async () => {
    const missing: OfficeRunner = async () => ({ code: -1, stdout: '' })
    const result = await convertOdp({ odpPath, office: missing, git: () => null })
    expect(result.reports[1].losses).toContain('decorative shape (triangle) omitted')
    expect(result.images.size).toBe(0)
    expect(result.notices.filter(n => n.startsWith('Diagrams kept as losses'))).toEqual(['Diagrams kept as losses: LibreOffice ≥ 7.4 (soffice) was not found'])
    // Mermaid needs no LibreOffice.
    expect(result.slideSources[0]).toContain('```mermaid')
  })

  it('prints info notes in their own section, apart from losses', async () => {
    const result = await convertOdp({ odpPath, office: fakeOffice({ pipeline: '', uml: UML_EXPORT, lossy: '' }), git: () => null })
    const lines = formatReport({ result, hasComparison: true, codeFiles: 0 })
    const notes = lines.findIndex(l => l.startsWith('  Converted with notes (2 slides'))
    const losses = lines.findIndex(l => l.startsWith('  Not converted ('))
    expect(notes).toBeGreaterThan(-1)
    expect(lines[notes + 1]).toBe('    Slide 1 (ODP slide 1): diagram converted to a mermaid flowchart')
    expect(lines[notes + 2]).toBe('    Slide 2 (ODP slide 2): diagram embedded as an SVG image (not editable)')
    expect(losses).toBeGreaterThan(notes)
    expect(lines.slice(losses).join('\n')).not.toContain('ODP slide 2)')
  })
})

describe('diagram images with the real LibreOffice', () => {
  it('crops a diagram out of the real export', async (ctx) => {
    const status = await detectLibreOffice()
    if (!status.ok) {
      console.warn(`[diagrams] skipping the LibreOffice integration test: soffice ≥ 7.4 not available (${status.reason})`)
      ctx.skip()
    }
    const dir = mkdtempSync(join(tmpdir(), 'odp-diagrams-office-'))
    try {
      const odpPath = join(dir, 'Deck.odp')
      // Two class boxes joined by a line, and a hexagon no callout can express.
      const drawing = customShape('rectangle', { x: 5, y: 5, w: 6, h: 3 }, p('Chat'), 'grFilled')
        + line(8, 8, 8, 10)
        + customShape('rectangle', { x: 5, y: 10, w: 6, h: 3 }, p('User'), 'grFilled')
        + customShape('hexagon', { x: 11, y: 11, w: 2, h: 2 }, '', 'grFilled')
      writeFileSync(odpPath, buildOdp({ pages: [page(TITLE('Clases') + drawing, { name: 'uml' })] }))
      const result = await convertOdp({ odpPath, git: () => null })
      expect(result.reports[0]).toMatchObject({ losses: [], info: ['diagram embedded as an SVG image (not editable)'] })
      const svg = new TextDecoder().decode(result.images.get('images/diagram-uml.svg'))
      expect(svg).toMatch(/^<\?xml/)
      expect(svg).toContain('Chat')
      expect(svg).toContain('User')
      expect(svg).not.toContain('Clases')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
