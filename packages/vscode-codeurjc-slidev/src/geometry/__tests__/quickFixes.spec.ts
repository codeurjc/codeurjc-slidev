import type { TextEdit } from '../quickFixes'
import { describe, expect, it } from 'vitest'
import { geometryQuickFixes } from '../quickFixes'

/** Applies edits to `text`, last-first so earlier offsets stay valid. */
function applyEdits(text: string, edits: TextEdit[]): string {
  const lines = text.split('\n')
  const ordered = [...edits].sort((a, b) => (b.startLine - a.startLine) || (b.startChar - a.startChar))
  for (const e of ordered) {
    if (e.startLine === e.endLine) {
      const l = lines[e.startLine] ?? ''
      lines[e.startLine] = l.slice(0, e.startChar) + e.newText + l.slice(e.endChar)
    }
  }
  return lines.join('\n')
}

const lineOf = (text: string, needle: string) => text.split('\n').findIndex(l => l.includes(needle))

describe('geometryQuickFixes: an id that matches nothing', () => {
  const text = [
    '---',
    'geometry:',
    '  elements:',
    '    - {id: flow, x: 10, y: 10, w: 100, h: 100}',
    '---',
    '',
    '```mermaid',
    'flowchart LR',
    '```',
  ].join('\n')

  it('offers to add the id to the slide\'s fence', () => {
    const fixes = geometryQuickFixes(text, lineOf(text, '- {id: flow'))
    expect(fixes).toHaveLength(1)
    expect(fixes[0].title).toContain('Add {id: \'flow\'}')
  })

  it('writes the id quoted, since an unquoted id never lands on the element', () => {
    const fixes = geometryQuickFixes(text, lineOf(text, '- {id: flow'))
    expect(applyEdits(text, fixes[0].edits)).toContain('```mermaid {id: \'flow\'}')
  })

  it('merges into an existing options object rather than adding a second one', () => {
    const withOptions = text.replace('```mermaid', '```mermaid {scale: 0.8}')
    const fixes = geometryQuickFixes(withOptions, lineOf(withOptions, '- {id: flow'))
    const applied = applyEdits(withOptions, fixes[0].edits)
    expect(applied).toContain('```mermaid {scale: 0.8, id: \'flow\'}')
    expect(applied).not.toContain('} {')
  })

  it('offers nothing when the id already matches an element', () => {
    const matched = text.replace('```mermaid', '```mermaid {id: \'flow\'}')
    expect(geometryQuickFixes(matched, lineOf(matched, '- {id: flow,'))).toEqual([])
  })

  it('offers nothing on a slide whose content comes from another file', () => {
    const included = text.replace('geometry:', 'src: ./other.md\ngeometry:')
    expect(geometryQuickFixes(included, lineOf(included, '- {id: flow'))).toEqual([])
  })
})

describe('geometryQuickFixes: an unkeyed element', () => {
  const text = [
    '---',
    'layout: default',
    '---',
    '',
    '```mermaid',
    'flowchart LR',
    '```',
  ].join('\n')

  it('offers to give it an id and an entry', () => {
    const fixes = geometryQuickFixes(text, lineOf(text, '```mermaid'))
    expect(fixes).toHaveLength(1)
    expect(fixes[0].title).toBe('Position this mermaid block with geometry.elements')
  })

  it('writes both the fence id and the frontmatter entry', () => {
    const [fix] = geometryQuickFixes(text, lineOf(text, '```mermaid'))
    const applied = applyEdits(text, fix.edits)
    expect(applied).toContain('```mermaid {id: \'diagram\'}')
    expect(applied).toContain('geometry:')
    expect(applied).toContain('elements:')
    expect(applied).toContain('- {id: diagram,')
  })

  it('appends to an existing elements list rather than replacing it', () => {
    const existing = [
      '---',
      'geometry:',
      '  elements:',
      '    - {code: Test.java, x: 1, y: 2, w: 3, h: 4}',
      '---',
      '',
      '```mermaid',
      'flowchart LR',
      '```',
    ].join('\n')
    const [fix] = geometryQuickFixes(existing, lineOf(existing, '```mermaid'))
    const applied = applyEdits(existing, fix.edits)
    expect(applied).toContain('- {code: Test.java, x: 1, y: 2, w: 3, h: 4}')
    expect(applied).toContain('- {id: diagram,')
  })

  it('picks an id that is not already taken on the slide', () => {
    const taken = [
      '---',
      'layout: default',
      '---',
      '',
      '```mermaid {id: \'diagram\'}',
      'flowchart LR',
      '```',
      '',
      '```mermaid',
      'flowchart TB',
      '```',
    ].join('\n')
    // The second fence: the one with no id of its own.
    const unkeyed = taken.split('\n').findIndex(l => l === '```mermaid')
    const [fix] = geometryQuickFixes(taken, unkeyed)
    expect(fix.title).toContain('mermaid')
    expect(applyEdits(taken, fix.edits)).toContain('{id: \'diagram2\'}')
  })

  it('offers nothing for a code block already positioned by its title', () => {
    const positioned = [
      '---',
      'geometry:',
      '  elements:',
      '    - {code: Test.java, x: 1, y: 2, w: 3, h: 4}',
      '---',
      '',
      '```ts [Test.java]',
      'const a = 1',
      '```',
    ].join('\n')
    expect(geometryQuickFixes(positioned, lineOf(positioned, '```ts'))).toEqual([])
  })

  it('offers nothing for a table, which is positioned through a wrapper', () => {
    const table = [
      '---',
      'layout: default',
      '---',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n')
    expect(geometryQuickFixes(table, lineOf(table, '| a | b |'))).toEqual([])
  })
})
