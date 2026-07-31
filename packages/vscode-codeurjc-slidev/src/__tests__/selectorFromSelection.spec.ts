import { describe, expect, it } from 'vitest'
import { computeSelectorForSelection } from '../selectorFromSelection'

describe('computeSelectorForSelection', () => {
  it('always uses a line range for a single-line selection', () => {
    const lines = ['public class Foo {', 'public class Foo {', '}']
    expect(computeSelectorForSelection(lines, { startLine: 1, endLine: 1 })).toBe('1-1')
  })

  it('prefers a content-anchor range when both boundary lines are unique', () => {
    const lines = [
      'public class GestorNotas {',
      '  public GestorNotas(DBAlumno alumnos) {',
      '    this.alumnos = alumnos;',
      '  }',
      '}',
    ]
    expect(computeSelectorForSelection(lines, { startLine: 2, endLine: 3 })).toBe(
      '"public GestorNotas(DBAlumno alumnos) {".."this.alumnos = alumnos;"',
    )
  })

  it('falls back to a line range when the first boundary line is not unique', () => {
    const lines = ['dup', 'dup', 'middle', 'onlyEnd']
    expect(computeSelectorForSelection(lines, { startLine: 1, endLine: 4 })).toBe('1-4')
  })

  it('falls back to a line range when the last boundary line is not unique', () => {
    const lines = ['onlyStart', 'middle', 'dup', 'dup']
    expect(computeSelectorForSelection(lines, { startLine: 1, endLine: 4 })).toBe('1-4')
  })

  it('falls back to a line range when a boundary line is blank', () => {
    const lines = ['  public GestorNotas(DBAlumno alumnos) {', '', '  }']
    expect(computeSelectorForSelection(lines, { startLine: 1, endLine: 2 })).toBe('1-2')
  })

  it('escapes embedded double-quotes in the anchor text', () => {
    // Actual line text: System.out.println("start");
    const lines = ['System.out.println("start");', 'x();', 'return suma;']
    expect(computeSelectorForSelection(lines, { startLine: 1, endLine: 3 })).toBe(
      '"System.out.println(\\"start\\");".."return suma;"',
    )
  })

  it('escapes an embedded backslash in the anchor text', () => {
    // Actual line text: Pattern p = Pattern.compile("a\\b");
    const lines = ['Pattern p = Pattern.compile("a\\\\b");', 'x();', 'return suma;']
    expect(computeSelectorForSelection(lines, { startLine: 1, endLine: 3 })).toBe(
      '"Pattern p = Pattern.compile(\\"a\\\\\\\\b\\");".."return suma;"',
    )
  })
})
