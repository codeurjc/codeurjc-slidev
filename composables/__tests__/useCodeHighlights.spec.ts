import { describe, it, expect } from 'vitest'
import { parseCodeHighlights, injectHighlightSpans, serializeMarkerOverride } from '../useCodeHighlights'

describe('parseCodeHighlights', () => {
  it('parses a single-line marker with a comment and strips it from the code', () => {
    const code = [
      'public class Foo {',
      '  int x = 1; // [!mark] Sets the initial value',
      '}',
    ].join('\n')
    const { code: stripped, highlights } = parseCodeHighlights(code)
    expect(stripped).toBe([
      'public class Foo {',
      '  int x = 1;',
      '}',
    ].join('\n'))
    expect(highlights).toEqual([
      expect.objectContaining({ kind: 'line', startLine: 1, endLine: 1, comment: 'Sets the initial value' }),
    ])
  })

  it('parses a multi-line range via start/end markers', () => {
    const code = [
      'a(); // [!mark:start] Loops over notes',
      'b();',
      'c(); // [!mark:end]',
    ].join('\n')
    const { highlights } = parseCodeHighlights(code)
    expect(highlights).toEqual([
      expect.objectContaining({ kind: 'range', startLine: 0, endLine: 2, comment: 'Loops over notes' }),
    ])
  })

  it('pairs nested start/end markers like matching brackets', () => {
    const code = [
      'a(); // [!mark:start] outer',
      'b(); // [!mark:start] inner',
      'c(); // [!mark:end]',
      'd(); // [!mark:end]',
    ].join('\n')
    const { highlights } = parseCodeHighlights(code)
    expect(highlights).toEqual([
      expect.objectContaining({ kind: 'range', startLine: 0, endLine: 3, comment: 'outer' }),
      expect.objectContaining({ kind: 'range', startLine: 1, endLine: 2, comment: 'inner' }),
    ])
  })

  it('parses a sub-line substring marker using character indexes', () => {
    const code = 'alumnos.getNotasAlumno(idAlumno); // [!mark(8-32)] Fetches raw scores'
    const { highlights } = parseCodeHighlights(code)
    expect(highlights).toEqual([
      expect.objectContaining({ kind: 'substring', substringRange: { start: 8, end: 32 }, comment: 'Fetches raw scores' }),
    ])
  })

  it('assigns each highlight a distinct auto-generated id', () => {
    const code = [
      'a(); // [!mark] first',
      'b(); // [!mark] second',
    ].join('\n')
    const { highlights } = parseCodeHighlights(code)
    expect(highlights).toHaveLength(2)
    expect(highlights[0].id).not.toBe(highlights[1].id)
  })

  it('ignores a dangling end marker with no matching start', () => {
    const code = 'a(); // [!mark:end]'
    const { highlights } = parseCodeHighlights(code)
    expect(highlights).toEqual([])
  })

  it('leaves non-marker lines untouched', () => {
    const code = 'plain line\nanother // regular comment'
    const { code: stripped, highlights } = parseCodeHighlights(code)
    expect(stripped).toBe(code)
    expect(highlights).toEqual([])
  })

  it('parses a manual position override suffix', () => {
    const code = 'a(); // [!mark@120,45] moved'
    const { highlights } = parseCodeHighlights(code)
    expect(highlights[0].override).toEqual({ x: 120, y: 45 })
  })
})

describe('serializeMarkerOverride', () => {
  it('appends an override to a marker with none yet', () => {
    const line = 'a(); // [!mark] comment'
    expect(serializeMarkerOverride(line, 10, 20)).toBe('a(); // [!mark@10,20] comment')
  })

  it('replaces an existing override', () => {
    const line = 'a(); // [!mark@1,2] comment'
    expect(serializeMarkerOverride(line, 10, 20)).toBe('a(); // [!mark@10,20] comment')
  })

  it('preserves range/substring markers when adding an override', () => {
    const line = 'a(); // [!mark:start] comment'
    expect(serializeMarkerOverride(line, 5, 6)).toBe('a(); // [!mark:start@5,6] comment')
  })

  it('preserves a substring range when adding an override', () => {
    const line = 'a(); // [!mark(1-3)] comment'
    expect(serializeMarkerOverride(line, 5, 6)).toBe('a(); // [!mark(1-3)@5,6] comment')
  })

  it('returns the line unchanged if it has no marker', () => {
    const line = 'plain code'
    expect(serializeMarkerOverride(line, 5, 6)).toBe(line)
  })
})

describe('injectHighlightSpans', () => {
  // Real Shiki output always puts attributes on <code> (e.g. the language
  // class) -- a bare `<code>` here previously hid a regex bug that only
  // matched an attribute-less tag.
  const shikiHtml = (lines: string[]) =>
    `<pre class="shiki"><code class="language-java">${lines.map(l => `<span class="line">${l}</span>`).join('\n')}</code></pre>`

  it('wraps a whole highlighted line in a data-highlight-id span', () => {
    const html = shikiHtml(['<span style="color:red">int</span> x = 1;'])
    const { highlights } = parseCodeHighlights('int x = 1; // [!mark] note')
    const out = injectHighlightSpans(html, highlights)
    expect(out).toContain(`data-highlight-id="${highlights[0].id}"`)
    expect(out).toContain('data-comment="note"')
    expect(out).toContain('<span style="color:red">int</span> x = 1;</span>')
  })

  it('wraps only the matched substring, not the whole line', () => {
    const html = shikiHtml(['<span style="color:blue">foo</span>(<span style="color:green">bar</span>)'])
    const { highlights } = parseCodeHighlights('foo(bar) // [!mark(4-7)] the arg')
    const out = injectHighlightSpans(html, highlights)
    expect(out).toContain(`data-highlight-id="${highlights[0].id}"`)
    // the wrapped fragment's text content is exactly "bar", not "foo(bar)"
    const wrapStart = out.indexOf('<span class="code-hl-mark"')
    const wrapOpenEnd = out.indexOf('>', wrapStart) + 1
    const closeIdx = out.indexOf('</span></span>', wrapOpenEnd)
    const wrapped = out.slice(wrapOpenEnd, closeIdx)
    expect(wrapped.replace(/<[^>]+>/g, '')).toBe('bar')
    expect(wrapped).not.toContain('foo')
  })

  it('wraps a substring that spans multiple sibling syntax-highlight spans without truncating', () => {
    // Regression test: a naive single open/close tag pair inserted at the
    // overall start/end offsets produces invalid overlapping markup when the
    // substring crosses more than one Shiki token span -- the browser then
    // "fixes" it by closing the highlight early, silently dropping
    // everything after the first token.
    const html = shikiHtml([
      '<span style="color:a">List</span>&lt;<span style="color:c">Float</span>&gt; notas = alumnos.<span style="color:d">getNotasAlumno</span>(<span style="color:e">idAlumno</span>);',
    ])
    const code = 'List<Float> notas = alumnos.getNotasAlumno(idAlumno);'
    const start = code.indexOf('getNotasAlumno(idAlumno)')
    const end = start + 'getNotasAlumno(idAlumno)'.length
    const highlight = { id: '0', kind: 'substring' as const, startLine: 0, endLine: 0, substringRange: { start, end }, comment: 'note', sourceLine: 'x' }
    const out = injectHighlightSpans(html, [highlight])
    // every mark fragment concatenated together (in document order) should
    // reconstruct the full matched text, not just its first token
    const marked = Array.from(out.matchAll(/<span class="code-hl-mark[^"]*"[^>]*>([^<]*)<\/span>/g)).map(m => m[1]).join('')
    expect(marked).toBe('getNotasAlumno(idAlumno)')
  })

  it('marks the first/last segment of a multi-token substring so CSS can visually merge them', () => {
    // Regression test: without these modifier classes each token's own
    // bordered/rounded box renders as a visually separate box, making a
    // single highlight look like it "breaks" at every token boundary.
    const html = shikiHtml([
      '<span style="color:d">getNotasAlumno</span>(<span style="color:e">idAlumno</span>)',
    ])
    const highlight = { id: '0', kind: 'substring' as const, startLine: 0, endLine: 0, substringRange: { start: 0, end: 24 }, comment: 'note', sourceLine: 'x' }
    const out = injectHighlightSpans(html, [highlight])
    const classes = Array.from(out.matchAll(/<span class="(code-hl-mark[^"]*)"/g)).map(m => m[1])
    expect(classes.length).toBeGreaterThan(1)
    expect(classes[0]).toContain('code-hl-mark-start')
    expect(classes[classes.length - 1]).toContain('code-hl-mark-end')
    expect(classes.slice(1, -1).every(c => c.includes('code-hl-mark-mid'))).toBe(true)
  })

  it('wraps every line within a multi-line range with the same id', () => {
    const html = shikiHtml(['line0', 'line1', 'line2'])
    const { highlights } = parseCodeHighlights([
      'line0 // [!mark:start] note',
      'line1',
      'line2 // [!mark:end]',
    ].join('\n'))
    const out = injectHighlightSpans(html, highlights)
    expect(out.match(new RegExp(`data-highlight-id="${highlights[0].id}"`, 'g'))).toHaveLength(3)
  })

  it('returns html unchanged when there are no highlights', () => {
    const html = shikiHtml(['plain'])
    expect(injectHighlightSpans(html, [])).toBe(html)
  })
})
