// Pure planning of the `slidev.include` value that registers a project's decks
// with the Slidev extension, and of when to offer it. Paths are relative to a
// workspace folder, with `/` separators.

/**
 * Escapes a path for VS Code's glob syntax, which has no backslash escape:
 * a metacharacter is matched literally by wrapping it in a character class.
 */
export function escapeGlobPath(path: string): string {
  return path.replace(/[*?[\]{}]/g, ch => `[${ch}]`)
}

/** The decks no registered path covers, in their input order. */
export function missingDecks(decks: string[], registered: ReadonlySet<string>): string[] {
  return decks.filter(deck => !registered.has(deck))
}

/**
 * The new `slidev.include`: the missing decks first (the last edited one, when
 * it is among them, then the rest alphabetically), each escaped as a literal
 * path, followed by every entry the setting already had. The Slidev extension
 * breaks ties between equally shallow entries by this order, so the first deck
 * is the one it activates by default.
 */
export function planInclude(missing: string[], lastEdited: string | undefined, existing: string[]): string[] {
  const rest = missing.filter(deck => deck !== lastEdited).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const ordered = lastEdited !== undefined && missing.includes(lastEdited) ? [lastEdited, ...rest] : rest
  const escaped = ordered.map(escapeGlobPath)
  return [...escaped, ...existing.filter(entry => !escaped.includes(entry))]
}

/** A stable key for a set of missing decks, so a declined offer isn't repeated for the same set. */
export function deckSetKey(missing: string[]): string {
  return [...missing].sort().join('\n')
}

/** Whether to offer registration: something is missing, and this exact set wasn't declined before. */
export function shouldOfferRegistration(missing: string[], declinedKey: string | undefined): boolean {
  return missing.length > 0 && deckSetKey(missing) !== declinedKey
}
