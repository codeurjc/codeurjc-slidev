import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { convertOdp } from '../convert'

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
})
