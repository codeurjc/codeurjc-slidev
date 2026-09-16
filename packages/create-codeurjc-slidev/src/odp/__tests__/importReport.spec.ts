import type { ConvertResult } from '../convert'
import type { OfficeRunner } from '../office'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { emptyDir, removableEntries } from '../../../project-dir.mjs'
import { convertOdp } from '../convert'
import { importReportMarkdown, reportFileName } from '../importReport'
import { formatReport, importOdpProject } from '../index'
import { buildOdp, customShape, frame, item, list, p, page, textBox, xmlEscape } from './odpFixture'

// The markdown import report: what convertOdp records for it, how it renders,
// where it's written, and that re-imports keep earlier reports.

const TITLE = (text: string) => frame('title', { x: 1.3, y: 1.7, w: 20, h: 2.8 }, textBox(p(text)))
const BODY = frame('outline', { x: 1.27, y: 4.457, w: 22.859, h: 5 }, textBox(list(item(p('Un punto')))))
const mono = (lines: string[]) => customShape('ooxml-rect', { x: 2, y: 5, w: 20, h: 6 }, lines.map(l => p(xmlEscape(l), 'Pmono')).join(''))
const LOOSE_TEXT = frame(null, { x: 1, y: 15, w: 20, h: 1 }, textBox(p('Suelto')))

const SUM_TEST = ['public class SumTest {', '    int sum = 1 + 1;', '}']

const PAGES = [
  page(TITLE('Intro') + BODY, { name: 'intro' }),
  page(TITLE('Import') + mono(SUM_TEST), { name: 'exact' }),
  page(TITLE('Casi') + mono(['public class SumTest {', '    int sum = 1 + 1;', '    int twice = sum * 2;', '}']), { name: 'near' }),
  page(TITLE('Nada') + mono(['print("hola | mundo")', 'print(`adiós`)']), { name: 'none' }),
  page(TITLE('Terminal') + customShape('ooxml-rect', { x: 1.5, y: 8, w: 22, h: 4 }, `${p('$ mvn test', 'Ta')}${p('BUILD SUCCESS', 'Ta')}`, 'grBox'), { name: 'terminal' }),
  page(TITLE('Oculta') + BODY + LOOSE_TEXT, { name: 'hiddenlossy', hidden: true }),
  page(TITLE('Pérdida uno') + BODY + LOOSE_TEXT, { name: 'lossy1' }),
  page(TITLE('Pérdida dos') + BODY + LOOSE_TEXT, { name: 'lossy2' }),
]

/** A fake LibreOffice exporting one slide group per visible page. */
const fakeOffice: OfficeRunner = async (args) => {
  if (args[0] === '--version')
    return { code: 0, stdout: 'LibreOffice 25.8.7.3 580(Build:3)' }
  const outDir = args[args.indexOf('--outdir') + 1]
  mkdirSync(outDir, { recursive: true })
  const visible = ['intro', 'exact', 'near', 'none', 'terminal', 'lossy1', 'lossy2']
  const groups = visible.map((name, i) => `<g visibility="hidden"><g id="container-id${i + 1}"><g id="id${i + 1}" class="Slide"><g ooo:name="${name}" class="Page"><text>${name}</text></g></g></g></g>`).join('')
  writeFileSync(join(outDir, 'Deck.svg'), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:ooo="http://xml.openoffice.org/svg/export" viewBox="0 0 25400 19050"><g class="SlideGroup">${groups}</g></svg>`)
  return { code: 0, stdout: '' }
}

let dir: string
let odpPath: string
let noFolderOdp: string
let result: ConvertResult

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'odp-report-'))
  odpPath = join(dir, 'Deck.odp')
  writeFileSync(odpPath, buildOdp({ pages: PAGES }))
  mkdirSync(join(dir, 'Deck/ejem1/src'), { recursive: true })
  writeFileSync(join(dir, 'Deck/ejem1/src/SumTest.java'), SUM_TEST.join('\n'))
  mkdirSync(join(dir, 'solo'))
  noFolderOdp = join(dir, 'solo/Deck.odp')
  writeFileSync(noFolderOdp, buildOdp({ pages: PAGES }))
  result = await convertOdp({ odpPath, office: fakeOffice, git: () => null })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('convertOdp: data for the report', () => {
  it('records how every code block matched', () => {
    expect(result.codeBlocks.map(b => [b.slidevNumber, b.outcome])).toEqual([[2, 'imported'], [3, 'close'], [4, 'none'], [5, 'command']])
    expect(result.codeBlocks[0]).toMatchObject({ file: 'ejem1/src/SumTest.java', startLine: 1, endLine: 3, language: 'java' })
    expect(result.codeBlocks[1]).toMatchObject({ file: 'ejem1/src/SumTest.java', matched: 3, total: 4 })
    expect(result.codeBlocks[2]).toMatchObject({ firstLine: 'print("hola | mundo")' })
    expect(result.codeBlocks[3]).toMatchObject({ firstLine: '$ mvn test' })
  })

  it('marks code as having no folder when none was found, except terminal commands', async () => {
    const { codeBlocks, context } = await convertOdp({ odpPath: noFolderOdp, office: false, git: () => null })
    expect(codeBlocks.map(b => b.outcome)).toEqual(['no-folder', 'no-folder', 'no-folder', 'command'])
    expect(context).toMatchObject({ codeFolder: undefined, codeFiles: 0, office: 'disabled' })
  })

  it('returns the import context', () => {
    expect(result.context).toMatchObject({ codeFolder: join(dir, 'Deck'), codeFiles: 1, repoBase: undefined, office: { ok: true, version: '25.8.7.3' } })
  })

  it('numbers each lossy slide\'s information slide as comparison.md lays them out', () => {
    // Slide order in comparison.md: information slides (headings) and imported converted slides (src).
    const order = [...result.comparisonMarkdown!.matchAll(/^(# (?:Slide \d+|Hidden slide)|src: \S+)$/gm)].map(m => m[1])
    for (const [fileIndex, number] of result.comparisonSlides) {
      const report = result.reports.find(r => r.fileIndex === fileIndex)!
      expect(order[number - 1]).toBe(report.hidden ? '# Hidden slide' : `# Slide ${report.slidevNumber}`)
    }
    // Slide 3 (its code differs from the file), hidden slide 6 (no converted
    // slide follows it), then two visible ones.
    expect([...result.comparisonSlides]).toEqual([[3, 1], [6, 3], [7, 4], [8, 6]])
  })
})

describe('import report rendering', () => {
  const importedAt = new Date(2026, 8, 16, 20, 45, 12)

  it('names reports by local time, suffixing on a clash', () => {
    expect(reportFileName(importedAt, new Set())).toBe('import-report-2026-09-16T20-45-12.md')
    expect(reportFileName(importedAt, new Set(['import-report-2026-09-16T20-45-12.md', 'import-report-2026-09-16T20-45-12-2.md']))).toBe('import-report-2026-09-16T20-45-12-3.md')
  })

  it('renders the context, summary, notices, code, notes and losses', () => {
    const md = importReportMarkdown(result, { odpPath, importedAt, version: '0.2.0' })
    expect(md).toMatch(/^# Import report — Deck\n/)
    expect(md).toContain(`- **Source:** \`${odpPath}\``)
    expect(md).toContain('- **Imported:** 2026-09-16 20:45:12')
    expect(md).toContain('- **Importer:** create-codeurjc-slidev 0.2.0')
    expect(md).toContain(`- **Code folder:** \`${join(dir, 'Deck')}\` (1 file)`)
    expect(md).toContain('- **Source links:** none')
    expect(md).toContain('- **LibreOffice:** 25.8.7.3')
    expect(md).toContain('- **Comparison deck:** written to `comparison.md`')
    expect(md).toContain('- 8 ODP slides converted into 8 slides')
    expect(md).toContain('- Code: 1 snippet import, 3 inline blocks')
    expect(md).toContain('- 4 slides with losses, 0 slides with notes')
    expect(md).toContain('## Notices\n\n- No GitHub origin found for the code folder')

    expect(md).toContain('| Slide | ODP | Language | Result | Details |')
    expect(md).toContain('| 2 | 2 | java | imported | `ejem1/src/SumTest.java` lines 1–3 |')
    expect(md).toContain('| 3 | 3 | java | close | `ejem1/src/SumTest.java` (3 of 4 lines match) |')
    // Pipes are escaped for the table.
    expect(md).toContain('| no match | `print("hola \\| mundo")` |')
    expect(md).toContain('| command | `$ mvn test` |')

    expect(md).toContain('## Notes\n\nNo notes.')
    expect(md).toContain('| Slide | ODP | Losses | Comparison |')
    expect(md).toContain('| 3 | 3 | code differs from SumTest.java | slide 1 |')
    expect(md).toContain('| hidden | 6 | positioned text box flattened into a paragraph | slide 3 |')
    expect(md).toContain('| 7 | 8 | positioned text box flattened into a paragraph | slide 6 |')
  })

  it('says so when a section has nothing to list, and when there was no code folder', async () => {
    const quiet = await convertOdp({ odpPath: noFolderOdp, office: false, git: () => null })
    const clean = { ...quiet, reports: quiet.reports.map(r => ({ ...r, losses: [], info: [] })), notices: [], codeBlocks: [] }
    const md = importReportMarkdown(clean, { odpPath: noFolderOdp, importedAt, version: '0.2.0' })
    expect(md).toContain('## Notices\n\nNo notices.')
    expect(md).toContain('## Code\n\nNo code folder was found, so no code block could be matched against files.\n\nNo code blocks.')
    expect(md).toContain('## Losses\n\nNothing was lost.')
    expect(md).toContain('- **LibreOffice:** not used')
  })

  it('widens inline code around backticks and keeps line breaks in cells', () => {
    const md = importReportMarkdown({
      ...result,
      codeBlocks: [{ ...result.codeBlocks[2], firstLine: 'print(`adiós`)' }],
      reports: result.reports.map(r => r.fileIndex === 7 ? { ...r, info: ['una\ndos'] } : r),
    }, { odpPath, importedAt, version: '0.2.0' })
    expect(md).toContain('| no match | `` print(`adiós`) `` |')
    expect(md).toContain('| 6 | 7 | una<br>dos |')
  })
})

describe('writing the report', () => {
  it('writes a new report per import and names it in the console summary', async () => {
    const root = join(dir, 'project')
    const now = () => new Date(2026, 8, 16, 20, 45, 12)
    const first = await importOdpProject({ odpPath, root, office: false, git: () => null, now, version: '0.2.0' })
    const second = await importOdpProject({ odpPath, root, office: false, git: () => null, now, version: '0.2.0' })
    expect(first.reportPath).toBe('import-reports/import-report-2026-09-16T20-45-12.md')
    expect(second.reportPath).toBe('import-reports/import-report-2026-09-16T20-45-12-2.md')
    expect(readdirSync(join(root, 'import-reports')).sort()).toEqual(['import-report-2026-09-16T20-45-12-2.md', 'import-report-2026-09-16T20-45-12.md'])
    expect(readFileSync(join(root, first.reportPath!), 'utf-8')).toContain('create-codeurjc-slidev 0.2.0')
    expect(formatReport(second).at(-1)).toBe('  Report written to import-reports/import-report-2026-09-16T20-45-12-2.md')
  })
})

describe('project directory handling', () => {
  it('ignores and keeps a top-level import-reports/, but not a nested one', () => {
    const root = join(dir, 'reimport')
    mkdirSync(join(root, 'import-reports'), { recursive: true })
    writeFileSync(join(root, 'import-reports/import-report-old.md'), 'old')
    expect(removableEntries(root)).toEqual([])

    mkdirSync(join(root, 'code/import-reports'), { recursive: true })
    writeFileSync(join(root, 'code/import-reports/x.md'), 'x')
    writeFileSync(join(root, 'slides.md'), 'slides')
    expect(removableEntries(root).sort()).toEqual(['code', 'slides.md'])

    emptyDir(root)
    expect(readdirSync(root)).toEqual(['import-reports'])
    expect(existsSync(join(root, 'import-reports/import-report-old.md'))).toBe(true)
  })
})
