import fs from 'node:fs'
import path from 'node:path'

// Target-directory handling for the scaffolder, kept apart from index.mjs so
// it can be tested without running the interactive CLI. Import reports are a
// project's record of every ODP import, so re-importing into the same project
// keeps them.

/** Top-level entries a re-import keeps. */
export const KEPT_ON_REIMPORT = new Set(['import-reports'])

/** The target directory's entries that would be removed, i.e. everything but the kept ones. */
export function removableEntries(dir) {
  if (!fs.existsSync(dir))
    return []
  return fs.readdirSync(dir).filter(name => !KEPT_ON_REIMPORT.has(name))
}

/** Empties `dir` except for its top-level kept entries (a nested `import-reports/` is ordinary content). */
export function emptyDir(dir, keep = KEPT_ON_REIMPORT) {
  if (!fs.existsSync(dir))
    return
  for (const file of fs.readdirSync(dir)) {
    if (keep.has(file))
      continue
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
  }
}
