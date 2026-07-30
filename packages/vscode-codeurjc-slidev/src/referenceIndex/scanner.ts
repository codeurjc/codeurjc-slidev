// Real fs/path wiring around the pure index builder: enumerates a workspace
// folder's theme-tagged markdown files and resolves a `<<<` import's `@/...`
// path to an absolute target path using the theme's own code-root convention.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname, sep } from 'node:path'
import { DEFAULT_CODE_ROOT, isWithinCodeRoot } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { usesCodeurjcSlidevTheme } from '../themeGate'
import type { ResolveImportPath } from './indexBuilder'

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.e2e-worker'])

/** Recursively finds every `.md` file under `root`, skipping common non-content directories. */
export function findMarkdownFiles(root: string): string[] {
  const results: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (IGNORED_DIRS.has(entry)) continue
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) walk(full)
      else if (entry.endsWith('.md')) results.push(full)
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
    if (usesCodeurjcSlidevTheme(text)) files[path] = text
  }
  return files
}

/** Resolves a `<<<` import's `@/...` path against `projectRoot`/`codeRoot`, the same convention `isWithinCodeRoot` checks. Warns (rather than throws) and returns null if the resolved path escapes the code root. */
export function makeResolveImportPath(projectRoot: string, codeRoot: string = DEFAULT_CODE_ROOT, warn: (message: string) => void = (m) => console.warn(m)): ResolveImportPath {
  return (_mdPath, importFilePath) => {
    const relPath = importFilePath.replace(/^@\//, '')
    const absPath = resolve(projectRoot, relPath).split(sep).join('/')
    const normalizedRoot = projectRoot.split(sep).join('/')
    if (!isWithinCodeRoot(absPath, normalizedRoot, codeRoot)) {
      warn(`[vscode-codeurjc-slidev] import path escapes the code root: ${importFilePath}`)
      return null
    }
    return absPath
  }
}

/** Finds the nearest ancestor directory of `mdFilePath` that looks like a project root (contains a `code/` directory or a package.json), falling back to the file's own directory. */
export function findProjectRoot(mdFilePath: string, codeRoot: string = DEFAULT_CODE_ROOT): string {
  let dir = dirname(mdFilePath)
  while (true) {
    try {
      if (statSync(join(dir, codeRoot)).isDirectory()) return dir
    } catch { /* no code root here, keep walking up */ }
    try {
      if (statSync(join(dir, 'package.json')).isFile()) return dir
    } catch { /* no package.json here either */ }
    const parent = dirname(dir)
    if (parent === dir) return dirname(mdFilePath)
    dir = parent
  }
}
