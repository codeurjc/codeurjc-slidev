// Whether to show the "several decks, the preview follows one" tip.

export interface DeckTipInput {
  /** The document that just became the active editor is a deck. */
  isDeck: boolean
  /** How many decks the project holding that document has. */
  decksInProject: number
  /** The tip was already shown in this workspace. */
  alreadyShown: boolean
  /** `codeurjcSlidev.deckDiscovery.enabled`. */
  enabled: boolean
}

export function shouldShowDeckTip(input: DeckTipInput): boolean {
  return input.enabled && input.isDeck && input.decksInProject >= 2 && !input.alreadyShown
}

export const DECK_TIP_MESSAGE
  = 'This project has several slide decks. The Slidev preview follows one deck at a time: pick it with "Choose deck…", or from the Projects view in the Slidev sidebar (the ⏵ button on a deck sets it as the active one).'
