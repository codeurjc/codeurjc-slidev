import { describe, expect, it, vi } from 'vitest'
import { parseExternalHighlightAnchors, serializeMarkerOverride } from '../useCodeHighlights'

const CODE = [
  'public class GestorNotas {',
  '',
  '  private DBAlumno alumnos;',
  '',
  '  public GestorNotas(DBAlumno alumnos) {',
  '    this.alumnos = alumnos;',
  '  }',
  '',
  '  public float calculaNotaMedia(long idAlumno) {',
  '    List<Float> notas = alumnos.getNotasAlumno(idAlumno);',
  '    float suma = 0.0f;',
  '    for (float nota : notas) {',
  '      suma += nota;',
  '    }',
  '    return suma / notas.size();',
  '  }',
  '}',
].join('\n')

describe('parseExternalHighlightAnchors: line anchors', () => {
  it('highlights a single line by 1-based slice-relative position', () => {
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:5] Injects the DB dependency'])
    expect(highlights).toEqual([
      expect.objectContaining({ kind: 'line', startLine: 4, endLine: 4, comment: 'Injects the DB dependency' }),
    ])
  })

  it('highlights an inclusive line range', () => {
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:11..14] Sums the notes'])
    expect(highlights).toEqual([
      expect.objectContaining({ kind: 'range', startLine: 10, endLine: 13, comment: 'Sums the notes' }),
    ])
  })

  it('warns and skips an out-of-range line anchor', () => {
    const onWarn = vi.fn()
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:999] gone'], { onWarn })
    expect(highlights).toEqual([])
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('999'))
  })
})

describe('parseExternalHighlightAnchors: content anchors', () => {
  it('highlights exactly the matched text, not the whole line', () => {
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:"this.alumnos = alumnos"] Just the substring'])
    expect(highlights).toEqual([
      expect.objectContaining({
        kind: 'substring',
        startLine: 5,
        endLine: 5,
        substringRange: { start: 4, end: 26 },
        comment: 'Just the substring',
      }),
    ])
  })

  it('highlights exactly a call expression inside a longer line, not the whole line', () => {
    // Regression test: a plain content anchor used to default to
    // highlighting the entire matched line unless an explicit (start-end)
    // substring range was also given, which was surprising when the anchor
    // text itself was already a precise substring (e.g. just a method call)
    // rather than the whole line.
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:"getNotasAlumno(idAlumno)"] Fetches raw scores'])
    expect(highlights).toHaveLength(1)
    const [h] = highlights
    expect(h.kind).toBe('substring')
    expect(h.startLine).toBe(9)
    const line = CODE.split('\n')[9]
    expect(line.slice(h.substringRange!.start, h.substringRange!.end)).toBe('getNotasAlumno(idAlumno)')
  })

  it('an explicit substring range still overrides the default matched-text range', () => {
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:"this.alumnos = alumnos"(0-12)] narrower'])
    expect(highlights).toEqual([
      expect.objectContaining({ kind: 'substring', startLine: 5, endLine: 5, substringRange: { start: 0, end: 12 } }),
    ])
  })

  it('skips and warns when the anchor text is not found', () => {
    const onWarn = vi.fn()
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:"does not exist"] comment'], { onWarn })
    expect(highlights).toEqual([])
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('does not exist'))
  })

  it('uses the first match and warns when an anchor is ambiguous', () => {
    const onWarn = vi.fn()
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:"notas"] comment'], { onWarn })
    expect(highlights).toHaveLength(1)
    expect(highlights[0].startLine).toBe(9) // first line containing "notas"
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('matches'))
  })

  it('selects a specific occurrence with #N', () => {
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:"notas"#2] second'])
    expect(highlights).toHaveLength(1)
    expect(highlights[0].startLine).toBe(11) // second line containing "notas"
  })

  it('reports an authoring error when #N exceeds the match count', () => {
    const onError = vi.fn()
    parseExternalHighlightAnchors(CODE, ['[!mark:"notas"#50] comment'], { onError, onWarn: vi.fn() })
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('out of range'))
  })

  it('selects every occurrence with #*', () => {
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:"notas"#*] every one'])
    expect(highlights.length).toBeGreaterThan(1)
    expect(highlights.every(h => h.comment === 'every one')).toBe(true)
  })
})

describe('parseExternalHighlightAnchors: content range anchors', () => {
  it('highlights from the first anchor through the second, inclusive', () => {
    const highlights = parseExternalHighlightAnchors(CODE, [
      '[!mark:"float suma = 0.0f;".."return suma / notas.size();"] Sums up the notes',
    ])
    expect(highlights).toEqual([
      expect.objectContaining({ kind: 'range', startLine: 10, endLine: 14, comment: 'Sums up the notes' }),
    ])
  })

  it('highlights from the anchor through an N-line offset', () => {
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:"float suma = 0.0f;"+3] comment'])
    expect(highlights).toEqual([
      expect.objectContaining({ kind: 'range', startLine: 10, endLine: 13 }),
    ])
  })

  it('warns and skips when the range end anchor is not found', () => {
    const onWarn = vi.fn()
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:"float suma = 0.0f;".."nope"] comment'], { onWarn })
    expect(highlights).toEqual([])
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('nope'))
  })
})

describe('parseExternalHighlightAnchors: malformed declarations', () => {
  it('ignores a line that does not match the anchor grammar', () => {
    const highlights = parseExternalHighlightAnchors(CODE, ['not an anchor at all'])
    expect(highlights).toEqual([])
  })

  it('parses a manual position override', () => {
    const highlights = parseExternalHighlightAnchors(CODE, ['[!mark:"this.alumnos = alumnos"@120,45] comment'])
    expect(highlights[0].override).toEqual({ x: 120, y: 45 })
  })
})

describe('serializeMarkerOverride on anchor-declaration lines', () => {
  it('appends an override to an anchor line with none yet', () => {
    const line = '[!mark:"this.alumnos = alumnos"] comment'
    expect(serializeMarkerOverride(line, 10, 20)).toBe('[!mark:"this.alumnos = alumnos"@10,20] comment')
  })

  it('replaces an existing override on an anchor line', () => {
    const line = '[!mark:"text"@1,2] comment'
    expect(serializeMarkerOverride(line, 10, 20)).toBe('[!mark:"text"@10,20] comment')
  })

  it('does not get confused by a `]` inside the anchor text itself', () => {
    const line = '[!mark:"arr[0] = 1;"] comment'
    expect(serializeMarkerOverride(line, 5, 6)).toBe('[!mark:"arr[0] = 1;"@5,6] comment')
  })
})
