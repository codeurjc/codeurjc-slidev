// Real fs/path wiring around the pure index builder: enumerates a workspace
// folder's theme-tagged markdown files and resolves a `<<<` import's `@/...`
// path to an absolute target path using the theme's own code-root convention.

import type { PathEntry } from '../pathCompletion'
import type { ResolveImportPath } from './indexBuilder'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { DEFAULT_CODE_ROOT, isWithinCodeRoot } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { usesCodeurjcSlidevTheme } from '../themeGate'

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.e2e-worker'])

/** Recursively finds every `.md` file under `root`, skipping common non-content directories. */
export function findMarkdownFiles(root: string): string[] {
  const results: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (IGNORED_DIRS.has(entry))
        continue
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory())
        walk(full)
      else if (entry.endsWith('.md'))
        results.push(full)
    }
  }
  walk(root)
  return results
}

/** Reads every theme-tagged markdown file under `root` into a `{path: text}` map, suitable for `buildReferenceIndex`. */
export function readThemeTaggedMarkdownFiles(root: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (const path of findMarkdownFiles(root)) {
    const text = readFileSync(path, 'utf-8')
    if (usesCodeurjcSlidevTheme(text))
      files[path] = text
  }
  return files
}

/**
 * Resolves a `<<<` import's file path to an absolute path, mirroring the
 * theme's own convention (`setup/transformers.ts`'s unexported
 * `resolveImportPath`): an `@/...` path resolves against `projectRoot`,
 * anything else resolves against the importing markdown file's own
 * directory.
 */
export function resolveImportAbsPath(importFilePath: string, mdPath: string, projectRoot: string): string {
  const abs = importFilePath.startsWith('@/')
    ? resolve(projectRoot, importFilePath.slice(2))
    : resolve(dirname(mdPath), importFilePath)
  return abs.split(sep).join('/')
}

/** Resolves a `<<<` import's file path plus whether it escapes the code root -- an escape is a warning, not a hard failure (the theme still reads/renders the file). */
export function resolveImportTarget(importFilePath: string, mdPath: string, projectRoot: string, codeRoot: string = DEFAULT_CODE_ROOT): { absPath: string, escapesCodeRoot: boolean } {
  const absPath = resolveImportAbsPath(importFilePath, mdPath, projectRoot)
  const normalizedRoot = projectRoot.split(sep).join('/')
  return { absPath, escapesCodeRoot: !isWithinCodeRoot(absPath, normalizedRoot, codeRoot) }
}

/** Resolves a `<<<` import's `@/...` path against `projectRoot`/`codeRoot`, the same convention `isWithinCodeRoot` checks. Warns (rather than throws) and returns null if the resolved path escapes the code root -- used only for the reference index, which simply skips indexing an out-of-bounds target rather than surfacing a diagnostic (the active-buffer diagnostic for this lives in `importAnalysis.ts`/`resolveImportTarget` above). */
export function makeResolveImportPath(projectRoot: string, codeRoot: string = DEFAULT_CODE_ROOT, warn: (message: string) => void = m => console.warn(m)): ResolveImportPath {
  return (mdPath, importFilePath) => {
    const { absPath, escapesCodeRoot } = resolveImportTarget(importFilePath, mdPath, projectRoot, codeRoot)
    if (escapesCodeRoot) {
      warn(`[vscode-codeurjc-slidev] import path escapes the code root: ${importFilePath}`)
      return null
    }
    return absPath
  }
}

/** Lists the entries of `<projectRoot>/<codeRoot>/<dirRelPath>`, for `<<< @/...` path completion -- one directory level at a time (unlike `findMarkdownFiles`'s full recursive walk). Returns an empty list for a directory that doesn't exist, rather than throwing. */
export function listCodeRootDirectory(projectRoot: string, dirRelPath: string, codeRoot: string = DEFAULT_CODE_ROOT): PathEntry[] {
  const absDir = join(projectRoot, codeRoot, dirRelPath)
  try {
    return readdirSync(absDir, { withFileTypes: true })
      .filter(entry => !IGNORED_DIRS.has(entry.name))
      .map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() }))
  }
  catch {
    return []
  }
}

/** Finds the nearest ancestor directory of `mdFilePath` that looks like a project root (contains a `code/` directory or a package.json), falling back to the file's own directory. */
export function findProjectRoot(mdFilePath: string, codeRoot: string = DEFAULT_CODE_ROOT): string {
  let dir = dirname(mdFilePath)
  while (true) {
    try {
      if (statSync(join(dir, codeRoot)).isDirectory())
        return dir
    }
    catch { /* no code root here, keep walking up */ }
    try {
      if (statSync(join(dir, 'package.json')).isFile())
        return dir
    }
    catch { /* no package.json here either */ }
    const parent = dirname(dir)
    if (parent === dir)
      return dirname(mdFilePath)
    dir = parent
  }
}
