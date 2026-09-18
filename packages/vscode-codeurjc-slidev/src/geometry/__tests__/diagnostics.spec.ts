import { describe, expect, it } from 'vitest'
import { geometryDiagnostics } from '../diagnostics'

/** A slide with `geometry` frontmatter and the given content. */
function deck(frontmatter: string[], content: string[] = []): string {
  return ['---', ...frontmatter, '---', '', ...content, ''].join('\n')
}

const lineOf = (text: string, needle: string) => text.split('\n').findIndex(l => l.includes(needle))

describe('geometryDiagnostics', () => {
  it('reports a malformed rect and points at the offending field', () => {
    const text = deck(['geometry:', '  content: {x: 31, y: 98, w: 0, h: 424}'])
    const [d] = geometryDiagnostics(text)
    expect(d.message).toContain('geometry.content.w')
    expect(d.message).toContain('greater than 0')
    expect(d.kind).toBe('grammar')
    expect(d.range.startLine).toBe(lineOf(text, 'content: {x: 31'))
  })

  it('reports a non-numeric field', () => {
    const text = deck(['geometry:', '  content: {x: nope, y: 98, w: 560, h: 424}'])
    expect(geometryDiagnostics(text)[0].message).toContain('geometry.content.x must be a number')
  })

  it('reports a key that matches nothing, and says how to make it match', () => {
    const text = deck(
      ['geometry:', '  elements:', '    - {id: flow, x: 10, y: 10, w: 100, h: 100}'],
      ['Some prose with no diagram.'],
    )
    const [d] = geometryDiagnostics(text)
    expect(d.kind).toBe('resolution')
    expect(d.message).toContain('matches nothing')
    expect(d.message).toContain('{id: \'flow\'}')
  })

  it('reports an ambiguous key', () => {
    const text = deck(
      ['geometry:', '  elements:', '    - {code: dup.ts, x: 10, y: 10, w: 100, h: 100}'],
      ['```ts [dup.ts]', 'const a = 1', '```', '', '```ts [dup.ts]', 'const b = 2', '```'],
    )
    const [d] = geometryDiagnostics(text)
    expect(d.kind).toBe('resolution')
    expect(d.message).toContain('matches 2 elements')
  })

  it('reports an id that names the wrong kind of element', () => {
    const text = deck(
      ['geometry:', '  elements:', '    - {id: prices, x: 10, y: 10, w: 100, h: 100}'],
      ['<p id="prices">not a positionable element</p>'],
    )
    const [d] = geometryDiagnostics(text)
    expect(d.kind).toBe('resolution')
    expect(d.message).toContain('is not a code block, mermaid diagram')
  })

  it('reports two entries claiming the same target', () => {
    const text = deck(
      [
        'geometry:',
        '  elements:',
        '    - {id: flow, x: 10, y: 10, w: 100, h: 100}',
        '    - {id: flow, x: 20, y: 20, w: 100, h: 100}',
      ],
      ['```mermaid {id: \'flow\'}', 'flowchart LR', '```'],
    )
    const messages = geometryDiagnostics(text).map(d => d.message)
    expect(messages.some(m => m.includes('already positioned by another entry'))).toBe(true)
  })

  it('reports an image src that matches no image', () => {
    const text = deck(
      ['geometry:', '  images:', '    - {src: /images/gone.png, x: 10, y: 10, w: 100, h: 100}'],
      ['![](/images/here.png)'],
    )
    const [d] = geometryDiagnostics(text)
    expect(d.message).toContain('no image with src "/images/gone.png"')
  })

  it('reports an ambiguous bare src and suggests #N', () => {
    const text = deck(
      ['geometry:', '  images:', '    - {src: /images/a.png, x: 10, y: 10, w: 100, h: 100}'],
      ['![](/images/a.png)', '![](/images/a.png)'],
    )
    expect(geometryDiagnostics(text)[0].message).toContain('appears 2 times')
  })

  it('reports nothing for valid geometry whose entries all resolve', () => {
    const text = deck(
      [
        'geometry:',
        '  content: {x: 31, y: 98, w: 560, h: 424}',
        '  elements:',
        '    - {id: flow, x: 620, y: 110, w: 320, h: 180}',
        '  images:',
        '    - {src: /images/a.png, x: 620, y: 310, w: 320, h: 180}',
      ],
      ['```mermaid {id: \'flow\'}', 'flowchart LR', '```', '', '![](/images/a.png)'],
    )
    expect(geometryDiagnostics(text)).toEqual([])
  })

  it('produces diagnostics with no dev server and no DOM', () => {
    // The whole module is pure: this test is the assertion.
    const text = deck(['geometry:', '  content: {x: 1, y: 1, w: -5, h: 10}'])
    expect(geometryDiagnostics(text)).toHaveLength(1)
  })

  it('skips slides using a layout other than default', () => {
    const text = deck(['layout: cover', 'geometry:', '  content: {x: 1, y: 1, w: 0, h: 10}'])
    expect(geometryDiagnostics(text)).toEqual([])
  })

  it('reports the slide each diagnostic belongs to', () => {
    const text = [
      '---',
      'geometry:',
      '  content: {x: 1, y: 1, w: 0, h: 10}',
      '---',
      '',
      'first',
      '',
      '---',
      'geometry:',
      '  content: {x: 1, y: 1, w: 0, h: 10}',
      '---',
      '',
      'second',
      '',
    ].join('\n')
    expect(geometryDiagnostics(text).map(d => d.slideNo)).toEqual([1, 2])
  })

  describe('slides whose content comes from another file', () => {
    const frontmatter = [
      'src: ./other.md',
      'geometry:',
      '  elements:',
      '    - {id: flow, x: 10, y: 10, w: 100, h: 100}',
    ]

    it('suppresses resolution diagnostics, since the content is not in this file', () => {
      const diagnostics = geometryDiagnostics(deck(frontmatter))
      expect(diagnostics.filter(d => d.kind === 'resolution')).toEqual([])
    })

    it('still reports grammar problems on the same slide', () => {
      const text = deck([...frontmatter, '  content: {x: nope, y: 1, w: 10, h: 10}'])
      const grammar = geometryDiagnostics(text).filter(d => d.kind === 'grammar')
      expect(grammar).toHaveLength(1)
      expect(grammar[0].message).toContain('geometry.content.x must be a number')
    })
  })
})
