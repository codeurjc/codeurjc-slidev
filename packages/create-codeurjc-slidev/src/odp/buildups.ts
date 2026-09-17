import type { StepRange } from 'codeurjc-slidev-theme/composables/stepRange'
import type { CodeMark } from './annotations'
import type { DraftBlock, SlideDraft } from './draft'
import type { OdpShape, Paragraph } from './model'
import { paragraphText, shapeText } from './model'

// Build-ups: consecutive slides where each one is the previous slide plus a
// few additions (a callout on the same code, a trailing bullet, an image), or
// where highlights on the same code come and go (a walk-through). When every
// change converts, the run becomes one slide with click steps and step ranges;
// otherwise the slides stay separate and the importer warns.

export interface BuildUpResult {
  drafts: SlideDraft[]
  warnings: string[]
  mergedRuns: number
}

function round(n: number | undefined): number {
  return Math.round((n ?? 0) / 0.2)
}

function shapeSig(s: OdpShape): string {
  const r = s.rect
  return [s.kind, s.geometryType ?? '', shapeText(s).replace(/\s+/g, ' ').trim(), s.images.join(','), r ? [r.x, r.y, r.w, r.h].map(round).join(',') : ''].join('|')
}

function paragraphSig(p: Paragraph): string {
  return `${p.depth}:${paragraphText(p).replace(/\s+/g, ' ').trim()}`
}

function multiset(shapes: OdpShape[]): Map<string, OdpShape[]> {
  const m = new Map<string, OdpShape[]>()
  for (const s of shapes) {
    const k = shapeSig(s)
    m.set(k, [...(m.get(k) ?? []), s])
  }
  return m
}

function describeShape(s: OdpShape): string {
  if (s.kind === 'image')
    return 'image'
  if (s.kind === 'line' || s.kind === 'connector' || /arrow/i.test(s.geometryType ?? ''))
    return 'arrow'
  if (shapeText(s).trim())
    return 'text box'
  return 'shape'
}

export interface PairAnalysis {
  /** The second slide can extend a build-up run ending with the first. */
  convertible: boolean
  /** The slides look like a build-up (same title, differing only in highlights, callouts, list items or images), whether or not they convert. */
  near: boolean
  /** Why a near build-up can't be converted. */
  reasons: string[]
}

export function analyzePair(a: SlideDraft, b: SlideDraft): PairAnalysis {
  const none = { convertible: false, near: false, reasons: [] }
  if (a.role !== 'content' || b.role !== 'content' || a.hidden !== b.hidden)
    return none
  if (a.titleLines.join('\n') !== b.titleLines.join('\n') || a.heading !== b.heading)
    return none

  const shapesOf = (d: SlideDraft) => d.classified.slide.shapes.filter(s => s !== d.classified.bodyShape)
  const setA = multiset(shapesOf(a))
  const setB = multiset(shapesOf(b))
  const difference = (from: Map<string, OdpShape[]>, other: Map<string, OdpShape[]>) =>
    [...from].flatMap(([key, shapes]) => shapes.slice(other.get(key)?.length ?? 0))
  const added = difference(setB, setA)
  const removed = difference(setA, setB)

  const bodyA = a.classified.bodyParagraphs.map(paragraphSig)
  const bodyB = b.classified.bodyParagraphs.map(paragraphSig)
  const bodyGrew = bodyA.every((sig, i) => bodyB[i] === sig)
  // A body that disappears entirely is a different slide, not a removed item.
  const bodyShrank = !bodyGrew && bodyB.length > 0 && bodyB.every((sig, i) => bodyA[i] === sig)
  if (!bodyGrew && !bodyShrank)
    return none
  if (added.length === 0 && removed.length === 0 && bodyA.length === bodyB.length)
    return none

  // Code annotations (highlight boxes and the callout texts and connectors
  // they consumed) may come and go; images and list items may only be added.
  const annotationShapes = (d: SlideDraft) => new Set<OdpShape>([
    ...d.classified.annotationRects,
    ...d.annotations.consumedTexts,
    ...d.annotations.consumedConnectors,
  ])
  const annotationsA = annotationShapes(a)
  const allowedAdded = new Set<OdpShape>([...annotationShapes(b), ...b.classified.images])
  const imagesA = new Set(a.classified.images)

  // A removed shape other than an annotation or an image means the slides show different things.
  if (removed.some(s => !annotationsA.has(s) && !imagesA.has(s)))
    return none

  // Diagram shapes never count as convertible: a diagram that appears or
  // changes across the run keeps the slides separate.
  const unconvertible = added.filter(s => !allowedAdded.has(s) || b.diagramShapes.has(s))
  const imageRemoved = removed.some(s => imagesA.has(s) || a.diagramShapes.has(s))
  const somethingRemoved = removed.length > 0 || bodyShrank
  // Unconvertible additions only make a near build-up when nothing is removed
  // (a plain build-up that adds, say, an arrow); combined with removals the
  // slides just show different things.
  if (unconvertible.length > 0 && somethingRemoved)
    return none
  const reasons = [...new Set(unconvertible.map(describeShape))]
  if (imageRemoved)
    reasons.push('image removed')
  if (bodyShrank)
    reasons.push('list item removed')
  return { convertible: reasons.length === 0, near: true, reasons }
}

function sameMark(x: CodeMark, y: CodeMark): boolean {
  return x.kind === y.kind && x.startLine === y.startLine && x.endLine === y.endLine
    && x.comment === y.comment && x.substring?.start === y.substring?.start && x.substring?.end === y.substring?.end
}

function codeBlocks(d: SlideDraft) {
  return d.blocks.filter((b): b is Extract<DraftBlock, { kind: 'code' }> => b.kind === 'code')
}

/** Whether a mark missing from the run's last slide but shown earlier in it appears again on `next`. */
function reappearingMark(run: SlideDraft[], next: SlideDraft): boolean {
  const last = run[run.length - 1]
  return codeBlocks(next).some((block, position) => block.code.marks.some(mark =>
    !codeBlocks(last)[position]?.code.marks.some(m => sameMark(m, mark))
    && run.some(d => codeBlocks(d)[position]?.code.marks.some(m => sameMark(m, mark)))))
}

/**
 * Merges a run of drafts (a build-up) into its last draft. Each addition is
 * stepped by the slide that introduced it; each code highlight gets the step
 * range of the slides it appears on (slide k of the run is click k).
 */
function mergeRun(run: SlideDraft[]): SlideDraft {
  const last = run[run.length - 1]
  const lastIndex = run.length - 1
  const firstStep = <T>(present: (d: SlideDraft) => T | undefined | false): number => {
    const index = run.findIndex(d => present(d))
    return Math.max(0, index)
  }

  const blocks = last.blocks.map((block) => {
    if (block.kind === 'code') {
      const position = codeBlocks(last).indexOf(block)
      const union: CodeMark[] = []
      for (const d of run) {
        for (const mark of codeBlocks(d)[position]?.code.marks ?? []) {
          if (!union.some(m => sameMark(m, mark)))
            union.push(mark)
        }
      }
      union.sort((x, y) => x.startLine - y.startLine || y.endLine - x.endLine)
      const marks = union.map((mark) => {
        const shownOn = run.flatMap((d, k) => (codeBlocks(d)[position]?.code.marks.some(m => sameMark(m, mark)) ? [k] : []))
        const from = shownOn[0]
        const to = shownOn[shownOn.length - 1]
        const { click: _previous, ...rest } = mark
        if (from === 0 && to === lastIndex)
          return rest
        const click: StepRange = to === lastIndex ? { from } : from === 0 ? { to } : { from, to }
        return { ...rest, click }
      })
      return { ...block, code: { ...block.code, marks } }
    }
    if (block.kind === 'body') {
      const steps = block.paragraphs.map((_, i) => firstStep(d => d.classified.bodyParagraphs.length > i + (block.offset ?? 0)))
      return { ...block, steps }
    }
    return block
  })

  const images = last.images.map((image) => {
    const step = firstStep(d => d.images.some(i => i.key === image.key))
    return step ? { ...image, step } : image
  })

  return {
    ...last,
    odpNumbers: run.flatMap(d => d.odpNumbers),
    odpNames: run.flatMap(d => d.odpNames),
    blocks,
    images,
  }
}

export function mergeBuildUps(drafts: SlideDraft[]): BuildUpResult {
  const result: BuildUpResult = { drafts: [], warnings: [], mergedRuns: 0 }
  let i = 0
  while (i < drafts.length) {
    const run = [drafts[i]]
    while (i + run.length < drafts.length) {
      const prev = run[run.length - 1]
      const next = drafts[i + run.length]
      const pair = analyzePair(prev, next)
      const reasons = [...pair.reasons]
      if (pair.convertible && reappearingMark(run, next))
        reasons.push('highlight shown again after being removed')
      if (pair.near && reasons.length === 0) {
        run.push(next)
        continue
      }
      if (pair.near)
        result.warnings.push(`Build-up of ODP slides ${prev.odpNumbers[prev.odpNumbers.length - 1]}–${next.odpNumbers[0]} kept as separate slides (can't convert to click steps: ${reasons.join(', ')})`)
      break
    }
    if (run.length > 1) {
      result.drafts.push(mergeRun(run))
      result.mergedRuns++
    }
    else {
      result.drafts.push(run[0])
    }
    i += run.length
  }
  return result
}
