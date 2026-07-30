// Activation gate: only theme-tagged markdown documents get decorations,
// hovers, diagnostics, or CodeLens from this extension. Kept as a pure
// string-in/boolean-out function so it's testable without a real document.

const BOM = '﻿'
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** Reads a scalar top-level field out of `text`'s leading YAML frontmatter, or null if there's no frontmatter or no such field. Unquotes a quoted value. */
export function parseFrontmatterField(text: string, field: string): string | null {
  const withoutBom = text.startsWith(BOM) ? text.slice(BOM.length) : text
  const frontmatterMatch = FRONTMATTER_RE.exec(withoutBom)
  if (!frontmatterMatch) return null
  const fieldRe = new RegExp(`^${field}:\\s*(\\S+)\\s*$`, 'm')
  const fieldMatch = fieldRe.exec(frontmatterMatch[1])
  if (!fieldMatch) return null
  return fieldMatch[1].replace(/^['"]|['"]$/g, '')
}

/** True if `text`'s leading YAML frontmatter declares `theme: codeurjc-slidev-theme`. */
export function usesCodeurjcSlidevTheme(text: string): boolean {
  return parseFrontmatterField(text, 'theme') === 'codeurjc-slidev-theme'
}
