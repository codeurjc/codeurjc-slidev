// Builds, from a set of theme-tagged markdown documents, a "recipe" per
// target file: which slide file/anchor-line/selector combinations reference
// it. Deliberately does NOT read target files or resolve absolute line
// numbers here -- that's deferred to codeLens.ts, which resolves against a
// target file's *live* editor content on demand, so the index never goes
// stale when only the target file (not the markdown) changes.

import type { SnippetSelector } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { parseSnippetSelector } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { findImportBlocks } from '../documentScan'

export interface ImportRecipe {
  slideFile: string
  /** 0-based document line of the anchor declaration in `slideFile`. */
  slideLine: number
  selector: SnippetSelector | null
  anchorLineText: string
}

export type ReferenceIndex = Map<string, ImportRecipe[]>

/** Resolves a `<<<` import's `@/...` file path against the markdown file that contains it, to the target's identity in the index (an absolute path, or any other stable key the caller's own resolver produces). */
export type ResolveImportPath = (mdPath: string, importFilePath: string) => string | null

/** Builds the recipe index from `files` (mdPath -> full text); only anchor directives are indexed (source directives carry no target-line reference). */
export function buildReferenceIndex(files: Record<string, string>, resolveImportPath: ResolveImportPath): ReferenceIndex {
  const index: ReferenceIndex = new Map()

  for (const [mdPath, text] of Object.entries(files)) {
    for (const block of findImportBlocks(text)) {
      const targetAbsPath = resolveImportPath(mdPath, block.parsed.filePath)
      if (!targetAbsPath)
        continue
      const selector = block.parsed.selectorRaw ? parseSnippetSelector(block.parsed.selectorRaw) : null
      if (block.parsed.selectorRaw && !selector)
        continue // malformed selector: skip, diagnostics already cover this

      for (const directive of block.directives) {
        if (directive.kind !== 'anchor')
          continue
        const recipe: ImportRecipe = { slideFile: mdPath, slideLine: directive.line, selector, anchorLineText: directive.text }
        const existing = index.get(targetAbsPath)
        if (existing)
          existing.push(recipe)
        else index.set(targetAbsPath, [recipe])
      }
    }
  }

  return index
}

/** Removes every recipe contributed by `mdPath`, then re-adds whatever `buildReferenceIndex` produces for `{ [mdPath]: text }` -- used to keep the index current when a single markdown file changes, without rescanning the rest of the workspace. */
export function updateReferenceIndexForFile(index: ReferenceIndex, mdPath: string, text: string, resolveImportPath: ResolveImportPath): ReferenceIndex {
  for (const [targetAbsPath, recipes] of index) {
    const filtered = recipes.filter(r => r.slideFile !== mdPath)
    if (filtered.length === 0)
      index.delete(targetAbsPath)
    else index.set(targetAbsPath, filtered)
  }

  const additions = buildReferenceIndex({ [mdPath]: text }, resolveImportPath)
  for (const [targetAbsPath, recipes] of additions) {
    const existing = index.get(targetAbsPath)
    if (existing)
      existing.push(...recipes)
    else index.set(targetAbsPath, recipes)
  }

  return index
}
