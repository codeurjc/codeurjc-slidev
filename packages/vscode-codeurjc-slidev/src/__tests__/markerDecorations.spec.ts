import { describe, it, expect } from 'vitest'
import { computeMarkerDecorations } from '../markerDecorations'

describe('computeMarkerDecorations', () => {
  it('decorates a whole-line marker at the right document line', () => {
    const text = [
      '# Slide',
      '',
      '```java',
      'public GestorNotas(DBAlumno alumnos) { // [!mark] Injects the dependency',
      '}',
      '```',
    ].join('\n')
    const { dims, highlights } = computeMarkerDecorations(text)
    expect(highlights).toEqual([
      { startLine: 3, endLine: 3, substringRange: undefined, comment: 'Injects the dependency' },
    ])
    expect(dims).toHaveLength(1)
    expect(dims[0].line).toBe(3)
    const line = text.split('\n')[3]
    expect(line.slice(dims[0].startChar, dims[0].endChar)).toBe('// [!mark] Injects the dependency')
  })

  it('decorates a multi-line range marker across document lines', () => {
    const text = [
      '```java',
      'a();',
      'b(); // [!mark:start] the range',
      'c();',
      'd(); // [!mark:end]',
      'e();',
      '```',
    ].join('\n')
    const { highlights } = computeMarkerDecorations(text)
    expect(highlights).toEqual([
      { startLine: 2, endLine: 4, substringRange: undefined, comment: 'the range' },
    ])
  })

  it('decorates a substring marker with its character range', () => {
    const text = [
      '```java',
      'foo(bar); // [!mark(0-3)] just foo',
      '```',
    ].join('\n')
    const { highlights } = computeMarkerDecorations(text)
    expect(highlights[0].substringRange).toEqual({ start: 0, end: 3 })
  })

  it('returns no decorations for a block with no markers', () => {
    const text = ['```java', 'int x = 1;', '```'].join('\n')
    expect(computeMarkerDecorations(text)).toEqual({ dims: [], highlights: [] })
  })

  it('handles multiple fences independently, offsetting by each fence position', () => {
    const text = [
      '```java',
      'x(); // [!mark] first',
      '```',
      '',
      '```java',
      'a();',
      'y(); // [!mark] second',
      '```',
    ].join('\n')
    const { highlights } = computeMarkerDecorations(text)
    expect(highlights.map(h => h.startLine)).toEqual([1, 6])
    expect(highlights.map(h => h.comment)).toEqual(['first', 'second'])
  })
})
