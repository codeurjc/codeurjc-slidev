// Maps a geometry field path -- `geometry.elements[2].id`, `geometry.content`,
// `geometry.images[0].w` -- onto the document range that wrote it, so a
// diagnostic underlines the offending field rather than the whole frontmatter
// block.
//
// The theme's warnings already name their field in exactly that path form
// (`parseSlideGeometry` builds them as `geometry.images[0].x must be a
// number`), so a diagnostic is produced by pulling the path out of the
// warning text and resolving it here. Anything that doesn't resolve falls back
// to a coarser range: the entry, then the `geometry` key, then the slide's
// first line -- a diagnostic in roughly the right place beats none.

import type { Node } from 'yaml'
import { isMap, isSeq, parseDocument } from 'yaml'

export interface DocRange {
  /** 0-based document line. */
  startLine: number
  startChar: number
  endLine: number
  endChar: number
}

/** A parsed slide frontmatter, ready to resolve field paths against. */
export interface FrontmatterIndex {
  /** Resolves a dotted/indexed path to a document range, else null. */
  rangeOf: (path: string) => DocRange | null
  /** The parsed frontmatter as plain JS, for handing to the theme's own parsers. */
  data: Record<string, unknown> | null
}

/** Splits `geometry.elements[2].id` into `['geometry', 'elements', 2, 'id']`. */
export function splitFieldPath(path: string): (string | number)[] {
  const parts: (string | number)[] = []
  for (const segment of path.split('.')) {
    const m = /^([^[\]]*)((?:\[\d+\])*)$/.exec(segment)
    if (!m)
      return parts
    if (m[1])
      parts.push(m[1])
    for (const index of m[2].matchAll(/\[(\d+)\]/g))
      parts.push(Number(index[1]))
  }
  return parts
}

/**
 * Indexes a slide's raw frontmatter. `frontmatterStartLine` is the 0-based
 * document line the frontmatter's first content line sits on (the line after
 * its opening `---`), so ranges come back document-absolute.
 */
export function indexFrontmatter(frontmatter: string, frontmatterStartLine: number): FrontmatterIndex {
  let doc
  try {
    doc = parseDocument(frontmatter, { keepSourceTokens: true })
  }
  catch {
    return { rangeOf: () => null, data: null }
  }

  const offsets = lineOffsets(frontmatter)
  const toRange = (range: [number, number, number] | null | undefined): DocRange | null => {
    if (!range)
      return null
    const [start, end] = range
    const from = positionAt(offsets, start)
    const to = positionAt(offsets, end)
    return {
      startLine: from.line + frontmatterStartLine,
      startChar: from.char,
      endLine: to.line + frontmatterStartLine,
      endChar: to.char,
    }
  }

  const rangeOf = (path: string): DocRange | null => {
    const parts = splitFieldPath(path)
    if (parts.length === 0)
      return null
    let node: unknown = doc.contents
    let best: DocRange | null = null
    for (const part of parts) {
      const next = childNode(node, part)
      if (!next)
        return best
      node = next
      best = toRange((next as Node).range) ?? best
    }
    return best
  }

  let data: Record<string, unknown> | null = null
  try {
    const json = doc.toJS({ maxAliasCount: 100 })
    data = json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : null
  }
  catch {
    data = null
  }

  return { rangeOf, data }
}

function childNode(node: unknown, part: string | number): unknown {
  if (typeof part === 'number')
    return isSeq(node) ? node.items[part] : null
  if (!isMap(node))
    return null
  const pair = node.items.find(p => String((p.key as { value?: unknown })?.value ?? '') === part)
  return pair?.value ?? null
}

export function lineOffsets(text: string): number[] {
  const offsets = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n')
      offsets.push(i + 1)
  }
  return offsets
}

export function positionAt(offsets: number[], offset: number): { line: number, char: number } {
  let low = 0
  let high = offsets.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (offsets[mid] <= offset)
      low = mid
    else high = mid - 1
  }
  return { line: low, char: offset - offsets[low] }
}
