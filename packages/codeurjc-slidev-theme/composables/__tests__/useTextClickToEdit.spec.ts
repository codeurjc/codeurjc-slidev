import { describe, it, expect } from 'vitest'
import {
  parseMarkdownBlocks,
  lineRangeToCharRange,
  resolveBlockRange,
  collectDomBlocks,
  blockTypeForElement,
} from '../useTextClickToEdit'

describe('parseMarkdownBlocks', () => {
  it('parses a heading and a paragraph in document order', () => {
    const source = '# Title\n\nSome text.\n'
    const blocks = parseMarkdownBlocks(source)
    expect(blocks).toEqual([
      { type: 'h1', startLine: 0, endLine: 1 },
      { type: 'p', startLine: 2, endLine: 3 },
    ])
  })

  it('treats nested list items as individual blocks, in document order', () => {
    const source = '- item one\n- item two\n  - nested item\n'
    const blocks = parseMarkdownBlocks(source)
    expect(blocks.map(b => b.type)).toEqual(['li', 'li', 'li'])
  })

  it('does not double-count paragraphs inside a tight list item', () => {
    // markdown-it marks tight-list paragraphs `hidden`, matching how the
    // browser renders `<li>text</li>` without an inner <p>.
    const source = '- item one\n- item two\n'
    const blocks = parseMarkdownBlocks(source)
    expect(blocks).toEqual([
      { type: 'li', startLine: 0, endLine: 1 },
      { type: 'li', startLine: 1, endLine: 2 },
    ])
  })

  it('includes both a blockquote and its inner paragraph as separate blocks', () => {
    const source = '> a quote\n'
    const blocks = parseMarkdownBlocks(source)
    expect(blocks.map(b => b.type)).toEqual(['blockquote', 'p'])
  })

  it('parses a fenced code block as pre', () => {
    const source = '```js\ncode();\n```\n'
    const blocks = parseMarkdownBlocks(source)
    expect(blocks).toEqual([{ type: 'pre', startLine: 0, endLine: 3 }])
  })

  it('parses table rows (header + body) as tr blocks', () => {
    const source = '| a | b |\n| - | - |\n| 1 | 2 |\n'
    const blocks = parseMarkdownBlocks(source)
    expect(blocks.map(b => b.type)).toEqual(['tr', 'tr'])
  })

  it('parses a standalone image as a plain paragraph block', () => {
    const source = '![](/images/x.png)\n'
    const blocks = parseMarkdownBlocks(source)
    expect(blocks).toEqual([{ type: 'p', startLine: 0, endLine: 1 }])
  })
})

describe('lineRangeToCharRange', () => {
  it('converts a single-line range and trims the trailing newline', () => {
    const source = '# Title\n\nSome text.\n'
    expect(lineRangeToCharRange(source, 0, 1)).toEqual({ start: 0, end: 7 })
  })

  it('converts a later line range accounting for preceding lines', () => {
    const source = '# Title\n\nSome text.\n'
    expect(lineRangeToCharRange(source, 2, 3)).toEqual({ start: 9, end: 19 })
  })

  it('handles a multi-line block range (fenced code)', () => {
    const source = '```js\ncode();\n```\n'
    const { start, end } = lineRangeToCharRange(source, 0, 3)
    expect(source.slice(start, end)).toBe('```js\ncode();\n```')
  })
})

describe('DOM block collection', () => {
  it('collects block-level elements in document order, skipping non-block wrappers', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <h1>Title</h1>
      <div class="slidev-vclick-target">
        <p>Paragraph one</p>
      </div>
      <ul><li>Item one</li><li>Item two</li></ul>
    `
    const blocks = collectDomBlocks(container)
    expect(blocks.map(el => blockTypeForElement(el))).toEqual(['h1', 'p', 'li', 'li'])
  })
})

describe('resolveBlockRange', () => {
  function render(html: string): Element {
    const container = document.createElement('div')
    container.innerHTML = html
    return container
  }

  it('resolves a double-clicked paragraph to its raw-markdown range', () => {
    const source = '# Title\n\nSome text.\n'
    const container = render('<h1>Title</h1><p>Some text.</p>')
    const p = container.querySelector('p')!
    const range = resolveBlockRange(container, p, source)
    expect(range).toEqual({ start: 9, end: 19 })
    expect(source.slice(range!.start, range!.end)).toBe('Some text.')
  })

  it('resolves a click on a nested element to its nearest block ancestor', () => {
    const source = '# Title\n\nSome **bold** text.\n'
    const container = render('<h1>Title</h1><p>Some <strong>bold</strong> text.</p>')
    const strong = container.querySelector('strong')!
    const range = resolveBlockRange(container, strong, source)
    expect(range).toEqual({ start: 9, end: 28 })
  })

  it('resolves the correct list item among siblings', () => {
    const source = '- item one\n- item two\n'
    const container = render('<ul><li>item one</li><li>item two</li></ul>')
    const items = container.querySelectorAll('li')
    const range = resolveBlockRange(container, items[1], source)
    // The list item's raw-markdown range includes its `- ` marker line, so
    // the whole source line for that item is selected.
    expect(source.slice(range!.start, range!.end)).toBe('- item two')
  })

  it('returns null when the DOM and markdown block counts disagree', () => {
    const source = '# Title\n\nSome text.\n'
    // DOM has an extra <p> the raw markdown doesn't (e.g. a mismatched/live-edited render)
    const container = render('<h1>Title</h1><p>Some text.</p><p>Extra</p>')
    const extra = container.querySelectorAll('p')[1]
    expect(resolveBlockRange(container, extra, source)).toBeNull()
  })

  it('returns null when the click target is outside the container', () => {
    const source = '# Title\n'
    const container = render('<h1>Title</h1>')
    const outside = document.createElement('p')
    document.body.appendChild(outside)
    expect(resolveBlockRange(container, outside, source)).toBeNull()
    outside.remove()
  })

  it('returns null when the click target has no block-level ancestor', () => {
    const source = '# Title\n'
    const container = render('<h1>Title</h1>')
    expect(resolveBlockRange(container, container, source)).toBeNull()
  })
})
