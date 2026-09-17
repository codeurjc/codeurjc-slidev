import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildOdp, customShape, frame, item, list, p, page, textBox, xmlEscape } from './odpFixture'

// Runs the real CLI (`index.mjs` + the esbuild bundle) against a synthetic ODP.
// The deck converts without losses, so LibreOffice is never invoked. stdin is
// closed, so the "install and start it now?" prompt is declined.

const packageRoot = resolve(import.meta.dirname, '../../..')

const CODE = ['public class SumTest {', '    int sum = 1 + 1;', '}']

let work: string

beforeAll(() => {
  execFileSync('node', ['build.mjs'], { cwd: packageRoot })
  work = mkdtempSync(join(tmpdir(), 'odp-cli-'))
  writeFileSync(join(work, 'Tema 2 - Pruebas.odp'), buildOdp({
    pages: [
      page(frame('title', { x: 1.3, y: 1.7, w: 20, h: 2.8 }, textBox(p('Casos de Test'))) + frame('outline', { x: 1.27, y: 4.457, w: 22.859, h: 11.048 }, textBox(list(item(p('Cada test es un método'))))), { name: 'page1' }),
      page(frame('title', { x: 1.3, y: 1.7, w: 20, h: 2.8 }, textBox(p('Casos de Test'))) + customShape('ooxml-rect', { x: 2, y: 5, w: 20, h: 6 }, CODE.map(l => p(xmlEscape(l), 'Pmono')).join('')), { name: 'page2' }),
    ],
  }))
  mkdirSync(join(work, 'Tema 2 - Pruebas/ejem1/src'), { recursive: true })
  writeFileSync(join(work, 'Tema 2 - Pruebas/ejem1/src/SumTest.java'), CODE.join('\n'))
  mkdirSync(join(work, 'Tema 2 - Pruebas/ejem1/target'), { recursive: true })
  writeFileSync(join(work, 'Tema 2 - Pruebas/ejem1/target/SumTest.class'), 'x')
}, 120000)

afterAll(() => rmSync(work, { recursive: true, force: true }))

/** Runs the CLI with stdin ignored, so interactive prompts (e.g. "install now?") resolve immediately as declined. */
function cli(args: string[]): Promise<{ code: number, stdout: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn('node', [join(packageRoot, 'index.mjs'), ...args], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    const collect = (chunk: unknown) => {
      stdout += String(chunk)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('close', code => resolvePromise({ code: code ?? 1, stdout }))
  })
}

describe('create-codeurjc-slidev --from-odp', () => {
  it('creates a project from the ODP, its images/code and click-aware export script', async () => {
    const { code, stdout } = await cli(['tema-2', '--from-odp', 'Tema 2 - Pruebas.odp'])
    expect(code).toBe(0)
    const root = join(work, 'tema-2')
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('tema-2')
    expect(pkg.dependencies).toHaveProperty('codeurjc-slidev-theme')
    expect(pkg.scripts.export).toBe('slidev export --with-clicks')
    expect(pkg.scripts['dev:compare']).toBeUndefined()

    const slides = readFileSync(join(root, 'slides.md'), 'utf-8')
    expect(slides).toContain('theme: codeurjc-slidev-theme')
    expect(slides).toContain('# Casos de Test')
    expect(slides).toContain('<<< @/code/ejem1/src/SumTest.java java')
    expect(existsSync(join(root, 'code/ejem1/src/SumTest.java'))).toBe(true)
    expect(existsSync(join(root, 'code/ejem1/target'))).toBe(false)
    expect(existsSync(join(root, 'comparison.md'))).toBe(false)

    expect(stdout).toContain('Converted 2 ODP slides into 2 slides')
    expect(stdout).toContain('Code: 1 snippet import, 0 inline blocks')
    expect(stdout).toContain('Nothing was lost')
  })

  it('writes an import report, prints its path, and gitignores reports', async () => {
    const { code, stdout } = await cli(['tema-2-report', '--from-odp', 'Tema 2 - Pruebas.odp'])
    expect(code).toBe(0)
    const root = join(work, 'tema-2-report')
    const [report] = readdirSync(join(root, 'import-reports'))
    expect(report).toMatch(/^import-report-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/)
    const markdown = readFileSync(join(root, 'import-reports', report), 'utf-8')
    expect(markdown).toContain('# Import report — Tema 2 - Pruebas')
    expect(markdown).toMatch(/- \*\*Importer:\*\* create-codeurjc-slidev \d+\.\d+\.\d+/)
    expect(markdown).toContain('| 2 | 2 | java | imported | `ejem1/src/SumTest.java` lines 1–3 |')
    expect(stdout).toContain(`Report written to import-reports/${report}`)
    expect(readFileSync(join(root, '.gitignore'), 'utf-8')).toContain('import-reports/')
  })

  it('imports into a directory holding only earlier reports without asking, keeping them', async () => {
    const root = join(work, 'tema-2-again')
    mkdirSync(join(root, 'import-reports'), { recursive: true })
    writeFileSync(join(root, 'import-reports/import-report-2026-01-01T00-00-00.md'), 'earlier')
    const { code, stdout } = await cli(['tema-2-again', '--from-odp', 'Tema 2 - Pruebas.odp'])
    expect(code).toBe(0)
    expect(stdout).not.toContain('is not empty')
    expect(existsSync(join(root, 'slides.md'))).toBe(true)
    expect(readdirSync(join(root, 'import-reports'))).toHaveLength(2)
    expect(readFileSync(join(root, 'import-reports/import-report-2026-01-01T00-00-00.md'), 'utf-8')).toBe('earlier')
  })

  it('defaults the project directory to a slug of the ODP name', async () => {
    const { code } = await cli(['--from-odp', 'Tema 2 - Pruebas.odp'])
    expect(code).toBe(0)
    expect(existsSync(join(work, 'tema-2-pruebas/slides.md'))).toBe(true)
  })

  it('creates the project at an absolute target path, not under the working directory', async () => {
    const target = mkdtempSync(join(tmpdir(), 'odp-cli-abs-'))
    try {
      const { code } = await cli([join(target, 'deck'), '--from-odp', 'Tema 2 - Pruebas.odp'])
      expect(code).toBe(0)
      expect(existsSync(join(target, 'deck/slides.md'))).toBe(true)
      expect(JSON.parse(readFileSync(join(target, 'deck/package.json'), 'utf-8')).name).toBe('deck')
      expect(existsSync(join(work, target.slice(1)))).toBe(false)
    }
    finally {
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('aborts with a non-zero exit code before creating anything when the ODP is missing', async () => {
    const { code, stdout } = await cli(['broken', '--from-odp', 'missing.odp'])
    expect(code).not.toBe(0)
    expect(stdout).toContain('ODP file not found: missing.odp')
    expect(existsSync(join(work, 'broken'))).toBe(false)
  })
})
