import { describe, expect, it } from 'vitest'
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
    expect(computeMarkerDecorations(text)).toEqual({ dims: [], highlights: [], badges: [] })
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

describe('computeMarkerDecorations with several markers on one line', () => {
  const text = [
    '```yaml',
    'name: CI # [!mark:start] WORKFLOW',
    'jobs:',
    '  test: # [!mark:start] JOB',
    '    steps: # [!mark(4-10)] Los pasos [!mark:end] [!mark:end]',
    '```',
  ].join('\n')

  it('dims the whole marker region as one span', () => {
    const { dims } = computeMarkerDecorations(text)
    const onSharedLine = dims.filter(d => d.line === 4)
    expect(onSharedLine).toHaveLength(1)
    const line = text.split('\n')[4]
    expect(line.slice(onSharedLine[0].startChar, onSharedLine[0].endChar)).toBe('# [!mark(4-10)] Los pasos [!mark:end] [!mark:end]')
  })

  it('reports every highlight the line contributes to', () => {
    const { highlights } = computeMarkerDecorations(text)
    expect(highlights).toEqual([
      { startLine: 1, endLine: 4, substringRange: undefined, comment: 'WORKFLOW' },
      { startLine: 3, endLine: 4, substringRange: undefined, comment: 'JOB' },
      { startLine: 4, endLine: 4, substringRange: { start: 4, end: 10 }, comment: 'Los pasos' },
    ])
  })
})

describe('computeMarkerDecorations with click-step suffixes', () => {
  it('dims and highlights a marker carrying a {N} step like any other marker', () => {
    const text = [
      '```java',
      'int x = 1; // [!mark{2}@120,40] Stepped note',
      '```',
    ].join('\n')
    const { dims, highlights } = computeMarkerDecorations(text)
    expect(highlights).toEqual([
      { startLine: 1, endLine: 1, substringRange: undefined, comment: 'Stepped note', click: 2 },
    ])
    const line = text.split('\n')[1]
    expect(line.slice(dims[0].startChar, dims[0].endChar)).toBe('// [!mark{2}@120,40] Stepped note')
  })

  it('places highlights after an inline source marker line on their own lines', () => {
    const text = [
      '```java',
      '// [!source https://github.com/o/r]',
      'int x = 1; // [!mark] note',
      '```',
    ].join('\n')
    expect(computeMarkerDecorations(text).highlights[0].startLine).toBe(2)
  })
})

describe('computeMarkerDecorations: step badges', () => {
  const HEAD = ['---', 'theme: codeurjc-slidev-theme', '---', '']

  function badges(lines: string[]) {
    const text = [...HEAD, ...lines].join('\n')
    const all = text.split('\n')
    return computeMarkerDecorations(text).badges.map(b => ({ text: all[b.line], steps: b.steps, total: b.total }))
  }

  it('badges a stepped marker with the slide total', () => {
    expect(badges(['```java', 'a(); // [!mark{2}] two', 'b(); // [!mark{1}] one', 'c(); // [!mark] always', '```'])).toEqual([
      { text: 'a(); // [!mark{2}] two', steps: [2], total: 2 },
      { text: 'b(); // [!mark{1}] one', steps: [1], total: 2 },
    ])
  })

  it('badges a range on its start line only', () => {
    expect(badges(['```java', 'a(); // [!mark:start{3}] r', 'b();', 'c(); // [!mark:end]', '```'])).toEqual([
      { text: 'a(); // [!mark:start{3}] r', steps: [3], total: 3 },
    ])
  })

  it('merges several steps on one line', () => {
    expect(badges(['```python', 'x = run(a) # [!mark(4-10){3}] a [!mark{1}] b [!mark{3}] c', '```'])).toEqual([
      { text: 'x = run(a) # [!mark(4-10){3}] a [!mark{1}] b [!mark{3}] c', steps: [1, 3], total: 3 },
    ])
  })

  it('badges native fence range segments after the first', () => {
    expect(badges(['```ts {2|4-5|all}', 'l1', 'l2', 'l3', 'l4', 'l5', '```'])).toEqual([
      { text: '```ts {2|4-5|all}', steps: [2], total: 2 },
      { text: 'l4', steps: [1], total: 2 },
    ])
  })

  it('badges an anchor line', () => {
    expect(badges(['<<< @/code/Foo.java java', '[!mark:"float suma"{3}] Sums up'])).toEqual([
      { text: '[!mark:"float suma"{3}] Sums up', steps: [3], total: 3 },
    ])
  })

  it('keeps exact badges but no total on an uncountable slide, and drops later relative ones', () => {
    expect(badges(['<MyStepper />', '', '```java {1|2}', 'a(); // [!mark{2}] two', 'b();', '```'])).toEqual([
      { text: 'a(); // [!mark{2}] two', steps: [2], total: null },
    ])
  })
})
