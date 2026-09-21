import fs from 'node:fs'
import path from 'node:path'

// `.vscode/extensions.json` for a scaffolded project: recommends the extensions
// that make VS Code understand its decks. Kept apart from index.mjs so it can be
// tested without running the interactive CLI.

export const RECOMMENDED_EXTENSIONS = ['codeurjc.vscode-codeurjc-slidev', 'antfu.slidev']

const EXTENSIONS_FILE = path.join('.vscode', 'extensions.json')

/** Removes `//` and block comments outside strings, so a commented file can be parsed. Returns `hadComments` when any was removed. */
function stripComments(text) {
  let out = ''
  let hadComments = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"')
        j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    }
    else if (ch === '/' && text[i + 1] === '/') {
      hadComments = true
      while (i < text.length && text[i] !== '\n')
        i++
    }
    else if (ch === '/' && text[i + 1] === '*') {
      hadComments = true
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
    }
    else {
      out += ch
      i++
    }
  }
  return { text: out, hadComments }
}

/**
 * Makes sure `<root>/.vscode/extensions.json` recommends the extensions, adding
 * only what is missing and keeping every other key. Returns what happened:
 * 'created', 'updated', 'unchanged', or 'skipped' (with a `reason`) when the
 * file can't be edited without losing something: it isn't valid JSON, isn't an
 * object, or has comments that rewriting would drop.
 */
export function ensureExtensionRecommendations(root, wanted = RECOMMENDED_EXTENSIONS) {
  const file = path.join(root, EXTENSIONS_FILE)
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify({ recommendations: wanted }, null, 2)}\n`)
    return { status: 'created', file }
  }

  const { text, hadComments } = stripComments(fs.readFileSync(file, 'utf-8'))
  let parsed
  try {
    // A trailing comma is common in hand-edited JSONC.
    parsed = JSON.parse(text.replace(/,(\s*[}\]])/g, '$1'))
  }
  catch {
    return { status: 'skipped', file, reason: 'it is not valid JSON' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    return { status: 'skipped', file, reason: 'it is not a JSON object' }
  if (parsed.recommendations !== undefined && !Array.isArray(parsed.recommendations))
    return { status: 'skipped', file, reason: '"recommendations" is not a list' }

  const current = parsed.recommendations ?? []
  const missing = wanted.filter(id => !current.includes(id))
  if (missing.length === 0)
    return { status: 'unchanged', file }
  if (hadComments)
    return { status: 'skipped', file, reason: 'it has comments that rewriting would drop', missing }

  fs.writeFileSync(file, `${JSON.stringify({ ...parsed, recommendations: [...current, ...missing] }, null, 2)}\n`)
  return { status: 'updated', file, missing }
}
