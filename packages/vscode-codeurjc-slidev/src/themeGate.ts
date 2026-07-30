// Activation gate: only theme-tagged markdown documents get decorations,
// hovers, diagnostics, or CodeLens from this extension. Kept as a pure
// string-in/boolean-out function so it's testable without a real document.

const BOM = '﻿'
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const THEME_FIELD_RE = /^theme:\s*(\S+)\s*$/m

/** True if `text`'s leading YAML frontmatter declares `theme: codeurjc-slidev-theme`. */
export function usesCodeurjcSlidevTheme(text: string): boolean {
  const withoutBom = text.startsWith(BOM) ? text.slice(BOM.length) : text
  const frontmatterMatch = FRONTMATTER_RE.exec(withoutBom)
  if (!frontmatterMatch) return false
  const themeMatch = THEME_FIELD_RE.exec(frontmatterMatch[1])
  if (!themeMatch) return false
  return themeMatch[1].replace(/^['"]|['"]$/g, '') === 'codeurjc-slidev-theme'
}
