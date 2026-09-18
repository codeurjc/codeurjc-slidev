import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildOdp, customShape, frame, item, list, p, page, textBox, xmlEscape } from './odpFixture'

// Runs the real CLI (`index.mjs` + the esbuild bundle) for the
// `multi-deck-projects` capability: several decks in one project, batch flags,
// and the per-deck overwrite/skip handling. stdin is closed, so any prompt
// resolves as declined.

const packageRoot = resolve(import.meta.dirname, '../../..')

const CODE = ['public class SumTest {', '    int sum = 1 + 1;', '}']

let work: string

/** One ODP: a titled body slide, and a code slide matching `<name>/ejem1/src/SumTest.java`. */
function writeDeck(dir: string, name: string) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.odp`), buildOdp({
    pages: [
      page(frame('title', { x: 1.3, y: 1.7, w: 20, h: 2.8 }, textBox(p(`Titulo ${name}`))) + frame('outline', { x: 1.27, y: 4.457, w: 22.859, h: 11.048 }, textBox(list(item(p('Un punto'))))), { name: 'page1' }),
      page(frame('title', { x: 1.3, y: 1.7, w: 20, h: 2.8 }, textBox(p(`Titulo ${name}`))) + customShape('ooxml-rect', { x: 2, y: 5, w: 20, h: 6 }, CODE.map(l => p(xmlEscape(l), 'Pmono')).join('')), { name: 'page2' }),
    ],
  }))
  // The same relative path in every deck's code folder: namespacing must keep them apart.
  mkdirSync(join(dir, name, 'ejem1/src'), { recursive: true })
  writeFileSync(join(dir, name, 'ejem1/src/SumTest.java'), CODE.join('\n'))
}

beforeAll(() => {
  execFileSync('node', ['build.mjs'], { cwd: packageRoot })
  work = mkdtempSync(join(tmpdir(), 'odp-multideck-'))
  writeDeck(join(work, 'odps'), 'Tema A')
  writeDeck(join(work, 'odps'), 'Tema B')
}, 120000)

afterAll(() => rmSync(work, { recursive: true, force: true }))

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

const read = (root: string, file: string) => readFileSync(join(root, file), 'utf-8')

describe('create-codeurjc-slidev multi-deck projects', () => {
  it('imports a whole directory of ODPs into one project, each deck namespaced', async () => {
    const { code, stdout } = await cli(['course', '--from-odp-dir', 'odps'])
    expect(code).toBe(0)
    const root = join(work, 'course')

    expect(existsSync(join(root, 'slides.md'))).toBe(false)
    expect(read(root, 'tema-a.md')).toContain('<<< @/code/tema-a/ejem1/src/SumTest.java java')
    expect(read(root, 'tema-b.md')).toContain('<<< @/code/tema-b/ejem1/src/SumTest.java java')
    expect(existsSync(join(root, 'code/tema-a/ejem1/src/SumTest.java'))).toBe(true)
    expect(existsSync(join(root, 'code/tema-b/ejem1/src/SumTest.java'))).toBe(true)
    expect(stdout).toContain('2 imported, 0 overwritten, 0 skipped')

    const pkg = JSON.parse(read(root, 'package.json'))
    expect(pkg.name).toBe('course')
    expect(pkg.dependencies).toHaveProperty('codeurjc-slidev-theme')
    expect(readdirSync(join(root, 'import-reports'))).toHaveLength(2)
    expect(read(root, `import-reports/${readdirSync(join(root, 'import-reports'))[0]}`)).toMatch(/\*\*Deck:\*\* `tema-[ab]\.md`/)
  })

  it('takes explicit --from-odp/--deck pairs, in one invocation', async () => {
    const { code, stdout } = await cli(['pairs', '--from-odp', 'odps/Tema A.odp', '--deck', 'one', '--from-odp', 'odps/Tema B.odp', '--deck', 'two'])
    expect(code).toBe(0)
    const root = join(work, 'pairs')
    expect(existsSync(join(root, 'one.md'))).toBe(true)
    expect(existsSync(join(root, 'two.md'))).toBe(true)
    expect(existsSync(join(root, 'code/one/ejem1/src/SumTest.java'))).toBe(true)
    expect(stdout).toContain('2 imported, 0 overwritten, 0 skipped')
  })

  it('adds an empty deck, and leaves no stray slides.md in a new project', async () => {
    const { code } = await cli(['empties', '--deck', 'tema1'])
    expect(code).toBe(0)
    const root = join(work, 'empties')
    expect(read(root, 'tema1.md')).toContain('theme: codeurjc-slidev-theme')
    expect(existsSync(join(root, 'slides.md'))).toBe(false)
  })

  describe('against an existing project', () => {
    const root = () => join(work, 'existing')

    beforeAll(async () => {
      const { code } = await cli(['existing', '--from-odp', 'odps/Tema A.odp', '--deck', 'tema-a'])
      expect(code).toBe(0)
      // Hand-placed shared material at the root of code/ and public/images/.
      mkdirSync(join(root(), 'code/shared'), { recursive: true })
      writeFileSync(join(root(), 'code/shared/Utils.java'), 'class Utils {}')
      mkdirSync(join(root(), 'public/images'), { recursive: true })
      writeFileSync(join(root(), 'public/images/logo.png'), 'png')
    })

    it('adds a deck without touching the others, shared files, or reports', async () => {
      const before = read(root(), 'tema-a.md')
      const { code, stdout } = await cli(['existing', '--from-odp', 'odps/Tema B.odp', '--deck', 'tema-b'])
      expect(code).toBe(0)
      expect(stdout).not.toContain('is not empty')
      expect(read(root(), 'tema-a.md')).toBe(before)
      expect(existsSync(join(root(), 'tema-b.md'))).toBe(true)
      expect(existsSync(join(root(), 'code/tema-b/ejem1/src/SumTest.java'))).toBe(true)
      expect(read(root(), 'code/shared/Utils.java')).toBe('class Utils {}')
      expect(read(root(), 'public/images/logo.png')).toBe('png')
      expect(readdirSync(join(root(), 'import-reports'))).toHaveLength(2)
      // Nothing to install into an already-installed project: no install prompt.
      expect(stdout).not.toContain('Install and start it now')
    })

    it('skips an existing deck whose overwrite is declined, and still adds the new ones', async () => {
      writeFileSync(join(root(), 'tema-a.md'), 'EDITED BY HAND')
      const { code, stdout } = await cli(['existing', '--from-odp-dir', 'odps'])
      expect(code).toBe(0)
      expect(read(root(), 'tema-a.md')).toBe('EDITED BY HAND')
      expect(stdout).toContain('0 imported, 0 overwritten, 2 skipped')
    })

    it('--skip-existing skips existing decks without asking', async () => {
      const { code, stdout } = await cli(['existing', '--from-odp-dir', 'odps', '--skip-existing'])
      expect(code).toBe(0)
      expect(read(root(), 'tema-a.md')).toBe('EDITED BY HAND')
      expect(stdout).toContain('0 imported, 0 overwritten, 2 skipped')
    })

    it('--yes overwrites only the existing decks it was asked to place, keeping shared files and reports', async () => {
      const { code, stdout } = await cli(['existing', '--from-odp-dir', 'odps', '--yes'])
      expect(code).toBe(0)
      expect(read(root(), 'tema-a.md')).toContain('<<< @/code/tema-a/ejem1/src/SumTest.java java')
      expect(stdout).toContain('0 imported, 2 overwritten, 0 skipped')
      expect(read(root(), 'code/shared/Utils.java')).toBe('class Utils {}')
      expect(read(root(), 'public/images/logo.png')).toBe('png')
      expect(readdirSync(join(root(), 'import-reports')).length).toBeGreaterThanOrEqual(4)
    })

    it('--force is an alias of --yes', async () => {
      writeFileSync(join(root(), 'tema-b.md'), 'EDITED BY HAND')
      const { code, stdout } = await cli(['existing', '--from-odp-dir', 'odps', '--force'])
      expect(code).toBe(0)
      expect(read(root(), 'tema-b.md')).toContain('<<< @/code/tema-b/')
      expect(stdout).toContain('0 imported, 2 overwritten, 0 skipped')
    })

    it('a bare --from-odp adds its deck as slides, namespaced because the project already exists', async () => {
      const { code } = await cli(['existing', '--from-odp', 'odps/Tema A.odp'])
      expect(code).toBe(0)
      expect(read(root(), 'slides.md')).toContain('<<< @/code/slides/ejem1/src/SumTest.java java')
      expect(existsSync(join(root(), 'code/slides/ejem1/src/SumTest.java'))).toBe(true)
    })
  })

  it('rejects --yes together with --skip-existing before creating anything', async () => {
    const { code, stdout } = await cli(['conflicting', '--from-odp-dir', 'odps', '--yes', '--skip-existing'])
    expect(code).not.toBe(0)
    expect(stdout).toContain('cannot be used together')
    expect(existsSync(join(work, 'conflicting'))).toBe(false)
  })

  it('rejects a slug used twice in one batch before writing anything', async () => {
    const { code, stdout } = await cli(['dupes', '--from-odp', 'odps/Tema A.odp', '--deck', 'same', '--from-odp', 'odps/Tema B.odp', '--deck', 'same'])
    expect(code).not.toBe(0)
    expect(stdout).toContain('Duplicate deck slug "same"')
    expect(existsSync(join(work, 'dupes'))).toBe(false)
  })

  it('rejects mismatched --from-odp and --deck counts', async () => {
    const { code, stdout } = await cli(['mismatch', '--from-odp', 'odps/Tema A.odp', '--from-odp', 'odps/Tema B.odp', '--deck', 'only-one'])
    expect(code).not.toBe(0)
    expect(stdout).toContain('different number of times')
    expect(existsSync(join(work, 'mismatch'))).toBe(false)
  })

  it('requires a target directory for a batch', async () => {
    const { code, stdout } = await cli(['--from-odp-dir', 'odps'])
    expect(code).not.toBe(0)
    expect(stdout).toContain('A target directory is required')
  })

  it('still asks before wiping an unrelated non-empty directory, and leaves it when declined', async () => {
    const root = join(work, 'unrelated')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'notes.txt'), 'keep me')
    const { code, stdout } = await cli(['unrelated', '--from-odp', 'odps/Tema A.odp'])
    expect(code).toBe(0)
    expect(stdout).toContain('is not empty')
    expect(read(root, 'notes.txt')).toBe('keep me')
    expect(existsSync(join(root, 'slides.md'))).toBe(false)
  })
})
