import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { convertOdp } from '../convert'
import { importReportMarkdown } from '../importReport'
import { detectLibreOffice } from '../office'

// Converts the real CodeURJC course decks the importer was tuned on. They are
// never committed (the repo's `odp/` is gitignored): the decks and their code
// folders are provided upon request to the author. Point
// CODEURJC_ODP_FIXTURES at another directory to use a different location.
// Every missing deck skips its tests with a warning, so CI stays green.

const fixturesDir = process.env.CODEURJC_ODP_FIXTURES ?? resolve(import.meta.dirname, '../../../../../odp')

const DECKS = [
  '2.1 Introducción',
  '2.2 Código de calidad',
  '2.5 Análisis estático de código',
  'Anexo – Despliegue de aplicaciones en Azure',
  'Anexo – Introducción a Docker para CI',
  'Artefactos, repositorios y versiones',
  'Integración Continua con GitHub Actions',
  'Tema 1.1 - Introducción a pruebas software',
  'Tema 1.2 - Pruebas unitarias',
  'Tema 1.3 - Cobertura de código',
  'Tema 4 - Pruebas de sistema - Selenium',
]

function deckPath(name: string): string | undefined {
  const path = join(fixturesDir, `${name}.odp`)
  if (existsSync(path))
    return path
  console.warn(`[corpus] skipping "${name}": ${path} not found (the real ODP fixtures are provided upon request to the author)`)
  return undefined
}

async function convert(name: string) {
  return convertOdp({ odpPath: deckPath(name)!, office: false, git: () => null })
}

describe('oDP corpus', () => {
  for (const name of DECKS) {
    it.skipIf(!deckPath(name))(`converts "${name}"`, async () => {
      const result = await convert(name)
      expect(result.stats.slides).toBe(result.stats.odpSlides - result.reports.reduce((n, r) => n + r.odpNumbers.length - 1, 0))
      // Every deck starts with the hidden alternate-course cover.
      expect(result.slideSources[0]).toContain('layout: cover')
      expect(result.slideSources[0]).toContain('hide: true')
      expect(result.slideSources[0]).toContain('theme: codeurjc-slidev-theme')
      // Loss descriptions go to the console/comparison deck, never into slides.md.
      expect(result.slidesMarkdown).not.toMatch(/\b(?:omitted|flattened into a paragraph|kept as separate slides)\b/)
    })
  }

  it.skipIf(!deckPath('Tema 1.1 - Introducción a pruebas software'))('tema 1.1: two-line titles, in-content headings and subtitle resets', async () => {
    const { slideSources } = await convert('Tema 1.1 - Introducción a pruebas software')
    // ODP 25 continues the "Tipos de pruebas" title set by the slide before it, so only its subtitle is written.
    expect(slideSources.some(s => s.includes('## Qué características prueban\n\n### Pruebas Funcionales'))).toBe(true)
    expect(slideSources.some(s => s.includes('### Pruebas No Funcionales'))).toBe(true)
    expect(slideSources.some(s => s.includes('# Calidad de las pruebas\n##\n'))).toBe(true)
    // "Justificación y objetivos" repeats on many consecutive slides but is written far fewer times.
    expect(slideSources.filter(s => s.includes('# Justificación y objetivos')).length).toBeLessThan(5)
  })

  it.skipIf(!deckPath('Tema 1.2 - Pruebas unitarias'))('tema 1.2: exact code matches become snippet imports', async () => {
    const result = await convert('Tema 1.2 - Pruebas unitarias')
    expect(result.stats.imports).toBeGreaterThan(10)
    expect(result.slidesMarkdown).toContain('<<< @/code/ejem1/src/test/java/es/codeurjc/test/ejem/Calculadora1Test.java')
    expect(result.reports.some(r => r.losses.some(l => l.startsWith('code differs from')))).toBe(true)
  })

  it.skipIf(!deckPath('Tema 1.2 - Pruebas unitarias') || !deckPath('Integración Continua con GitHub Actions'))('walk-throughs over the same code merge into step ranges; image swaps warn', async () => {
    const tema12 = await convert('Tema 1.2 - Pruebas unitarias')
    expect(tema12.reports.some(r => r.odpNumbers.join(',') === '112,113,114')).toBe(true)
    expect(tema12.slidesMarkdown).toMatch(/\[!mark\{-0\}@\d+,\d+\] Creamos un mock de DBAlumno con mock\(\)/)
    expect(tema12.slidesMarkdown).toMatch(/\[!mark\{1-1\}@\d+,\d+\] Configuramos el valor que devuelve esa función/)
    expect(tema12.slidesMarkdown).toMatch(/\[!mark\{2\}@\d+,\d+\] Pasamos el objeto al SUT/)
    expect(tema12.notices).toContain('Build-up of ODP slides 115–116 kept as separate slides (can\'t convert to click steps: image removed)')

    const ci = await convert('Integración Continua con GitHub Actions')
    expect(ci.reports.some(r => r.odpNumbers.join(',') === '10,11')).toBe(true)
    expect(ci.slidesMarkdown).toMatch(/push: # \[!mark\{-0\}@\d+,\d+\] El Workflow se ejecutará ante el evento push/)
  })

  it.skipIf(!deckPath('Integración Continua con GitHub Actions'))('gitHub Actions: highlight boxes, labels and callouts over the workflow become code highlights', async () => {
    const { slidesMarkdown, reports } = await convert('Integración Continua con GitHub Actions')
    // A labeled frame around the whole workflow, and a labeled box around the job.
    expect(slidesMarkdown).toContain('name: Continuous integration example # [!mark:start] WORKFLOW')
    expect(slidesMarkdown).toContain('test: # [!mark:start] JOB')
    // Both ranges end on the same line, which now carries both end markers.
    expect(slidesMarkdown).toMatch(/- run: mvn test # \[!mark:end\] \[!mark:end\]/)
    // A narrow box plus an arrow to an explanation box: a positioned substring callout.
    expect(slidesMarkdown).toMatch(/runs-on: ubuntu-latest #.*\[!mark\(\d+-\d+\)(?:\{\d+\})?@\d+,\d+\] Cada Job se ejecuta en un runner/)
    // Marks sharing a line are no longer dropped.
    expect(reports.flatMap(r => r.losses).join('\n')).not.toContain('another marker already uses that line')
  })

  it.skipIf(!deckPath('Anexo – Despliegue de aplicaciones en Azure'))('azure: arrows over portal screenshots become slide callouts, not losses', async () => {
    const { slidesMarkdown, reports } = await convert('Anexo – Despliegue de aplicaciones en Azure')
    // An arrow from a text box into a screenshot: an image-anchored callout
    // carrying the text and the box position it was drawn at.
    expect(slidesMarkdown).toMatch(/callouts:\n {2}- at: \{ image: \/images\/[^,#]+(?:#\d+)?, x: [\d.]+, y: [\d.]+ \}\n {4}text: .+\n {4}box: \{ x: \d+, y: \d+ \}/)
    // An arrow with nothing at its other end: anchor only, so the theme draws
    // the arrow and no box.
    expect(slidesMarkdown).toMatch(/ {2}- at: \{ image: \/images\/[^,#]+(?:#\d+)?, x: [\d.]+, y: [\d.]+ \}\n(?! {4}text:)/)
    // Those arrows used to be reported as losses; now nothing is left to report.
    expect(reports.flatMap(r => r.losses).join('\n')).not.toContain('arrow or line omitted')
  })

  it.skipIf(!deckPath('2.2 Código de calidad'))('2.2: a label drawn on a diagram image becomes a callout instead of a flattened paragraph', async () => {
    const { slidesMarkdown } = await convert('2.2 Código de calidad')
    expect(slidesMarkdown).toContain('text: MODELO DE DOMINIO')
    expect(slidesMarkdown).toMatch(/- at: \{ image: \/images\/[^,#]+(?:#\d+)?, x: [\d.]+, y: [\d.]+ \}\n {4}text: MODELO DE DOMINIO/)
  })

  it.skipIf(!deckPath('2.5 Análisis estático de código'))('2.5: bare pointers into screenshots become text-less callouts', async () => {
    const { slidesMarkdown, reports } = await convert('2.5 Análisis estático de código')
    expect(slidesMarkdown).toMatch(/ {2}- at: \{ image: \/images\/[^,#]+(?:#\d+)?, x: [\d.]+, y: [\d.]+ \}\n(?! {4}text:)/)
    expect(reports.flatMap(r => r.losses).join('\n')).not.toContain('arrow or line omitted')
  })

  it.skipIf(!deckPath('Anexo – Introducción a Docker para CI') || !deckPath('Tema 1.2 - Pruebas unitarias') || !deckPath('Tema 4 - Pruebas de sistema - Selenium'))('rotated arrows take part in callouts instead of silently vanishing', async () => {
    const docker = await convert('Anexo – Introducción a Docker para CI')
    // A 180°-rotated arrow from an explanation box to a command.
    expect(docker.slidesMarkdown).toMatch(/\$ mvn spring-boot:build-image # \[!mark@\d+,\d+\] Genera la imagen posts:0\.1\.0-SNAPSHOT/)
    expect(docker.slidesMarkdown).toContain('text: Nombre de la imagen que hemos creado')
    const tema12 = await convert('Tema 1.2 - Pruebas unitarias')
    expect(tema12.slidesMarkdown).toContain('text: Sólo muestra que la aserción no es correcta')
    // A vertically mirrored line's tip is its top-right end: 27% down the screenshot, not 40%.
    expect(tema12.slidesMarkdown).toMatch(/- at: \{ image: \/images\/[^,]+, x: 0\.042, y: 0\.2721 \}/)
    const selenium = await convert('Tema 4 - Pruebas de sistema - Selenium')
    expect(selenium.slidesMarkdown).toMatch(/@LocalServerPort \/\/ \[!mark@\d+,\d+\] Arranque automático del SUT/)
  })

  it.skipIf(!deckPath('Tema 1.1 - Introducción a pruebas software'))('tema 1.1: the methodology pipelines become mermaid flowcharts with their "Pruebas" callouts', async () => {
    const { reports, slideSources } = await convert('Tema 1.1 - Introducción a pruebas software')
    const slideOf = (odp: number) => {
      const report = reports.find(r => r.odpNumbers.includes(odp))!
      return { report, source: slideSources[report.fileIndex - 1] }
    }
    const pointedAt = { 81: 'Implementación', 82: 'Implementación', 83: 'Requisitos', 84: 'Requisitos' }
    for (const [odp, node] of Object.entries(pointedAt)) {
      const { report, source } = slideOf(Number(odp))
      expect(source).toContain('```mermaid\nflowchart LR\n  n1["Requisitos"]\n  n2["Análisis / Diseño"]\n  n3["Implementación"]\n  n1 --> n2\n  n2 --> n3\n```')
      expect(source).toContain(`callouts:\n  - at: { text: ${node} }\n    text: Pruebas`)
      expect(report).toMatchObject({ losses: [], info: ['diagram converted to a mermaid flowchart'] })
    }
    // Given/When/Then boxes pointing into a code screenshot stay image callouts.
    expect(slideOf(56).source).toMatch(/- at: \{ image: \/images\/[^,]+, x: [\d.]+, y: [\d.]+ \}\n {4}text: Given/)
    expect(slideOf(56).source).not.toContain('```mermaid')
  })

  it.skipIf(!deckPath('Tema 1.2 - Pruebas unitarias'))('tema 1.2: without LibreOffice the class diagram keeps its ordinary conversion, and the console says why', async () => {
    const result = await convertOdp({ odpPath: deckPath('Tema 1.2 - Pruebas unitarias')!, office: async () => ({ code: -1, stdout: '' }), git: () => null })
    expect(result.notices).toContain('Diagrams kept as losses: LibreOffice ≥ 7.4 (soffice) was not found')
    expect([...result.images.keys()].some(k => k.startsWith('images/diagram-'))).toBe(false)
  })

  describe('with the real LibreOffice', () => {
    it.skipIf(!deckPath('Tema 1.2 - Pruebas unitarias') || !deckPath('2.2 Código de calidad'))('embeds the drawings callouts can\'t express as cropped SVG images', async (ctx) => {
      const status = await detectLibreOffice()
      if (!status.ok) {
        console.warn(`[corpus] skipping the diagram-image assertions: soffice ≥ 7.4 not available (${status.reason})`)
        ctx.skip()
      }
      const svgNote = 'diagram embedded as an SVG image (not editable)'
      const tema12 = await convertOdp({ odpPath: deckPath('Tema 1.2 - Pruebas unitarias')!, git: () => null })
      const uml = new TextDecoder().decode(tema12.images.get('images/diagram-page123.svg'))
      expect(uml).toContain('WebSocketUser')
      expect(uml).not.toContain('Ejercicio 8')
      expect(tema12.reports.find(r => r.odpNumbers.includes(123))).toMatchObject({ losses: [], info: [svgNote] })

      const calidad = await convertOdp({ odpPath: deckPath('2.2 Código de calidad')!, git: () => null })
      for (const odp of [153, 156, 157]) {
        expect(calidad.images.has(`images/diagram-page${odp}.svg`)).toBe(true)
        expect(calidad.reports.find(r => r.odpNumbers.includes(odp))).toMatchObject({ losses: [], info: [svgNote] })
      }
      // The hexagon slide's labels are inside the picture now, not callouts over it.
      const hexagon = calidad.slideSources[calidad.reports.find(r => r.odpNumbers.includes(156))!.fileIndex - 1]
      expect(hexagon).not.toContain('callouts:')
      expect(new TextDecoder().decode(calidad.images.get('images/diagram-page156.svg'))).toContain('Puerto primario')
    }, 600_000)
  })

  it.skipIf(!deckPath('Tema 1.2 - Pruebas unitarias') || !deckPath('Integración Continua con GitHub Actions'))('import reports record how code matched, the notices and the losses', async () => {
    const report = async (name: string) => importReportMarkdown(await convert(name), { odpPath: deckPath(name)!, importedAt: new Date(2026, 8, 16, 20, 45, 12), version: 'test' })
    const tema12 = await report('Tema 1.2 - Pruebas unitarias')
    expect(tema12).toMatch(/\| java \| imported \| `ejem\d\/[^`]+\.java` lines \d+–\d+ \|/)
    expect(tema12).toMatch(/\| close \| `[^`]+` \(\d+ of \d+ lines match\) \|/)
    expect(tema12).toMatch(/\| no match \| `[^`]+` \|/)
    expect(tema12).toContain('- No GitHub origin found for the code folder')
    expect(tema12).toMatch(/## Losses\n\n\| Slide \| ODP \| Losses \| Comparison \|/)

    const actions = await report('Integración Continua con GitHub Actions')
    expect(actions).toContain('## Code\n\nNo code folder was found, so no code block could be matched against files.')
    expect(actions).toMatch(/\| yaml \| no code folder \| `name: Continuous integration example` \|/)
  })
})
