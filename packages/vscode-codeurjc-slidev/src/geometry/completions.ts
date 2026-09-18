// Completions for a `geometry` entry's keys, drawn from the slide the entry
// belongs to.
//
// `geometry.elements` matches its target by a stable key only -- never by
// position -- so every entry is a string that has to match exactly, with no
// fallback. That is a deliberate design with a brutal authoring experience
// unless the keys can be offered rather than typed, which is what this does.
//
// Pure: takes document text and a cursor, returns plain data. The `vscode`
// adapter turns it into CompletionItems.

import type { SlideCandidates } from './candidates'
import { formatImageRef, imageRefFor } from 'codeurjc-slidev-theme/composables/useImageRefs'
import { slideAt, splitSlides } from '../documentScan'
import { collectSlideCandidates } from './candidates'

export type GeometryCompletionKey = 'code' | 'id' | 'src' | 'image' | 'fit'

export interface GeometryCompletion {
  /** The text to insert. */
  value: string
  /** A short description of where the value came from, for the completion's detail line. */
  detail: string
}

export interface GeometryCompletionContext {
  key: GeometryCompletionKey
  /** What the author has typed after the key so far, trimmed. */
  typed: string
  /** 1-based slide number the entry belongs to. */
  slideNo: number
}

/** The geometry key whose value the cursor sits in, e.g. `- {id: fl|`. */
const KEY_AT_CURSOR_RE = /\b(code|id|src|image|fit)\s*:([^,}]*)$/

/**
 * Whether the cursor sits inside a `geometry` entry's key value, and which
 * key. Returns null anywhere else -- including inside a fence's `{id: '…'}`
 * option, which is content rather than frontmatter.
 */
export function geometryCompletionContext(text: string, line: number, character: number): GeometryCompletionContext | null {
  const slides = splitSlides(text)
  const slide = slideAt(slides, line)
  if (!slide)
    return null
  // Only inside the slide's own frontmatter, and only under a `geometry:` key.
  const frontmatterStart = slide.startLine + 1
  const frontmatterEnd = slide.contentStartLine - 1
  if (line < frontmatterStart || line >= frontmatterEnd)
    return null
  const lines = text.split('\n')
  const geometryLine = lines.slice(frontmatterStart, frontmatterEnd).findIndex(l => /^geometry\s*:/.test(l))
  if (geometryLine < 0 || line <= frontmatterStart + geometryLine)
    return null

  const match = KEY_AT_CURSOR_RE.exec(lines[line]?.slice(0, character) ?? '')
  if (!match)
    return null
  // The value may be quoted; strip quotes and whitespace rather than letting
  // the pattern do it, which would let its parts trade characters.
  const typed = match[2].trim().replace(/^["']|["']$/g, '')
  return { key: match[1] as GeometryCompletionKey, typed, slideNo: slide.no }
}

/** The values offered for `context.key`, filtered by what has been typed. */
export function geometryCompletions(text: string, context: GeometryCompletionContext): GeometryCompletion[] {
  if (context.key === 'fit') {
    return filterBy([
      { value: 'contain', detail: 'scale to fit the box, centred (default)' },
      { value: 'none', detail: 'natural size at the box\'s top-left' },
    ], context.typed)
  }

  const slide = splitSlides(text).find(s => s.no === context.slideNo)
  if (!slide)
    return []
  const candidates = collectSlideCandidates(text, slide)

  switch (context.key) {
    case 'code':
      return filterBy(codeValues(candidates), context.typed)
    case 'id':
      return filterBy(idValues(candidates), context.typed)
    case 'src':
    case 'image':
      return filterBy(imageValues(candidates), context.typed)
  }
}

/** A `code:` entry matches an import by its path as written, else a non-import fence by its title. */
function codeValues(candidates: SlideCandidates): GeometryCompletion[] {
  const values: GeometryCompletion[] = []
  for (const c of candidates.candidates) {
    if (c.kind !== 'code')
      continue
    if (c.importPath)
      values.push({ value: c.importPath, detail: 'imported snippet' })
    else if (c.title)
      values.push({ value: c.title, detail: 'code block title' })
  }
  return dedupe(values)
}

function idValues(candidates: SlideCandidates): GeometryCompletion[] {
  const values: GeometryCompletion[] = []
  for (const c of candidates.candidates) {
    if (c.id)
      values.push({ value: c.id, detail: `${c.kind} block` })
    if (c.wrapperId)
      values.push({ value: c.wrapperId, detail: `<div> around a ${c.kind}` })
  }
  return dedupe(values)
}

/**
 * Image references in the shortest unambiguous form -- a bare src, or `src#N`
 * when the picture is shown more than once -- which is exactly what the
 * theme's own writers produce.
 */
function imageValues(candidates: SlideCandidates): GeometryCompletion[] {
  return dedupe(candidates.srcs.map((_, i) => {
    const ref = imageRefFor(candidates.srcs, i)
    return {
      value: String(formatImageRef(ref)),
      detail: ref.kind === 'src' && ref.occurrence ? `occurrence ${ref.occurrence} of this src` : 'slide image',
    }
  }))
}

function dedupe(values: GeometryCompletion[]): GeometryCompletion[] {
  const seen = new Set<string>()
  return values.filter(v => (seen.has(v.value) ? false : (seen.add(v.value), true)))
}

function filterBy(values: GeometryCompletion[], typed: string): GeometryCompletion[] {
  if (!typed)
    return values
  const lower = typed.toLowerCase()
  return values.filter(v => v.value.toLowerCase().includes(lower))
}
