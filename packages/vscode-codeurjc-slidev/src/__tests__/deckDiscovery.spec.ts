import { describe, expect, it } from 'vitest'
import { classifyDocument, groupDecksByProject } from '../deckDiscovery'

const themed = (extra = '') => `---\ntheme: codeurjc-slidev-theme\n${extra}---\n\n# T\n`

describe('classifyDocument', () => {
  it('finds a deck by its theme, whatever it is named', () => {
    expect(classifyDocument('/p/tema1.md', themed())).toBe('deck')
  })

  it('does not treat a marked comparison deck as a deck', () => {
    expect(classifyDocument('/p/tema1-comparison.md', themed('comparisonDeck: true\n'))).toBe('comparison')
    expect(classifyDocument('/p/anything.md', themed('comparisonDeck: true\n'))).toBe('comparison')
  })

  it('recognises an older comparison deck by name', () => {
    expect(classifyDocument('/p/comparison.md', themed())).toBe('comparison')
    expect(classifyDocument('/p/tema1-comparison.md', themed())).toBe('comparison')
    expect(classifyDocument('C:\\p\\tema1-comparison.md', themed())).toBe('comparison')
  })

  it('does not mistake a deck merely containing "comparison" in its name', () => {
    expect(classifyDocument('/p/comparisons.md', themed())).toBe('deck')
    expect(classifyDocument('/p/my-comparison-of-x.md', themed())).toBe('deck')
  })

  it('lets an explicit comparisonDeck: false override the name', () => {
    expect(classifyDocument('/p/comparison.md', themed('comparisonDeck: false\n'))).toBe('deck')
  })

  it('ignores markdown without the theme', () => {
    expect(classifyDocument('/p/README.md', '# Readme\n')).toBe('other')
    expect(classifyDocument('/p/x.md', '---\ntheme: seriph\n---\n')).toBe('other')
  })
})

describe('groupDecksByProject', () => {
  it('groups by project root, keeping order within a group', () => {
    const groups = groupDecksByProject(['/a/x.md', '/b/y.md', '/a/z.md'], p => p.slice(0, 2))
    expect([...groups.entries()]).toEqual([['/a', ['/a/x.md', '/a/z.md']], ['/b', ['/b/y.md']]])
  })
})
