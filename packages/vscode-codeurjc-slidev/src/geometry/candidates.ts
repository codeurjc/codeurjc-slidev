// Builds, from a slide's raw markdown, the same DOM-free summary
// `layouts/default.vue` builds from the rendered slide: the `ElementCandidate[]`
// that `geometry.elements` entries are matched against, the authored image
// srcs `geometry.images` entries are matched against, and every declared id
// (so an entry naming an id of the wrong kind can be told from one naming
// nothing).
//
// Matching the layout exactly is the point: `resolveGeometryElements` is pure
// and takes this summary, so every resolution rule and warning string comes
// from the theme rather than being reimplemented here.

import type { ElementCandidate } from 'codeurjc-slidev-theme/composables/useSlideGeometry'
import type { SlideSpan } from '../documentScan'
import { parseFenceInfo } from 'codeurjc-slidev-theme/composables/fenceInfo'
import { fenceOptionId, findDivWrappers, findFencedBlocks, findIds, findImages, findImportBlocks, findTables } from '../documentScan'

export interface SlideCandidates {
  candidates: ElementCandidate[]
  /** Index-aligned with `candidates`: the 0-based document line each element starts on. */
  candidateLines: number[]
  /** The slide's authored image srcs, in document order. */
  srcs: string[]
  /** Index-aligned with `srcs`: the 0-based document line each image is written on. */
  imageLines: number[]
  /** Every id declared on the slide, whatever kind of element carries it. */
  otherIds: Set<string>
}

/**
 * A fence that Slidev wraps in a `.slidev-code-wrapper`, and so one a `code:`
 * or `id:` entry can position. Mirrors the non-wrapper set the click model
 * already recognises: magic-move and monaco blocks are their own components,
 * and mermaid and plantuml render as diagrams rather than code.
 */
function fenceKind(info: string): 'code' | 'mermaid' | null {
  const lang = info.split(/[\s{[]/)[0]
  if (lang === 'mermaid')
    return 'mermaid'
  if (lang === 'plantuml' || /\bmagic-move\b/.test(info) || /\{monaco[\w-]*\}/.test(info))
    return null
  return 'code'
}

/**
 * The slide's candidates, grouped by kind exactly as the layout's
 * `collectElementCandidates` groups them -- every code block, then every
 * mermaid diagram, then every table -- each group in document order. The
 * grouping matters: a `geometry.elements` entry that matches two candidates is
 * reported as ambiguous, and which candidate an ambiguous match reports first
 * follows this order.
 */
export function collectSlideCandidates(text: string, slide: SlideSpan): SlideCandidates {
  const within = (line: number) => line >= slide.contentStartLine && line < slide.endLine

  const wrappers = findDivWrappers(text).filter(w => within(w.line))
  const wrapperByWrappedLine = new Map<number, string>()
  for (const w of wrappers) {
    if (w.wrappedLine !== null)
      wrapperByWrappedLine.set(w.wrappedLine, w.id)
  }

  const code: { line: number, candidate: ElementCandidate }[] = []
  const mermaid: { line: number, candidate: ElementCandidate }[] = []

  for (const block of findFencedBlocks(text)) {
    if (!within(block.fenceStartLine))
      continue
    const kind = fenceKind(block.info)
    if (!kind)
      continue
    const parsed = parseFenceInfo(block.info)
    const id = fenceOptionId(parsed.options) ?? undefined
    const line = block.fenceStartLine
    const wrapperId = wrapperByWrappedLine.get(line)
    if (kind === 'mermaid')
      mermaid.push({ line, candidate: { kind: 'mermaid', id, wrapperId } })
    else
      code.push({ line, candidate: { kind: 'code', id, title: parsed.title || undefined, wrapperId } })
  }

  // A `<<<` import is rewritten into a fenced code block by the theme's `pre`
  // transformer before rendering, so in the DOM it is an ordinary code
  // wrapper -- carrying the import path as written, which is what a `code:`
  // entry matches on first.
  for (const block of findImportBlocks(text)) {
    if (!within(block.importLine))
      continue
    code.push({
      line: block.importLine,
      candidate: { kind: 'code', importPath: block.parsed.filePath, wrapperId: wrapperByWrappedLine.get(block.importLine) },
    })
  }

  code.sort((a, b) => a.line - b.line)
  mermaid.sort((a, b) => a.line - b.line)

  const tables = findTables(text)
    .filter(t => within(t.line))
    .map(t => ({ line: t.line, candidate: { kind: 'table' as const, wrapperId: wrapperByWrappedLine.get(t.line) } }))

  const ordered = [...code, ...mermaid, ...tables]
  const images = findImages(text).filter(img => within(img.line))

  return {
    candidates: ordered.map(o => o.candidate),
    candidateLines: ordered.map(o => o.line),
    srcs: images.map(img => img.src),
    imageLines: images.map(img => img.line),
    otherIds: new Set(findIds(text).filter(i => within(i.line)).map(i => i.id)),
  }
}
