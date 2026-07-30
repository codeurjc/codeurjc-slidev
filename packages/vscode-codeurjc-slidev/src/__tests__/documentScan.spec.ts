import { describe, it, expect } from 'vitest'
import { findFencedBlocks, findImportBlocks, computeSlideNumber } from '../documentScan'

describe('findFencedBlocks', () => {
  it('finds a single fenced block with its code lines', () => {
    const text = [
      '# Title',
      '',
      '```java',
      'int x = 1;',
      'int y = 2;',
      '```',
      '',
      'trailing',
    ].join('\n')
    const blocks = findFencedBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      lang: 'java',
      fenceStartLine: 2,
      fenceEndLine: 5,
      codeStartLine: 3,
      code: 'int x = 1;\nint y = 2;',
    })
  })

  it('finds multiple fenced blocks', () => {
    const text = ['```js', 'a', '```', '', '```py', 'b', '```'].join('\n')
    const blocks = findFencedBlocks(text)
    expect(blocks.map(b => b.lang)).toEqual(['js', 'py'])
  })

  it('ignores an unterminated fence', () => {
    const text = ['```java', 'int x = 1;'].join('\n')
    expect(findFencedBlocks(text)).toEqual([])
  })

  it('supports longer backtick fences containing shorter ones', () => {
    const text = ['````md', '```js', 'a', '```', '````'].join('\n')
    const blocks = findFencedBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].code).toBe('```js\na\n```')
  })
})

describe('findImportBlocks', () => {
  it('finds an import with no directives', () => {
    const text = '<<< @/code/Foo.java java'
    const blocks = findImportBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].importLine).toBe(0)
    expect(blocks[0].parsed.filePath).toBe('@/code/Foo.java')
    expect(blocks[0].directives).toEqual([])
  })

  it('collects anchor and source directive lines following an import', () => {
    const text = [
      '<<< @/code/Foo.java[1-10] java',
      '[!mark:"a"] first',
      '[!source]',
      '[!mark:"b"] second',
      '',
      'not a directive',
    ].join('\n')
    const blocks = findImportBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].directives).toEqual([
      { line: 1, text: '[!mark:"a"] first', kind: 'anchor' },
      { line: 2, text: '[!source]', kind: 'source' },
      { line: 3, text: '[!mark:"b"] second', kind: 'anchor' },
    ])
  })

  it('ignores <<< lines inside fenced blocks', () => {
    const text = ['```md', '<<< @/code/Foo.java java', '```'].join('\n')
    expect(findImportBlocks(text)).toEqual([])
  })

  it('finds multiple imports on separate slides', () => {
    const text = [
      '<<< @/code/A.java java',
      '[!mark:"x"] one',
      '---',
      '<<< @/code/B.java java',
    ].join('\n')
    const blocks = findImportBlocks(text)
    expect(blocks).toHaveLength(2)
    expect(blocks[1].importLine).toBe(3)
  })
})

describe('computeSlideNumber', () => {
  const text = [
    '---',
    'theme: codeurjc-slidev-theme',
    '---',
    '',
    '# Slide 1',
    'body',
    '',
    '---',
    '',
    '# Slide 2',
    '',
    '---',
    '',
    '# Slide 3',
  ].join('\n')
  const lines = text.split('\n')

  it('reports slide 1 for lines right after frontmatter', () => {
    expect(computeSlideNumber(text, lines.indexOf('# Slide 1'))).toBe(1)
  })

  it('reports slide 2 after one separator', () => {
    expect(computeSlideNumber(text, lines.indexOf('# Slide 2'))).toBe(2)
  })

  it('reports slide 3 after two separators', () => {
    expect(computeSlideNumber(text, lines.indexOf('# Slide 3'))).toBe(3)
  })
})
