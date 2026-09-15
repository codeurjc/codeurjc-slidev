import type { CodeMark } from './annotations'
import type { DraftBlock, SlideDraft } from './draft'
import type { OdpShape, Paragraph } from './model'
import { paragraphText, shapeText } from './model'

// Build-ups: consecutive slides where each one is the previous slide plus a
// few additions (a callout on the same code, a trailing bullet, an image).
// When every addition converts, the run becomes one slide that reveals the
// additions with click steps; otherwise the slides stay separate and the
// importer warns.

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
  superset: boolean
  convertible: boolean
  additionKinds: string[]
}

export function analyzePair(a: SlideDraft, b: SlideDraft): PairAnalysis {
  const none = { superset: false, convertible: false, additionKinds: [] }
  if (a.role !== 'content' || b.role !== 'content' || a.hidden !== b.hidden)
    return none
  if (a.titleLines.join('\n') !== b.titleLines.join('\n') || a.heading !== b.heading)
    return none

  const shapesOf = (d: SlideDraft) => d.classified.slide.shapes.filter(s => s !== d.classified.bodyShape)
  const setA = multiset(shapesOf(a))
  const setB = multiset(shapesOf(b))
  const added: OdpShape[] = []
  for (const [key, shapes] of setB) {
    const inA = setA.get(key)?.length ?? 0
    added.push(...shapes.slice(inA))
  }
  for (const [key, shapes] of setA) {
    if ((setB.get(key)?.length ?? 0) < shapes.length)
      return none
  }

  const bodyA = a.classified.bodyParagraphs.map(paragraphSig)
  const bodyB = b.classified.bodyParagraphs.map(paragraphSig)
  const bodyPrefix = bodyA.every((sig, i) => bodyB[i] === sig)
  if (!bodyPrefix)
    return none
  const bodyGrew = bodyB.length > bodyA.length
  if (added.length === 0 && !bodyGrew)
    return none

  const allowed = new Set<OdpShape>([
    ...b.classified.annotationRects,
    ...b.annotations.consumedTexts,
    ...b.annotations.consumedConnectors,
    ...b.classified.images,
  ])
  const unconvertible = added.filter(s => !allowed.has(s))
  return {
    superset: true,
    convertible: unconvertible.length === 0,
    additionKinds: [...new Set(unconvertible.map(describeShape))],
  }
}

function sameMark(x: CodeMark, y: CodeMark): boolean {
  return x.kind === y.kind && x.startLine === y.startLine && x.endLine === y.endLine
    && x.comment === y.comment && x.substring?.start === y.substring?.start && x.substring?.end === y.substring?.end
}

function codeBlocks(d: SlideDraft) {
  return d.blocks.filter((b): b is Extract<DraftBlock, { kind: 'code' }> => b.kind === 'code')
}

/** Merges a run of drafts (a build-up) into its last draft, stepping each addition by the slide that introduced it. */
function mergeRun(run: SlideDraft[]): SlideDraft {
  const last = run[run.length - 1]
  const firstStep = <T>(present: (d: SlideDraft) => T | undefined | false): number => {
    const index = run.findIndex(d => present(d))
    return Math.max(0, index)
  }

  const blocks = last.blocks.map((block) => {
    if (block.kind === 'code') {
      const position = codeBlocks(last).indexOf(block)
      const marks = block.code.marks.map((mark) => {
        const step = firstStep(d => codeBlocks(d)[position]?.code.marks.some(m => sameMark(m, mark)))
        return step ? { ...mark, click: step } : mark
      })
      return { ...block, code: { ...block.code, marks } }
    }
    if (block.kind === 'body') {
      const steps = block.paragraphs.map((_, i) => firstStep(d => d.classified.bodyParagraphs.length > i))
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
      const next = drafts[i + run.length]
      const pair = analyzePair(run[run.length - 1], next)
      if (pair.convertible) {
        run.push(next)
        continue
      }
      if (pair.superset) {
        const prev = run[run.length - 1]
        result.warnings.push(`Build-up of ODP slides ${prev.odpNumbers[prev.odpNumbers.length - 1]}–${next.odpNumbers[0]} kept as separate slides (can't convert to click steps: ${pair.additionKinds.join(', ')})`)
      }
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
