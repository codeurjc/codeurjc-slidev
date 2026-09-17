// Turns a document's click model (clickModel.ts) into what the editor shows:
// `▸N [of M]` badges at the end of stepped lines, and hover text explaining at
// which clicks a highlight is visible. Plain data only; extension.ts paints it.

import type { StepRange } from 'codeurjc-slidev-theme/composables/stepRange'
import type { SlideClicks } from './clickModel'
import { formatStepRange } from 'codeurjc-slidev-theme/composables/stepRange'

export interface StepBadge {
  /** 0-based document line. */
  line: number
  /** Exact click steps and step ranges on that line, as written without braces (`2`, `2-4`, `-0`), ordered by first click, without duplicates. */
  steps: string[]
  /** The slide's total clicks, or null when it can't be counted. */
  total: number | null
}

export interface StepHover {
  /** 0-based document line. */
  line: number
  contents: string
}

/** `▸2`, `▸1,3`, `▸2-4` or `▸2 of 3`; the total only when it's known and `showTotal` is on. */
export function formatStepBadge(steps: string[], total: number | null, showTotal: boolean): string {
  const of = showTotal && total !== null ? ` of ${total}` : ''
  return `▸${steps.join(',')}${of}`
}

function addRange(byLine: Map<number, StepRange[]>, line: number, range: StepRange): void {
  const ranges = byLine.get(line) ?? []
  if (!ranges.some(r => r.from === range.from && r.to === range.to))
    ranges.push(range)
  byLine.set(line, ranges)
}

function sortRanges(ranges: StepRange[]): StepRange[] {
  const end = (r: StepRange) => r.to ?? Number.POSITIVE_INFINITY
  return [...ranges].sort((a, b) => (a.from ?? 0) - (b.from ?? 0) || end(a) - end(b))
}

/** The marker/anchor ranges of a slide, per line. */
function highlightRanges(slide: SlideClicks): Map<number, StepRange[]> {
  const byLine = new Map<number, StepRange[]>()
  for (const r of slide.registrations) {
    if ((r.kind === 'marker' || r.kind === 'anchor') && r.range)
      addRange(byLine, r.line, r.range)
  }
  return byLine
}

/** Badges for marker lines, anchor lines and native fence range segments with an exact step. */
export function computeStepBadges(slides: SlideClicks[]): StepBadge[] {
  const badges: StepBadge[] = []
  for (const slide of slides) {
    const byLine = highlightRanges(slide)
    for (const r of slide.registrations) {
      for (const segment of r.segments ?? []) {
        if (segment.click !== null)
          addRange(byLine, segment.line, { from: segment.click })
      }
    }
    for (const [line, ranges] of byLine)
      badges.push({ line, steps: sortRanges(ranges).map(formatStepRange), total: slide.total })
  }
  return badges.sort((a, b) => a.line - b.line)
}

function unknownReason(slide: SlideClicks, before?: number): string {
  const source = slide.uncountable.find(u => before === undefined || u.line < before) ?? slide.uncountable[0]
  return source ? `${source.source} on line ${source.line + 1} may add clicks` : 'the slide sets no countable clicks'
}

/** "revealed at click 2", "visible at clicks 2–4", "visible until click 1". */
function describeRanges(ranges: StepRange[]): string {
  if (ranges.every(r => r.to === undefined)) {
    const clicks = ranges.map(r => r.from ?? 0)
    return `revealed at click${clicks.length > 1 ? 's' : ''} ${clicks.join(', ')}`
  }
  return ranges.map((r) => {
    if (r.to === undefined)
      return `revealed at click ${r.from}`
    if (r.from === undefined)
      return `visible until click ${r.to}`
    return r.from === r.to ? `visible at click ${r.from}` : `visible at clicks ${r.from}–${r.to}`
  }).join(', ')
}

/**
 * Hovers for stepped marker and anchor lines ("revealed at click 2 of 3",
 * "visible at clicks 2–4 of 5"), and for code blocks whose native ranges have
 * no exact click.
 */
export function computeStepHovers(slides: SlideClicks[], showTotal: boolean): StepHover[] {
  const hovers: StepHover[] = []
  for (const slide of slides) {
    for (const [line, ranges] of highlightRanges(slide)) {
      const of = showTotal && slide.total !== null ? ` of ${slide.total}` : ''
      let contents = `Highlight ${describeRanges(sortRanges(ranges))}${of}`
      if (slide.total === null)
        contents += ` (the slide's total is unknown: ${unknownReason(slide)})`
      hovers.push({ line, contents })
    }
    for (const r of slide.registrations) {
      if (r.kind === 'fence-range' && !r.exact)
        hovers.push({ line: r.line, contents: `This code block's range clicks are unknown: ${unknownReason(slide, r.line)}` })
    }
  }
  return hovers.sort((a, b) => a.line - b.line)
}
