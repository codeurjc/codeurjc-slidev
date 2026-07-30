import { describe, it, expect } from 'vitest'
import { analyzeImports, type ResolveImport } from '../importAnalysis'

const FILE_TEXT = [
  'public class GestorNotas {',
  '  public GestorNotas(DBAlumno alumnos) {',
  '    this.alumnos = alumnos;',
  '  }',
  '  public float getNotasAlumno(int idAlumno) {',
  '    return 1.0f;',
  '  }',
  '}',
].join('\n')

function fakeResolver(files: Record<string, string>): ResolveImport {
  return (importFilePath) => {
    const key = importFilePath.replace(/^@\//, '')
    if (!(key in files)) return null
    return { targetAbsPath: `/repo/${key}`, fileText: files[key] }
  }
}

describe('analyzeImports', () => {
  it('produces a hover for the import line itself with resolved bounds', () => {
    const text = '<<< @/code/Foo.java[1-3] java'
    const { hovers } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }))
    expect(hovers[0]).toEqual({ line: 0, contents: '**/repo/code/Foo.java** (lines 1-3)' })
  })

  it('diagnoses an unresolved import file', () => {
    const text = '<<< @/code/Missing.java java'
    const { diagnostics } = analyzeImports(text, fakeResolver({}))
    expect(diagnostics).toEqual([
      { line: 0, message: 'Could not resolve imported file: @/code/Missing.java', severity: 'warning' },
    ])
  })

  it('produces a hover for a resolved content anchor at the right absolute line', () => {
    const text = [
      '<<< @/code/Foo.java java',
      '[!mark:"getNotasAlumno"] Fetches grades',
    ].join('\n')
    const { hovers } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }))
    const anchorHover = hovers.find(h => h.line === 1)
    expect(anchorHover?.contents).toBe('Line 5: Fetches grades')
  })

  it('diagnoses an anchor whose text is not found', () => {
    const text = [
      '<<< @/code/Foo.java java',
      '[!mark:"nonexistent"] comment',
    ].join('\n')
    const { diagnostics } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }))
    expect(diagnostics).toEqual([
      { line: 1, message: '[code-highlight] anchor text not found: "nonexistent"', severity: 'warning' },
    ])
  })

  it('diagnoses an ambiguous anchor without an occurrence selector', () => {
    const text = [
      '<<< @/code/Foo.java java',
      '[!mark:"public"] which one?',
    ].join('\n')
    const { diagnostics } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }))
    expect(diagnostics.some(d => d.severity === 'warning' && d.message.includes('matches'))).toBe(true)
  })

  it('diagnoses an out-of-range explicit occurrence as an error', () => {
    const text = [
      '<<< @/code/Foo.java java',
      '[!mark:"public"#5] comment',
    ].join('\n')
    const { diagnostics } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }))
    expect(diagnostics.some(d => d.severity === 'error')).toBe(true)
  })

  it('produces a hover for a [!source] directive line', () => {
    const text = [
      '<<< @/code/Foo.java java',
      '[!source https://example.com/Foo.java]',
    ].join('\n')
    const { hovers } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }))
    const sourceHover = hovers.find(h => h.line === 1)
    expect(sourceHover?.contents).toBe('Source link: https://example.com/Foo.java')
  })

  it('produces a hover noting suppression for [!source none]', () => {
    const text = ['<<< @/code/Foo.java java', '[!source none]'].join('\n')
    const { hovers } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }))
    expect(hovers.find(h => h.line === 1)?.contents).toBe('Source link suppressed for this block')
  })

  it('diagnoses an out-of-bounds line-range selector', () => {
    const text = '<<< @/code/Foo.java[100-200] java'
    const { diagnostics } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }))
    expect(diagnostics.some(d => d.line === 0 && d.severity === 'warning')).toBe(true)
  })
})
