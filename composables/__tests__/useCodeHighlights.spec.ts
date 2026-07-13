import { describe, it, expect } from 'vitest'
import { parseCodeHighlights, injectHighlightSpans, serializeMarkerOverride } from '../useCodeHighlights'

describe('parseCodeHighlights', () => {
  it('parses a single-line marker with a comment and strips it from the code', () => {
    const code = [
      'public class Foo {',
      '  int x = 1; // [!mark:x-init] Sets the initial value',
      '}',
    ].join('\n')
    const { code: stripped, highlights } = parseCodeHighlights(code)
    expect(stripped).toBe([
      'public class Foo {',
      '  int x = 1;',
      '}',
    ].join('\n'))
    expect(highlights).toEqual([
      expect.objectContaining({ id: 'x-init', kind: 'line', startLine: 1, endLine: 1, comment: 'Sets the initial value' }),
    ])
  })

  it('parses a multi-line range via start/end markers sharing an id', () => {
    const code = [
      'a(); // [!mark:loop:start] Loops over notes',
      'b();',
      'c(); // [!mark:loop:end]',
    ].join('\n')
    const { highlights } = parseCodeHighlights(code)
    expect(highlights).toEqual([
      expect.objectContaining({ id: 'loop', kind: 'range', startLine: 0, endLine: 2, comment: 'Loops over notes' }),
    ])
  })

  it('parses a sub-line substring marker', () => {
    const code = 'alumnos.getNotasAlumno(idAlumno); // [!mark:fetch(getNotasAlumno(idAlumno))] Fetches raw scores'
    const { highlights } = parseCodeHighlights(code)
    expect(highlights).toEqual([
      expect.objectContaining({ id: 'fetch', kind: 'substring', substring: 'getNotasAlumno(idAlumno)', comment: 'Fetches raw scores' }),
    ])
  })

  it('keeps the first occurrence when a non-range id is duplicated', () => {
    const code = [
      'a(); // [!mark:dup] first',
      'b(); // [!mark:dup] second',
    ].join('\n')
    const { highlights } = parseCodeHighlights(code)
    expect(highlights).toHaveLength(1)
    expect(highlights[0]).toEqual(expect.objectContaining({ startLine: 0, comment: 'first' }))
  })

  it('ignores a dangling end marker with no matching start', () => {
    const code = 'a(); // [!mark:orphan:end]'
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
    const code = 'a(); // [!mark:pos@120,45] moved'
    const { highlights } = parseCodeHighlights(code)
    expect(highlights[0].override).toEqual({ x: 120, y: 45 })
  })
})

describe('serializeMarkerOverride', () => {
  it('appends an override to a marker with none yet', () => {
    const line = 'a(); // [!mark:x] comment'
    expect(serializeMarkerOverride(line, 10, 20)).toBe('a(); // [!mark:x@10,20] comment')
  })

  it('replaces an existing override', () => {
    const line = 'a(); // [!mark:x@1,2] comment'
    expect(serializeMarkerOverride(line, 10, 20)).toBe('a(); // [!mark:x@10,20] comment')
  })

  it('preserves range/substring markers when adding an override', () => {
    const line = 'a(); // [!mark:x:start] comment'
    expect(serializeMarkerOverride(line, 5, 6)).toBe('a(); // [!mark:x:start@5,6] comment')
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
    const { highlights } = parseCodeHighlights('int x = 1; // [!mark:h1] note')
    const out = injectHighlightSpans(html, highlights)
    expect(out).toContain('data-highlight-id="h1"')
    expect(out).toContain('data-comment="note"')
    expect(out).toContain('<span style="color:red">int</span> x = 1;</span>')
  })

  it('wraps only the matched substring, not the whole line', () => {
    const html = shikiHtml(['<span style="color:blue">foo</span>(<span style="color:green">bar</span>)'])
    const { highlights } = parseCodeHighlights('foo(bar) // [!mark:call(bar)] the arg')
    const out = injectHighlightSpans(html, highlights)
    expect(out).toContain('data-highlight-id="call"')
    // the wrapped fragment's text content is exactly "bar", not "foo(bar)"
    const wrapStart = out.indexOf('<span class="code-hl-mark"')
    const wrapOpenEnd = out.indexOf('>', wrapStart) + 1
    const closeIdx = out.indexOf('</span></span>', wrapOpenEnd)
    const wrapped = out.slice(wrapOpenEnd, closeIdx)
    expect(wrapped.replace(/<[^>]+>/g, '')).toBe('bar')
    expect(wrapped).not.toContain('foo')
  })

  it('wraps every line within a multi-line range with the same id', () => {
    const html = shikiHtml(['line0', 'line1', 'line2'])
    const { highlights } = parseCodeHighlights([
      'line0 // [!mark:r:start] note',
      'line1',
      'line2 // [!mark:r:end]',
    ].join('\n'))
    const out = injectHighlightSpans(html, highlights)
    expect(out.match(/data-highlight-id="r"/g)).toHaveLength(3)
  })

  it('returns html unchanged when there are no highlights', () => {
    const html = shikiHtml(['plain'])
    expect(injectHighlightSpans(html, [])).toBe(html)
  })
})
