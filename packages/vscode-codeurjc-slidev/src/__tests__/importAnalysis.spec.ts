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

function fakeResolver(files: Record<string, string>, escapesCodeRoot = false): ResolveImport {
  return (importFilePath) => {
    const key = importFilePath.replace(/^@\//, '')
    if (!(key in files)) return null
    return { targetAbsPath: `/repo/${key}`, fileText: files[key], escapesCodeRoot }
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

  it('diagnoses an import that escapes the code root, but still analyzes it', () => {
    const text = '<<< @/../outside/Foo.java java'
    const { diagnostics, hovers } = analyzeImports(text, fakeResolver({ '../outside/Foo.java': FILE_TEXT }, true))
    expect(diagnostics).toEqual([
      { line: 0, message: 'Import resolves outside the code root: /repo/../outside/Foo.java', severity: 'warning' },
    ])
    expect(hovers).toHaveLength(1) // still resolved/hovered despite the escape
  })

  it('diagnoses a missing default branch when classifySourceLink reports no-branch (no directive at all, implicit auto)', () => {
    const text = '<<< @/code/Foo.java java'
    const { diagnostics } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }), () => 'no-branch')
    expect(diagnostics).toEqual([
      {
        line: 0,
        message: 'No git branch could be resolved for this import\'s source link -- set `codeSourceLinkBranch` in the deck frontmatter, or configure the repo\'s default branch (e.g. `git remote set-head origin -a`).',
        severity: 'warning',
      },
    ])
  })

  it('attaches the missing-default-branch diagnostic to an explicit [!source] directive line', () => {
    const text = ['<<< @/code/Foo.java java', '[!source]'].join('\n')
    const { diagnostics } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }), () => 'no-branch')
    expect(diagnostics.some(d => d.line === 1 && d.message.includes('No git branch'))).toBe(true)
  })

  it('does not diagnose a missing branch for an explicit [!source <url>] override', () => {
    const text = ['<<< @/code/Foo.java java', '[!source https://example.com/Foo.java]'].join('\n')
    const { diagnostics } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }), () => 'no-branch')
    expect(diagnostics.some(d => d.message.includes('No git branch'))).toBe(false)
  })

  it('does not diagnose a missing branch for [!source none]', () => {
    const text = ['<<< @/code/Foo.java java', '[!source none]'].join('\n')
    const { diagnostics } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }), () => 'no-branch')
    expect(diagnostics.some(d => d.message.includes('No git branch'))).toBe(false)
  })

  it('does not diagnose no-repo or no-remote (intentional/expected no-link states)', () => {
    const text = '<<< @/code/Foo.java java'
    for (const status of ['no-repo', 'no-remote'] as const) {
      const { diagnostics } = analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }), () => status)
      expect(diagnostics).toEqual([])
    }
  })

  it('passes a codeSourceLinkBranch frontmatter override to classifySourceLink', () => {
    const text = ['---', 'codeSourceLinkBranch: develop', '---', '<<< @/code/Foo.java java'].join('\n')
    let receivedBranch: string | null = null
    analyzeImports(text, fakeResolver({ 'code/Foo.java': FILE_TEXT }), (_path, branch) => {
      receivedBranch = branch
      return 'ok'
    })
    expect(receivedBranch).toBe('develop')
  })
})
