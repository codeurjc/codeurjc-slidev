import { describe, expect, it, vi } from 'vitest'
import { extractInlineSourceLink, findMarkerSpan, injectHighlightSpans, isInlineSourceMarkerLine, parseCodeHighlights, resolveMarkerLine, serializeMarkerOverride } from '../useCodeHighlights'

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

  it('rewrites the addressed marker when a line carries several', () => {
    const line = 'x(); // [!mark] a [!mark(0-4)] b [!mark:end]'
    expect(serializeMarkerOverride(line, 5, 6, 1)).toBe('x(); // [!mark] a [!mark(0-4)@5,6] b [!mark:end]')
    expect(serializeMarkerOverride(line, 5, 6, 2)).toBe('x(); // [!mark] a [!mark(0-4)] b [!mark:end@5,6]')
    expect(serializeMarkerOverride(line, 5, 6)).toBe('x(); // [!mark@5,6] a [!mark(0-4)] b [!mark:end]')
  })

  it('replaces an existing override on the addressed marker only', () => {
    const line = 'x(); // [!mark@1,2] a [!mark{3}@7,8] b'
    expect(serializeMarkerOverride(line, 30, 40, 1)).toBe('x(); // [!mark@1,2] a [!mark{3}@30,40] b')
  })

  it('leaves the line unchanged when the marker index is out of range', () => {
    const line = 'x(); // [!mark] a'
    expect(serializeMarkerOverride(line, 5, 6, 3)).toBe(line)
  })
})

describe('resolveMarkerLine', () => {
  // Two slides, each with the same marked line; the second slide spans lines 5-8.
  const lines = [
    '# One',
    '```java',
    'a(); // [!mark] note',
    '```',
    '---',
    '# Two',
    '```java',
    'a(); // [!mark] note',
    '```',
  ]

  it('resolves within the slide that owns the callout', () => {
    expect(resolveMarkerLine(lines, 'a(); // [!mark] note', { slideStart: 5, slideEnd: 8 })).toBe(7)
    expect(resolveMarkerLine(lines, 'a(); // [!mark] note', { slideStart: 0, slideEnd: 3 })).toBe(2)
  })

  it('picks the requested occurrence when a slide repeats the line', () => {
    const repeated = ['# One', 'x(); // [!mark] a', 'y();', 'x(); // [!mark] a']
    expect(resolveMarkerLine(repeated, 'x(); // [!mark] a', { slideStart: 0, slideEnd: 3, lineOccurrence: 1 })).toBe(3)
    expect(resolveMarkerLine(repeated, 'x(); // [!mark] a', { slideStart: 0, slideEnd: 3, lineOccurrence: 0 })).toBe(1)
  })

  it('falls back to the first match when the range no longer holds the line', () => {
    expect(resolveMarkerLine(lines, 'a(); // [!mark] note', { slideStart: 40, slideEnd: 50 })).toBe(2)
  })

  it('falls back to the first match when no addressing fields are sent', () => {
    expect(resolveMarkerLine(lines, 'a(); // [!mark] note')).toBe(2)
  })

  it('returns -1 when the line is not in the file', () => {
    expect(resolveMarkerLine(lines, 'z(); // [!mark] gone', { slideStart: 0, slideEnd: 3 })).toBe(-1)
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
    const highlight = { id: '0', kind: 'substring' as const, startLine: 0, endLine: 0, substringRange: { start, end }, comment: 'note', sourceLine: 'x', markerIndex: 0 }
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
    const highlight = { id: '0', kind: 'substring' as const, startLine: 0, endLine: 0, substringRange: { start: 0, end: 24 }, comment: 'note', sourceLine: 'x', markerIndex: 0 }
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

describe('isInlineSourceMarkerLine / extractInlineSourceLink', () => {
  it('recognizes a // [!source url] marker line', () => {
    expect(isInlineSourceMarkerLine('// [!source https://github.com/owner/repo/blob/main/File.java]')).toBe(true)
  })

  it('recognizes a #-comment marker line', () => {
    expect(isInlineSourceMarkerLine('# [!source https://example.com]')).toBe(true)
  })

  it('rejects a plain code line', () => {
    expect(isInlineSourceMarkerLine('int x = 1;')).toBe(false)
  })

  it('strips the marker line and reports its url', () => {
    const code = [
      'public class Foo {',
      '// [!source https://github.com/owner/repo/blob/main/Foo.java]',
      '  int x = 1;',
      '}',
    ].join('\n')
    const { code: stripped, url } = extractInlineSourceLink(code)
    expect(url).toBe('https://github.com/owner/repo/blob/main/Foo.java')
    expect(stripped).toBe([
      'public class Foo {',
      '  int x = 1;',
      '}',
    ].join('\n'))
  })

  it('returns a null url and unchanged code when there is no marker', () => {
    const code = 'int x = 1;'
    expect(extractInlineSourceLink(code)).toEqual({ code, url: null })
  })
})

describe('findMarkerSpan', () => {
  it('finds the span of a whole-line marker comment', () => {
    const line = '  this.alumnos = alumnos; // [!mark] Injects the dependency'
    const span = findMarkerSpan(line)
    expect(span!.end).toBe(line.length)
    expect(line.slice(span!.start)).toBe('// [!mark] Injects the dependency')
  })

  it('finds the span of a #-comment marker', () => {
    const line = 'x = 1  # [!mark(2-3)] note'
    const span = findMarkerSpan(line)
    expect(line.slice(span!.start)).toBe('# [!mark(2-3)] note')
  })

  it('returns null for a line with no marker', () => {
    expect(findMarkerSpan('int x = 1;')).toBeNull()
  })
})

describe('several markers on one line', () => {
  it('parses two markers on one line and strips the whole comment region', () => {
    const code = [
      'jobs:',
      '    steps:      # [!mark(4-10)] Los pasos [!mark:end]',
    ].join('\n')
    const { code: stripped, highlights } = parseCodeHighlights(`a(); // [!mark:start] Job\n${code}`)
    expect(stripped).toBe(['a();', 'jobs:', '    steps:'].join('\n'))
    expect(highlights).toEqual([
      expect.objectContaining({ kind: 'range', startLine: 0, endLine: 2, comment: 'Job', markerIndex: 0 }),
      expect.objectContaining({ kind: 'substring', startLine: 2, endLine: 2, substringRange: { start: 4, end: 10 }, comment: 'Los pasos', markerIndex: 0 }),
    ])
  })

  it('ends a comment body at the next marker', () => {
    const { highlights } = parseCodeHighlights('x(); # [!mark] First note [!mark(0-4)] Second note')
    expect(highlights.map(h => [h.comment, h.markerIndex])).toEqual([['First note', 0], ['Second note', 1]])
  })

  it('closes nested ranges innermost-first when two end markers share a line', () => {
    const code = [
      'name: CI // [!mark:start] WORKFLOW',
      'jobs:',
      '  test: // [!mark:start] JOB',
      '    runs-on: ubuntu-latest',
      '      - run: mvn test // [!mark:end] [!mark:end]',
    ].join('\n')
    const { code: stripped, highlights } = parseCodeHighlights(code)
    expect(stripped.split('\n')[4]).toBe('      - run: mvn test')
    expect(highlights.map(h => [h.startLine, h.endLine, h.comment])).toEqual([
      [0, 4, 'WORKFLOW'],
      [2, 4, 'JOB'],
    ])
  })

  it('lets one line end a range and start another', () => {
    const code = [
      'a(); // [!mark:start] first',
      'b(); // [!mark:end] [!mark:start] second',
      'c(); // [!mark:end]',
    ].join('\n')
    const { highlights } = parseCodeHighlights(code)
    expect(highlights.map(h => [h.startLine, h.endLine, h.comment, h.markerIndex])).toEqual([
      [0, 1, 'first', 0],
      [1, 2, 'second', 1],
    ])
  })

  it('highlights disjoint substring ranges on one line', () => {
    const { highlights } = parseCodeHighlights('const a = 1; // [!mark(0-5)] A [!mark(6-7)] B')
    expect(highlights.map(h => [h.substringRange, h.comment])).toEqual([
      [{ start: 0, end: 5 }, 'A'],
      [{ start: 6, end: 7 }, 'B'],
    ])
  })

  it('warns and skips an overlapping substring range on the same line', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { highlights } = parseCodeHighlights('const a = 1; // [!mark(0-10)] A [!mark(5-15)] B')
    expect(highlights.map(h => h.comment)).toEqual(['A'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('overlaps an earlier highlight'))
    warn.mockRestore()
  })

  it('splits a comment that contains the literal marker text', () => {
    const { highlights } = parseCodeHighlights('x(); // [!mark] write [!mark] to mark a line')
    expect(highlights.map(h => h.comment)).toEqual(['write', 'to mark a line'])
  })

  it('keeps a malformed marker unrecognized, leaving the line untouched', () => {
    const { code: stripped, highlights } = parseCodeHighlights('x(); // [!mark{0}] Note')
    expect(stripped).toBe('x(); // [!mark{0}] Note')
    expect(highlights).toEqual([])
  })

  it('records marker index 0 for an ordinary single-marker line', () => {
    const { highlights } = parseCodeHighlights('x(); // [!mark] Note')
    expect(highlights[0].markerIndex).toBe(0)
  })
})

describe('click-step suffix on inline markers', () => {
  it('parses a whole-line marker with a click step and strips the marker', () => {
    const { code, highlights } = parseCodeHighlights('this.alumnos = alumnos; // [!mark{2}] Stores the dependency')
    expect(code).toBe('this.alumnos = alumnos;')
    expect(highlights).toEqual([
      expect.objectContaining({ kind: 'line', startLine: 0, click: { from: 2 }, comment: 'Stores the dependency' }),
    ])
  })

  it('leaves highlights without a suffix unstepped', () => {
    const { highlights } = parseCodeHighlights('a(); // [!mark] Always shown')
    expect(highlights[0].click).toBeUndefined()
  })

  it('applies a step on the :start marker to the whole range', () => {
    const { highlights } = parseCodeHighlights(['a(); // [!mark:start{3}] Loop', 'b();', 'c(); // [!mark:end]'].join('\n'))
    expect(highlights).toEqual([expect.objectContaining({ kind: 'range', startLine: 0, endLine: 2, click: { from: 3 } })])
  })

  it('falls back to the :end marker step when :start has none, and prefers :start when both do', () => {
    const endOnly = parseCodeHighlights(['a(); // [!mark:start] Loop', 'b(); // [!mark:end{2}]'].join('\n'))
    expect(endOnly.highlights[0].click).toEqual({ from: 2 })
    const both = parseCodeHighlights(['a(); // [!mark:start{1}] Loop', 'b(); // [!mark:end{4}]'].join('\n'))
    expect(both.highlights[0].click).toEqual({ from: 1 })
  })

  it('combines the suffix with a substring range and a position override', () => {
    const { highlights } = parseCodeHighlights('  this.alumnos = alumnos; // [!mark(2-16){2}@120,40] Just the substring')
    expect(highlights).toEqual([
      expect.objectContaining({ kind: 'substring', substringRange: { start: 2, end: 16 }, click: { from: 2 }, override: { x: 120, y: 40 } }),
    ])
  })

  it('does not recognize malformed suffixes', () => {
    for (const bad of ['{0}', '{}', '{x}']) {
      const line = `a(); // [!mark${bad}] Note`
      const { code, highlights } = parseCodeHighlights(line)
      expect(highlights).toEqual([])
      expect(code).toBe(line)
      expect(findMarkerSpan(line)).toBeNull()
    }
  })

  it('findMarkerSpan covers the whole marker including the suffix', () => {
    const line = 'a(); // [!mark{2}] Note'
    expect(findMarkerSpan(line)).toEqual({ start: 'a(); '.length, end: line.length })
  })

  it('serializeMarkerOverride keeps the suffix and inserts or replaces @x,y after it', () => {
    expect(serializeMarkerOverride('a(); // [!mark{2}] Note', 200, 60)).toBe('a(); // [!mark{2}@200,60] Note')
    expect(serializeMarkerOverride('a(); // [!mark(1-3){2}@5,5] Note', 7.6, 8.4)).toBe('a(); // [!mark(1-3){2}@8,8] Note')
    expect(serializeMarkerOverride('a(); // [!mark:start{3}] Loop', 1, 2)).toBe('a(); // [!mark:start{3}@1,2] Loop')
  })

  it('injectHighlightSpans marks stepped highlight spans with their click step', () => {
    const html = '<pre><code><span class="line"><span>a();</span></span></code></pre>'
    const { highlights } = parseCodeHighlights('a(); // [!mark{2}] Note')
    const out = injectHighlightSpans(html, highlights)
    expect(out).toContain('data-highlight-click="2"')
    const unstepped = injectHighlightSpans(html, parseCodeHighlights('a(); // [!mark] Note').highlights)
    expect(unstepped).not.toContain('data-highlight-click')
  })
})

describe('click-step ranges on inline markers', () => {
  it.each([
    ['{2-3}', { from: 2, to: 3 }],
    ['{2-}', { from: 2 }],
    ['{-1}', { to: 1 }],
    ['{-0}', { to: 0 }],
  ])('parses %s', (suffix, range) => {
    const { highlights, code } = parseCodeHighlights(`a(); // [!mark${suffix}] Note`)
    expect(highlights).toEqual([expect.objectContaining({ kind: 'line', click: range, comment: 'Note' })])
    expect(code).toBe('a();')
  })

  it('combines a range with a substring range, an override, and a :start/:end range', () => {
    expect(parseCodeHighlights('this.x = x; // [!mark(2-16){2-3}@120,40] Sub').highlights[0])
      .toEqual(expect.objectContaining({ kind: 'substring', click: { from: 2, to: 3 }, override: { x: 120, y: 40 } }))
    expect(parseCodeHighlights('a(); // [!mark:start{-1}] R\nb();\nc(); // [!mark:end]').highlights[0])
      .toEqual(expect.objectContaining({ kind: 'range', startLine: 0, endLine: 2, click: { to: 1 } }))
  })

  it.each(['{0-2}', '{3-2}', '{-}', '{2-3-4}', '{0}'])('leaves a marker with %s unrecognized', (suffix) => {
    const line = `a(); // [!mark${suffix}] Note`
    expect(parseCodeHighlights(line).highlights).toEqual([])
    expect(findMarkerSpan(line)).toBeNull()
  })

  it('marks spans with the formatted range', () => {
    const html = '<pre class="shiki"><code><span class="line"><span>a();</span></span></code></pre>'
    expect(injectHighlightSpans(html, parseCodeHighlights('a(); // [!mark{2-3}] Note').highlights)).toContain('data-highlight-click="2-3"')
  })

  it('keeps the range as written when writing a position override', () => {
    expect(serializeMarkerOverride('a(); // [!mark{2-3}] Note', 200, 60)).toBe('a(); // [!mark{2-3}@200,60] Note')
    expect(serializeMarkerOverride('a(); // [!mark{2-}@1,1] Note', 5, 6)).toBe('a(); // [!mark{2-}@5,6] Note')
    expect(serializeMarkerOverride('a(); // [!mark{0-2}] bad [!mark{-1}] Good', 7, 8, 0)).toBe('a(); // [!mark{0-2}] bad [!mark{-1}@7,8] Good')
  })
})
