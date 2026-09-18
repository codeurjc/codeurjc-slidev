import type { GitRunner } from 'codeurjc-slidev-theme/composables/useSourceLink'
import type { OdpShape } from '../model'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildCodeIndex,
  codeLinesOf,
  commentToken,
  copyCodeFolder,
  detectRepoBase,
  importLineFor,
  indexFile,
  inferLanguage,
  matchCode,
  parseCodeRepoFlag,
  resolveCodeFolder,
  sourceUrl,
} from '../code'

const tmpDirs: string[] = []
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'odp-code-'))
  tmpDirs.push(dir)
  return dir
}
afterEach(() => {
  for (const d of tmpDirs.splice(0))
    rmSync(d, { recursive: true, force: true })
})

function codeShape(text: string): OdpShape {
  return {
    kind: 'shape',
    paragraphs: text.split('\n').map(line => ({ runs: [{ text: line, bold: false, italic: false, mono: true }], depth: 0, isListHeader: false })),
    images: [],
    hasBorder: false,
    hasFill: false,
    paddingTop: 0.125,
  }
}

describe('codeLinesOf and inferLanguage', () => {
  it('expands tabs, trims trailing spaces and blank edges', () => {
    expect(codeLinesOf(codeShape('\n<build>\n\t<plugins>  \n\n'))).toEqual(['<build>', '    <plugins>'])
  })

  it.each([
    [['public class MyTests {'], undefined, 'java'],
    [['name: Continuous integration example', 'on:', '  push:'], undefined, 'yaml'],
    [['<dependency>'], undefined, 'xml'],
    [['$ docker run hello-world'], undefined, 'shell'],
    [['describe( "distance converter", function () {'], undefined, 'javascript'],
    [['Complex(0,0) + Complex(1,1) == Complex(1,1)'], undefined, 'text'],
    [['anything'], 'basic-workflow.yml', 'yaml'],
    [['anything'], 'ListTest.java', 'java'],
  ])('infers %j (label %s) as %s', (lines, label, expected) => {
    expect(inferLanguage(lines, label)).toBe(expected)
  })

  it('knows which languages have a line comment', () => {
    expect([commentToken('java'), commentToken('yaml'), commentToken('xml'), commentToken('text')]).toEqual(['//', '#', undefined, undefined])
  })
})

describe('code folder', () => {
  it('prefers --code, else a same-name sibling folder', () => {
    const dir = tmp()
    const odp = join(dir, 'Tema 1.2 - Pruebas unitarias.odp')
    writeFileSync(odp, '')
    expect(resolveCodeFolder(odp)).toBeUndefined()
    mkdirSync(join(dir, 'Tema 1.2 - Pruebas unitarias'))
    expect(resolveCodeFolder(odp)).toBe(join(dir, 'Tema 1.2 - Pruebas unitarias'))
    mkdirSync(join(dir, 'other'))
    expect(resolveCodeFolder(odp, join(dir, 'other'))).toBe(join(dir, 'other'))
    expect(resolveCodeFolder(odp, join(dir, 'missing'))).toBeUndefined()
  })

  it('copies without build and tooling directories', () => {
    const src = tmp()
    mkdirSync(join(src, 'ejem1/src'), { recursive: true })
    mkdirSync(join(src, 'ejem1/target/classes'), { recursive: true })
    mkdirSync(join(src, '.git'))
    writeFileSync(join(src, 'ejem1/src/A.java'), 'class A {}')
    writeFileSync(join(src, 'ejem1/target/classes/A.class'), 'x')
    writeFileSync(join(src, '.git/HEAD'), 'x')
    const dest = join(tmp(), 'code')
    expect(copyCodeFolder(src, dest)).toBe(1)
    expect(existsSync(join(dest, 'ejem1/src/A.java'))).toBe(true)
    expect(readdirSync(join(dest, 'ejem1'))).toEqual(['src'])
    expect(buildCodeIndex(src).map(f => f.relPath)).toEqual(['ejem1/src/A.java'])
  })
})

describe('matchCode', () => {
  const FILE = [
    'package es.codeurjc.test.ejem;',
    '',
    'import static org.junit.jupiter.api.Assertions.assertEquals;',
    '',
    'public class Calculadora5Test {',
    '',
    '    @Test',
    '    public void testSuma() {',
    '        double res = calc.suma(1, 1);',
    '        assertEquals(2, res, 0);',
    '    }',
    '',
    '    @Test',
    '    public void testResta() {',
    '        double res = calc.resta(1, 1);',
    '        assertEquals(0, res, 0);',
    '    }',
    '}',
  ].join('\n')
  const index = [indexFile('ejem1/src/test/java/Calculadora5Test.java', FILE)]

  it('finds an exact contiguous match ignoring whitespace and blank lines', () => {
    const m = matchCode(['@Test', 'public void testSuma() {', 'double res = calc.suma(1,1);', 'assertEquals(2, res, 0);', '}'], index)
    expect(m).toMatchObject({ kind: 'exact', startLine: 7, endLine: 11, matched: 5, total: 5 })
  })

  it('treats elided code as a near match', () => {
    const m = matchCode(['public class Calculadora5Test {', '@Test', 'public void testSuma() { … }', '@Test', 'public void testResta() {', 'double res = calc.resta(1, 1);', 'assertEquals(0, res, 0);', '}', '...', '}'], index)
    expect(m.kind).toBe('near')
    expect(m.file?.relPath).toContain('Calculadora5Test')
  })

  it('treats drifted code as near and unrelated code as none', () => {
    expect(matchCode(['public class Calculadora5Test {', '@Test', 'public void testSuma() {', 'double res = calc.suma(2, 2);'], index).kind).toBe('near')
    expect(matchCode(['class Motor {', 'void arrancar() {', 'System.out.println("x");', '}'], index).kind).toBe('none')
  })

  it('breaks ties by project label, then by shortest path', () => {
    const same = 'public class GestorNotas {\n  int x;\n}'
    const idx = [indexFile('ejer8_enunciado/src/GestorNotas.java', same), indexFile('ejer8/src/GestorNotas.java', same), indexFile('a/ejer8/deeper/src/GestorNotas.java', same)]
    expect(matchCode(same.split('\n'), idx, 'ejer8').file?.relPath).toBe('ejer8/src/GestorNotas.java')
    expect(matchCode(same.split('\n'), idx).file?.relPath).toBe('ejer8/src/GestorNotas.java')
  })

  it('emits an import with a content-anchor selector, or none for a whole-file match', () => {
    const m = matchCode(['@Test', 'public void testResta() {', 'double res = calc.resta(1, 1);', 'assertEquals(0, res, 0);', '}'], index)
    // `@Test` isn't unique in the file, so the selector falls back to a line range
    expect(importLineFor(m, 'java')).toBe('<<< @/code/ejem1/src/test/java/Calculadora5Test.java[13-17] java')
    const unique = matchCode(['public void testSuma() {', 'double res = calc.suma(1, 1);', 'assertEquals(2, res, 0);'], index)
    expect(importLineFor(unique, 'java')).toBe('<<< @/code/ejem1/src/test/java/Calculadora5Test.java["public void testSuma() {".."assertEquals(2, res, 0);"] java')
    const whole = matchCode(FILE.split('\n'), index)
    expect(importLineFor(whole, 'java')).toBe('<<< @/code/ejem1/src/test/java/Calculadora5Test.java java')
  })

  it('prefixes the import path with the deck\'s code base when namespaced', () => {
    const whole = matchCode(FILE.split('\n'), index)
    expect(importLineFor(whole, 'java', 'code/tema1')).toBe('<<< @/code/tema1/ejem1/src/test/java/Calculadora5Test.java java')
  })
})

describe('source-link base URL', () => {
  const fakeGit = (answers: Record<string, string | null>): GitRunner => args => answers[args.join(' ')] ?? null

  it('parses --code-repo with branch and subpath', () => {
    expect(parseCodeRepoFlag('https://github.com/codigus-formacion/pruebas/tree/main/testing_unitario')).toEqual({ owner: 'codigus-formacion', repo: 'pruebas', branch: 'main', subpath: 'testing_unitario' })
  })

  it('resolves a missing branch from the remote', () => {
    const git = fakeGit({ 'ls-remote --symref https://github.com/o/r.git HEAD': 'ref: refs/heads/master\tHEAD' })
    expect(parseCodeRepoFlag('https://github.com/o/r', git)).toEqual({ owner: 'o', repo: 'r', branch: 'master', subpath: '' })
    expect(parseCodeRepoFlag('https://github.com/o/r', fakeGit({}))).toBeUndefined()
    expect(parseCodeRepoFlag('https://gitlab.com/o/r')).toBeUndefined()
  })

  it('detects the base from the code folder git checkout', () => {
    const repo = tmp()
    mkdirSync(join(repo, '.git'))
    mkdirSync(join(repo, 'testing_unitario'))
    const git = fakeGit({ 'remote get-url origin': 'git@github.com:codigus-formacion/pruebas.git', 'symbolic-ref refs/remotes/origin/HEAD': 'refs/remotes/origin/main' })
    expect(detectRepoBase(join(repo, 'testing_unitario'), git)).toEqual({ owner: 'codigus-formacion', repo: 'pruebas', branch: 'main', subpath: 'testing_unitario' })
    expect(detectRepoBase(tmp(), git)).toBeUndefined()
    const ignored = realpathSync(join(repo, 'testing_unitario'))
    expect(detectRepoBase(ignored, (args, cwd) => args[0] === 'check-ignore' ? ignored : git(args, cwd))).toBeUndefined()
  })

  it('builds blob URLs with an optional line fragment', () => {
    const base = { owner: 'codigus-formacion', repo: 'pruebas', branch: 'main', subpath: 'testing_unitario' }
    expect(sourceUrl(base, 'ejem1/src/SumTest.java', { startLine: 1, endLine: 16 })).toBe('https://github.com/codigus-formacion/pruebas/blob/main/testing_unitario/ejem1/src/SumTest.java#L1-L16')
    expect(sourceUrl({ ...base, subpath: '' }, 'a b/C.java')).toBe('https://github.com/codigus-formacion/pruebas/blob/main/a%20b/C.java')
  })
})
