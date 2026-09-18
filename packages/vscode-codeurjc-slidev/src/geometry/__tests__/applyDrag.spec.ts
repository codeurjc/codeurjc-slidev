import type { TextEdit } from '../quickFixes'
import { describe, expect, it } from 'vitest'
import { applyDrag } from '../applyDrag'

function applyEdits(text: string, edits: TextEdit[]): string {
  const lines = text.split('\n')
  for (const e of [...edits].sort((a, b) => (b.startLine - a.startLine) || (b.startChar - a.startChar))) {
    const l = lines[e.startLine]
    lines[e.startLine] = l.slice(0, e.startChar) + e.newText + l.slice(e.endChar)
  }
  return lines.join('\n')
}

const DECK = [
  '---',
  'theme: codeurjc-slidev-theme',
  '---',
  '',
  '# Cover',
  '',
  '---',
  'geometry:',
  '  content: {x: 31, y: 98, w: 400, h: 424}',
  '  elements:',
  '    - {id: flow, x: 500, y: 150, w: 400, h: 200}  # the diagram',
  '    - {code: Test.java, x: 31, y: 300, w: 300, h: 100}',
  '  images:',
  '    - {src: /images/a.png, x: 600, y: 400, w: 100, h: 100}',
  '---',
  '',
  '# Two',
  '',
  '```mermaid {id: \'flow\'}',
  'graph LR',
  '```',
  '',
  '![](/images/a.png)',
  '',
].join('\n')

const move = (key: object, from: object, to: object, slideNo = 2) => ({ slideNo, key, from, to }) as Parameters<typeof applyDrag>[1]

describe('applyDrag', () => {
  it('replaces the entry\'s rect, located by its key', () => {
    const outcome = applyDrag(DECK, move({ kind: 'id', name: 'flow' }, { x: 500, y: 150, w: 400, h: 200 }, { x: 300, y: 160, w: 400, h: 200 }))
    expect(outcome.kind).toBe('apply')
    if (outcome.kind !== 'apply')
      return
    expect(outcome.stale).toBe(false)
    const applied = applyEdits(DECK, outcome.edits)
    expect(applied).toContain('- {id: flow, x: 300, y: 160, w: 400, h: 200}  # the diagram')
    // Only the dragged entry changes; formatting and comments stay.
    expect(applied.split('\n').filter((l, i) => l !== DECK.split('\n')[i])).toHaveLength(1)
  })

  it('locates content, code and image keys', () => {
    const cases = [
      { key: { kind: 'content' }, to: { x: 1, y: 98, w: 400, h: 424 }, expected: 'content: {x: 1, y: 98, w: 400, h: 424}' },
      { key: { kind: 'code', text: 'Test.java' }, to: { x: 1, y: 300, w: 300, h: 100 }, expected: '{code: Test.java, x: 1, y: 300, w: 300, h: 100}' },
      { key: { kind: 'image', ref: '/images/a.png' }, to: { x: 1, y: 400, w: 100, h: 100 }, expected: '{src: /images/a.png, x: 1, y: 400, w: 100, h: 100}' },
    ]
    for (const { key, to, expected } of cases) {
      const moved = applyDrag(DECK, move(key, { ...to, x: 999 }, to))
      expect(moved.kind).toBe('apply')
      if (moved.kind === 'apply')
        expect(applyEdits(DECK, moved.edits)).toContain(expected)
    }
  })

  it('applies anyway when the buffer\'s rect differs from the one dragged from', () => {
    // The author typed x: 520 without saving; the preview still showed 500.
    const edited = DECK.replace('{id: flow, x: 500', '{id: flow, x: 520')
    const outcome = applyDrag(edited, move({ kind: 'id', name: 'flow' }, { x: 500, y: 150, w: 400, h: 200 }, { x: 300, y: 150, w: 400, h: 200 }))
    expect(outcome.kind).toBe('apply')
    if (outcome.kind !== 'apply')
      return
    expect(outcome.stale).toBe(true)
    expect(applyEdits(edited, outcome.edits)).toContain('{id: flow, x: 300, y: 150')
  })

  it('reports an entry that is no longer in the document', () => {
    const removed = DECK.replace('    - {id: flow, x: 500, y: 150, w: 400, h: 200}  # the diagram\n', '')
    expect(applyDrag(removed, move({ kind: 'id', name: 'flow' }, { x: 500, y: 150, w: 400, h: 200 }, { x: 1, y: 1, w: 1, h: 1 }))).toEqual({ kind: 'gone' })
  })

  it('reports drift when the entry now sits on a different slide', () => {
    // An unsaved slide inserted above: the preview's slide 2 is now slide 3.
    const inserted = DECK.replace('# Cover\n', '# Cover\n\n---\n\n# Inserted\n')
    expect(applyDrag(inserted, move({ kind: 'id', name: 'flow' }, { x: 500, y: 150, w: 400, h: 200 }, { x: 1, y: 1, w: 1, h: 1 })))
      .toEqual({ kind: 'drift', foundOnSlide: 3 })
  })

  it('makes no edit when the rect is already where the drag put it', () => {
    const outcome = applyDrag(DECK, move({ kind: 'id', name: 'flow' }, { x: 500, y: 150, w: 400, h: 200 }, { x: 500, y: 150, w: 400, h: 200 }))
    expect(outcome).toEqual({ kind: 'apply', edits: [], stale: false })
  })

  it('names a positional image entry by the src of the image it resolves to', () => {
    const positional = DECK.replace('    - {src: /images/a.png, x: 600', '    - {x: 600')
    const outcome = applyDrag(positional, move({ kind: 'image', ref: '/images/a.png' }, { x: 600, y: 400, w: 100, h: 100 }, { x: 10, y: 400, w: 100, h: 100 }))
    expect(outcome.kind).toBe('apply')
    if (outcome.kind === 'apply')
      expect(applyEdits(positional, outcome.edits)).toContain('- {x: 10, y: 400, w: 100, h: 100}')
  })

  it('works on block-style entries too', () => {
    const block = DECK.replace('    - {id: flow, x: 500, y: 150, w: 400, h: 200}  # the diagram', '    - id: flow\n      x: 500\n      y: 150\n      w: 400\n      h: 200')
    const outcome = applyDrag(block, move({ kind: 'id', name: 'flow' }, { x: 500, y: 150, w: 400, h: 200 }, { x: 250, y: 150, w: 400, h: 200 }))
    expect(outcome.kind).toBe('apply')
    if (outcome.kind === 'apply')
      expect(applyEdits(block, outcome.edits)).toContain('      x: 250\n      y: 150')
  })
})
