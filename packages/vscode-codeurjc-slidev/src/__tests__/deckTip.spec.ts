import { describe, expect, it } from 'vitest'
import { shouldShowDeckTip } from '../deckTip'

const base = { isDeck: true, decksInProject: 3, alreadyShown: false, enabled: true }

describe('shouldShowDeckTip', () => {
  it('shows for the first deck opened in a multi-deck project', () => {
    expect(shouldShowDeckTip(base)).toBe(true)
  })

  it('does not show for a single-deck project', () => {
    expect(shouldShowDeckTip({ ...base, decksInProject: 1 })).toBe(false)
  })

  it('does not show for a document that is not a deck', () => {
    expect(shouldShowDeckTip({ ...base, isDeck: false })).toBe(false)
  })

  it('shows once per workspace', () => {
    expect(shouldShowDeckTip({ ...base, alreadyShown: true })).toBe(false)
  })

  it('is silenced by the setting', () => {
    expect(shouldShowDeckTip({ ...base, enabled: false })).toBe(false)
  })
})
