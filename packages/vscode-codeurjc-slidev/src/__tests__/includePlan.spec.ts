import { describe, expect, it } from 'vitest'
import { deckSetKey, escapeGlobPath, missingDecks, planInclude, shouldOfferRegistration } from '../includePlan'

describe('planInclude', () => {
  it('lists missing decks in front of the existing entries', () => {
    expect(planInclude(['tema2.md', 'tema1.md'], undefined, ['**/slides.md'])).toEqual(['tema1.md', 'tema2.md', '**/slides.md'])
  })

  it('puts the last edited deck first, the rest alphabetical', () => {
    expect(planInclude(['tema1.md', 'tema2.md', 'tema3.md'], 'tema2.md', [])).toEqual(['tema2.md', 'tema1.md', 'tema3.md'])
  })

  it('ignores a last edited deck that is not being written', () => {
    expect(planInclude(['a.md', 'b.md'], 'zzz.md', [])).toEqual(['a.md', 'b.md'])
  })

  it('keeps nested paths relative to the folder', () => {
    expect(planInclude(['projects/AIS/2.md', 'projects/AIS/1.md'], undefined, ['**/slides.md'])).toEqual(['projects/AIS/1.md', 'projects/AIS/2.md', '**/slides.md'])
  })

  it('does not duplicate an entry the setting already has', () => {
    expect(planInclude(['a.md'], undefined, ['a.md', '**/slides.md'])).toEqual(['a.md', '**/slides.md'])
  })
})

describe('escapeGlobPath', () => {
  it('leaves an ordinary path alone', () => {
    expect(escapeGlobPath('projects/AIS/1-introduccion.md')).toBe('projects/AIS/1-introduccion.md')
  })

  it('wraps glob metacharacters in a character class', () => {
    expect(escapeGlobPath('a[1]/b{x}*?.md')).toBe('a[[]1[]]/b[{]x[}][*][?].md')
  })
})

describe('missingDecks / shouldOfferRegistration', () => {
  it('finds the decks nothing registers', () => {
    expect(missingDecks(['a.md', 'b.md'], new Set(['a.md']))).toEqual(['b.md'])
    expect(missingDecks(['a.md'], new Set(['a.md']))).toEqual([])
  })

  it('offers when something is missing and that set was not declined', () => {
    expect(shouldOfferRegistration(['a.md', 'b.md'], undefined)).toBe(true)
  })

  it('does not offer again for a declined set, whatever its order', () => {
    const declined = deckSetKey(['b.md', 'a.md'])
    expect(shouldOfferRegistration(['a.md', 'b.md'], declined)).toBe(false)
  })

  it('offers again when the set changes', () => {
    const declined = deckSetKey(['a.md', 'b.md'])
    expect(shouldOfferRegistration(['a.md', 'b.md', 'c.md'], declined)).toBe(true)
  })

  it('never offers with nothing missing', () => {
    expect(shouldOfferRegistration([], undefined)).toBe(false)
  })
})
