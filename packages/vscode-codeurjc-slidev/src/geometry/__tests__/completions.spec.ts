import { describe, expect, it } from 'vitest'
import { geometryCompletionContext, geometryCompletions } from '../completions'

/** Places the cursor at the `|` marker, returning the text without it plus its position. */
function atCursor(raw: string): { text: string, line: number, character: number } {
  const lines = raw.split('\n')
  const line = lines.findIndex(l => l.includes('|'))
  const character = lines[line].indexOf('|')
  lines[line] = lines[line].replace('|', '')
  return { text: lines.join('\n'), line, character }
}

function completionsAt(raw: string): string[] {
  const { text, line, character } = atCursor(raw)
  const context = geometryCompletionContext(text, line, character)
  return context ? geometryCompletions(text, context).map(c => c.value) : []
}

describe('geometryCompletionContext', () => {
  it('is null outside a geometry entry', () => {
    const { text, line, character } = atCursor('---\nlayout: default\n---\n\nsome | prose\n')
    expect(geometryCompletionContext(text, line, character)).toBeNull()
  })

  it('is null inside a fence\'s own options, which are content not frontmatter', () => {
    const { text, line, character } = atCursor('---\nlayout: default\n---\n\n```mermaid {id: fl|}\n```\n')
    expect(geometryCompletionContext(text, line, character)).toBeNull()
  })

  it('reports the key and what has been typed', () => {
    const { text, line, character } = atCursor([
      '---',
      'geometry:',
      '  elements:',
      '    - {id: fl|',
      '---',
      '',
      'content',
    ].join('\n'))
    expect(geometryCompletionContext(text, line, character)).toMatchObject({ key: 'id', typed: 'fl', slideNo: 1 })
  })
})

describe('geometryCompletions', () => {
  it('offers import paths and fence titles for code:', () => {
    expect(completionsAt([
      '---',
      'geometry:',
      '  elements:',
      '    - {code: |',
      '---',
      '',
      '<<< @/code/ejem1/Calculadora.java java',
      '',
      '```ts [Test.java]',
      'const a = 1',
      '```',
    ].join('\n'))).toEqual(['@/code/ejem1/Calculadora.java', 'Test.java'])
  })

  it('offers ids actually present on the slide for id:', () => {
    expect(completionsAt([
      '---',
      'geometry:',
      '  elements:',
      '    - {id: |',
      '---',
      '',
      '```mermaid {id: \'flow\'}',
      'flowchart LR',
      '```',
    ].join('\n'))).toEqual(['flow'])
  })

  it('offers a wrapper id for a wrapped table', () => {
    expect(completionsAt([
      '---',
      'geometry:',
      '  elements:',
      '    - {id: |',
      '---',
      '',
      '<div id="prices">',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '</div>',
    ].join('\n'))).toEqual(['prices'])
  })

  it('distinguishes the occurrences of a repeated image', () => {
    expect(completionsAt([
      '---',
      'geometry:',
      '  images:',
      '    - {src: |',
      '---',
      '',
      '![](/images/a.png)',
      '![](/images/a.png)',
    ].join('\n'))).toEqual(['/images/a.png#1', '/images/a.png#2'])
  })

  it('offers a bare src when the picture appears once', () => {
    expect(completionsAt([
      '---',
      'geometry:',
      '  images:',
      '    - {src: |',
      '---',
      '',
      '![](/images/a.png)',
      '![](/images/b.png)',
    ].join('\n'))).toEqual(['/images/a.png', '/images/b.png'])
  })

  it('offers the fit values the theme accepts', () => {
    expect(completionsAt([
      '---',
      'geometry:',
      '  elements:',
      '    - {id: flow, fit: |',
      '---',
      '',
      'content',
    ].join('\n'))).toEqual(['contain', 'none'])
  })

  it('narrows by what has been typed', () => {
    expect(completionsAt([
      '---',
      'geometry:',
      '  elements:',
      '    - {code: Test|',
      '---',
      '',
      '```ts [Test.java]',
      'const a = 1',
      '```',
      '',
      '```ts [Other.java]',
      'const b = 2',
      '```',
    ].join('\n'))).toEqual(['Test.java'])
  })
})
