import { describe, expect, it } from 'vitest'
import { computeCodeLensesForDocument } from '../codeLens'
import { buildReferenceIndex } from '../indexBuilder'

const resolvePath = (_mdPath: string, importFilePath: string) => `/repo/${importFilePath.replace(/^@\//, '')}`

const TARGET_TEXT = [
  'public class GestorNotas {',
  '  public GestorNotas(DBAlumno alumnos) {',
  '    this.alumnos = alumnos;',
  '  }',
  '}',
].join('\n')

describe('computeCodeLensesForDocument', () => {
  it('produces one lens entry for a single reference', () => {
    const slideText = ['---', 'theme: codeurjc-slidev-theme', '---', '', '<<< @/code/Foo.java java', '[!mark:"GestorNotas(DBAlumno"] Injects the dependency'].join('\n')
    const index = buildReferenceIndex({ 'slides.md': slideText }, resolvePath)

    const lenses = computeCodeLensesForDocument(index, '/repo/code/Foo.java', TARGET_TEXT, () => slideText)

    expect(lenses).toHaveLength(1)
    expect(lenses[0].line).toBe(1) // 0-based doc line of "public GestorNotas(DBAlumno alumnos) {"
    expect(lenses[0].title).toBe('📽 1 reference — Slide 1')
    expect(lenses[0].references[0].comment).toBe('Injects the dependency')
  })

  it('groups multiple slides referencing the same target line into one lens', () => {
    const slideTexts: Record<string, string> = {
      'a.md': ['---', 'theme: codeurjc-slidev-theme', '---', '', '<<< @/code/Foo.java java', '[!mark:"this.alumnos = alumnos"] from A'].join('\n'),
      'b.md': ['---', 'theme: codeurjc-slidev-theme', '---', '', '', '<<< @/code/Foo.java java', '[!mark:"this.alumnos = alumnos"] from B'].join('\n'),
    }
    const index = buildReferenceIndex(slideTexts, resolvePath)

    const lenses = computeCodeLensesForDocument(index, '/repo/code/Foo.java', TARGET_TEXT, f => slideTexts[f] ?? null)

    expect(lenses).toHaveLength(1)
    expect(lenses[0].references).toHaveLength(2)
    expect(lenses[0].title).toContain('2 references')
  })

  it('returns no lenses for a target with no index entries', () => {
    const index = buildReferenceIndex({}, resolvePath)
    expect(computeCodeLensesForDocument(index, '/repo/code/Unreferenced.java', TARGET_TEXT, () => null)).toEqual([])
  })

  it('re-resolves against live target text rather than any cached position', () => {
    const slideText = ['---', 'theme: codeurjc-slidev-theme', '---', '', '<<< @/code/Foo.java java', '[!mark:"this.alumnos = alumnos"] comment'].join('\n')
    const index = buildReferenceIndex({ 'slides.md': slideText }, resolvePath)

    const shiftedTargetText = ['// a new leading comment line', ...TARGET_TEXT.split('\n')].join('\n')
    const lenses = computeCodeLensesForDocument(index, '/repo/code/Foo.java', shiftedTargetText, () => slideText)

    expect(lenses[0].line).toBe(3) // shifted down by the inserted leading line
  })

  describe('click step labels', () => {
    const slideText = [
      '---',
      'theme: codeurjc-slidev-theme',
      '---',
      '',
      '# One',
      '',
      '---',
      '',
      '<<< @/code/Foo.java java',
      '[!mark:"this.alumnos = alumnos"{3}] stepped',
      '[!mark:"GestorNotas(DBAlumno"{5}] later',
      '',
      '---',
      'layout: default',
      '---',
      '',
      '<<< @/code/Foo.java java',
      '[!mark:"this.alumnos = alumnos"] plain',
    ].join('\n')
    const index = buildReferenceIndex({ 'slides.md': slideText }, resolvePath)
    const lensAt = (line: number, options = {}) => computeCodeLensesForDocument(index, '/repo/code/Foo.java', TARGET_TEXT, () => slideText, options).find(l => l.line === line)!

    it('adds the step and slide total to a stepped reference, and keeps a plain one plain', () => {
      expect(lensAt(2).title).toBe('📽 2 references — Slide 2 ▸3 of 5, Slide 3')
      expect(lensAt(2).references[0]).toMatchObject({ click: 3, total: 5 })
    })

    it('leaves the total out when the setting is off', () => {
      expect(lensAt(2, { showTotal: false }).title).toBe('📽 2 references — Slide 2 ▸3, Slide 3')
    })

    it('uses the resolver to count the slide like the theme does (an anchor matching nothing adds no click)', () => {
      const lens = lensAt(2, { resolveImportText: () => TARGET_TEXT.replace('GestorNotas(DBAlumno', 'Other(') })
      expect(lens.title).toBe('📽 2 references — Slide 2 ▸3 of 3, Slide 3')
    })
  })
})
