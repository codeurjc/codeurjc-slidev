import { describe, it, expect, vi } from 'vitest'
import {
  parseSnippetImportLine,
  parseSnippetSelector,
  resolveSnippetSelector,
  isWithinCodeRoot,
  combineCodeAndAnchors,
  splitCodeAndAnchors,
  isAnchorDeclarationLine,
  isSourceDirectiveLine,
  parseSourceDirective,
} from '../useSnippetImport'

describe('parseSnippetImportLine', () => {
  it('parses a plain import with no selector', () => {
    expect(parseSnippetImportLine('<<< @/code/ejer8/File.java java')).toEqual({
      filePath: '@/code/ejer8/File.java',
      selectorRaw: null,
      lang: 'java',
      notitle: false,
    })
  })

  it('parses a line-range selector', () => {
    expect(parseSnippetImportLine('<<< @/code/ejer8/File.java[9-15] java')).toEqual({
      filePath: '@/code/ejer8/File.java',
      selectorRaw: '9-15',
      lang: 'java',
      notitle: false,
    })
  })

  it('parses a content-anchor-range selector containing spaces', () => {
    const line = '<<< @/code/ejer8/File.java["public float calculaNotaMedia".."return suma / notas.size();"] java'
    expect(parseSnippetImportLine(line)).toEqual({
      filePath: '@/code/ejer8/File.java',
      selectorRaw: '"public float calculaNotaMedia".."return suma / notas.size();"',
      lang: 'java',
      notitle: false,
    })
  })

  it('returns null for a non-import line', () => {
    expect(parseSnippetImportLine('just some text')).toBeNull()
  })

  it('parses a trailing notitle keyword', () => {
    expect(parseSnippetImportLine('<<< @/code/ejer8/File.java[9-15] java notitle')).toEqual({
      filePath: '@/code/ejer8/File.java',
      selectorRaw: '9-15',
      lang: 'java',
      notitle: true,
    })
  })

  it('defaults notitle to false when absent', () => {
    expect(parseSnippetImportLine('<<< @/code/ejer8/File.java java')?.notitle).toBe(false)
  })
})

describe('parseSnippetSelector', () => {
  it('parses a line range', () => {
    expect(parseSnippetSelector('9-15')).toEqual({ kind: 'lineRange', start: 9, end: 15 })
  })

  it('parses a content range', () => {
    expect(parseSnippetSelector('"a".."b"')).toEqual({ kind: 'contentRange', startText: 'a', endText: 'b' })
  })

  it('returns null for a malformed selector', () => {
    expect(parseSnippetSelector('not-a-selector')).toBeNull()
  })
})

const FILE_TEXT = [
  'line1',
  'line2',
  'line3 START',
  'line4',
  'line5 END',
  'line6',
].join('\n')

describe('resolveSnippetSelector', () => {
  it('returns the whole file when there is no selector', () => {
    expect(resolveSnippetSelector(FILE_TEXT, null)).toEqual({ text: FILE_TEXT, startLine: 1, endLine: 6 })
  })

  it('slices by absolute line range', () => {
    expect(resolveSnippetSelector(FILE_TEXT, { kind: 'lineRange', start: 2, end: 4 }))
      .toEqual({ text: 'line2\nline3 START\nline4', startLine: 2, endLine: 4 })
  })

  it('falls back to the whole file and warns when the line range is out of bounds', () => {
    const warn = vi.fn()
    expect(resolveSnippetSelector(FILE_TEXT, { kind: 'lineRange', start: 5, end: 50 }, warn))
      .toEqual({ text: FILE_TEXT, startLine: 1, endLine: 6 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('out of bounds'))
  })

  it('slices by content-anchor range', () => {
    const selector = { kind: 'contentRange' as const, startText: 'START', endText: 'END' }
    expect(resolveSnippetSelector(FILE_TEXT, selector))
      .toEqual({ text: 'line3 START\nline4\nline5 END', startLine: 3, endLine: 5 })
  })

  it('falls back to the whole file and warns when a content anchor is not found', () => {
    const warn = vi.fn()
    const selector = { kind: 'contentRange' as const, startText: 'START', endText: 'nope' }
    expect(resolveSnippetSelector(FILE_TEXT, selector, warn)).toEqual({ text: FILE_TEXT, startLine: 1, endLine: 6 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nope'))
  })
})

describe('isWithinCodeRoot', () => {
  it('accepts a path under the configured code root', () => {
    expect(isWithinCodeRoot('/repo/code/ejer8/File.java', '/repo', 'code')).toBe(true)
  })

  it('rejects a path outside the configured code root', () => {
    expect(isWithinCodeRoot('/repo/slides.md', '/repo', 'code')).toBe(false)
  })

  it('rejects a sibling directory with a matching prefix', () => {
    expect(isWithinCodeRoot('/repo/code-extra/File.java', '/repo', 'code')).toBe(false)
  })
})

describe('combineCodeAndAnchors / splitCodeAndAnchors', () => {
  it('round-trips code with anchor declarations', () => {
    const combined = combineCodeAndAnchors('int x = 1;', ['[!mark:1] comment'])
    const { code, anchorLines } = splitCodeAndAnchors(combined)
    expect(code).toBe('int x = 1;')
    expect(anchorLines).toEqual(['[!mark:1] comment'])
  })

  it('returns the code unchanged with no anchor lines when there are none', () => {
    expect(combineCodeAndAnchors('int x = 1;', [])).toBe('int x = 1;')
    expect(splitCodeAndAnchors('int x = 1;')).toEqual({ code: 'int x = 1;', anchorLines: [] })
  })
})

describe('isAnchorDeclarationLine', () => {
  it('recognizes an anchor declaration', () => {
    expect(isAnchorDeclarationLine('[!mark:1] comment')).toBe(true)
  })

  it('rejects a plain code line', () => {
    expect(isAnchorDeclarationLine('int x = 1;')).toBe(false)
  })
})

describe('isSourceDirectiveLine', () => {
  it('recognizes a bare [!source] directive', () => {
    expect(isSourceDirectiveLine('[!source]')).toBe(true)
  })

  it('recognizes a directive with content', () => {
    expect(isSourceDirectiveLine('[!source none]')).toBe(true)
  })

  it('rejects a plain code line', () => {
    expect(isSourceDirectiveLine('int x = 1;')).toBe(false)
  })

  it('rejects an anchor-declaration line', () => {
    expect(isSourceDirectiveLine('[!mark:1] comment')).toBe(false)
  })
})

describe('parseSourceDirective', () => {
  it('parses a bare [!source] as auto mode', () => {
    expect(parseSourceDirective('[!source]')).toEqual({ mode: 'auto', bottom: false })
  })

  it('parses [!source none] as suppression', () => {
    expect(parseSourceDirective('[!source none]')).toEqual({ mode: 'none', bottom: false })
  })

  it('parses [!source bottom] as a placement-only override', () => {
    expect(parseSourceDirective('[!source bottom]')).toEqual({ mode: 'auto', bottom: true })
  })

  it('parses an explicit URL override', () => {
    expect(parseSourceDirective('[!source https://example.com/File.java]')).toEqual({
      mode: 'url',
      url: 'https://example.com/File.java',
      bottom: false,
    })
  })

  it('parses a combined bottom + URL override', () => {
    expect(parseSourceDirective('[!source bottom https://example.com/File.java]')).toEqual({
      mode: 'url',
      url: 'https://example.com/File.java',
      bottom: true,
    })
  })

  it('returns null for a malformed directive', () => {
    expect(parseSourceDirective('[!source')).toBeNull()
  })
})
