// Pure deck classification and grouping. A "deck" is a markdown file a Slidev
// preview can present: it declares the theme, and isn't a comparison deck the
// ODP importer writes beside a deck. No `vscode`/fs imports, so it is testable
// on strings.

import { parseFrontmatterField, usesCodeurjcSlidevTheme } from './themeGate'

export type DocumentKind = 'deck' | 'comparison' | 'other'

const COMPARISON_NAME_RE = /(?:^|[\\/])(?:[^\\/]*-)?comparison\.md$/

/** Comparison decks generated before the `comparisonDeck` marker existed are told apart by name. */
function isComparisonName(path: string): boolean {
  return COMPARISON_NAME_RE.test(path)
}

/** Classifies a markdown file from its path and text. */
export function classifyDocument(path: string, text: string): DocumentKind {
  if (!usesCodeurjcSlidevTheme(text))
    return 'other'
  const marker = parseFrontmatterField(text, 'comparisonDeck')
  if (marker === 'true')
    return 'comparison'
  if (marker === null && isComparisonName(path))
    return 'comparison'
  return 'deck'
}

/** Groups deck paths by the project root `projectRootOf` names for each, keeping the input order within a group. */
export function groupDecksByProject(deckPaths: string[], projectRootOf: (deckPath: string) => string): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const path of deckPaths) {
    const root = projectRootOf(path)
    const group = groups.get(root)
    if (group)
      group.push(path)
    else
      groups.set(root, [path])
  }
  return groups
}
