// Pure helpers for the live link between an open deck and a running dev
// server's preview (see the theme's useInspectProtocol.ts for the channel):
// whether the server is showing this deck, reading its event stream, and which
// geometry entry the cursor is on.

import type { InspectCollection, InspectEntryRef } from 'codeurjc-slidev-theme/composables/useInspectProtocol'
import { isAbsolute, normalize, resolve } from 'node:path'
import { slideAt, splitSlides } from '../documentScan'
import { indexFrontmatter } from './frontmatterRanges'

/**
 * Whether the deck a page announced is the document open in the editor. The
 * server serves one entry deck while a course is typically one deck per
 * lecture, and a slide number only means something within one deck -- so
 * nothing slide-addressed is sent or applied until this holds.
 */
export function deckMatches(announced: string, projectRoot: string, documentPath: string): boolean {
  const abs = isAbsolute(announced) ? announced : resolve(projectRoot, announced)
  return normalize(abs) === normalize(documentPath)
}

/**
 * Splits a server-sent-events buffer into complete `data:` payloads and what
 * remains unparsed. Payloads that aren't JSON are dropped.
 */
export function readEventStream(buffer: string): { events: unknown[], rest: string } {
  const events: unknown[] = []
  let rest = buffer.replace(/\r\n/g, '\n')
  let at = rest.indexOf('\n\n')
  while (at >= 0) {
    const chunk = rest.slice(0, at)
    rest = rest.slice(at + 2)
    const data = chunk.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n')
    if (data) {
      try {
        events.push(JSON.parse(data))
      }
      catch {}
    }
    at = rest.indexOf('\n\n')
  }
  return { events, rest }
}

/**
 * The geometry entry whose frontmatter the cursor is on, as the theme
 * addresses it (`content`, `images[i]`, `elements[i]`), or null anywhere else.
 */
export function geometryEntryAt(text: string, line: number): InspectEntryRef | null {
  const slide = slideAt(splitSlides(text), line)
  if (!slide || !/^geometry\s*:/m.test(slide.frontmatter))
    return null
  const frontmatterStart = slide.startLine + 1
  if (line < frontmatterStart || line >= slide.contentStartLine - 1)
    return null
  const index = indexFrontmatter(slide.frontmatter, frontmatterStart)
  const contains = (path: string) => {
    const r = index.rangeOf(path)
    return !!r && line >= r.startLine && line <= r.endLine
  }
  if (contains('geometry.content'))
    return { slideNo: slide.no, collection: 'content', index: 0 }
  for (const collection of ['images', 'elements'] as InspectCollection[]) {
    const list = (index.data?.geometry as Record<string, unknown> | undefined)?.[collection]
    if (!Array.isArray(list))
      continue
    for (let i = 0; i < list.length; i++) {
      if (contains(`geometry.${collection}[${i}]`))
        return { slideNo: slide.no, collection, index: i }
    }
  }
  return null
}

/** Whether two entry references name the same entry (both null counts). */
export function sameEntry(a: InspectEntryRef | null, b: InspectEntryRef | null): boolean {
  return a === b || (!!a && !!b && a.slideNo === b.slideNo && a.collection === b.collection && a.index === b.index)
}
