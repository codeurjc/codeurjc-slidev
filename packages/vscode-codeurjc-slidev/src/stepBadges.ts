// Turns a document's click model (clickModel.ts) into what the editor shows:
// `▸N [of M]` badges at the end of stepped lines, and hover text explaining at
// which click a highlight appears. Plain data only; extension.ts paints it.

import type { SlideClicks } from './clickModel'

export interface StepBadge {
  /** 0-based document line. */
  line: number
  /** Exact click steps on that line, ascending, without duplicates. */
  steps: number[]
  /** The slide's total clicks, or null when it can't be counted. */
  total: number | null
}

export interface StepHover {
  /** 0-based document line. */
  line: number
  contents: string
}

/** `▸2`, `▸1,3` or `▸2 of 3`; the total only when it's known and `showTotal` is on. */
export function formatStepBadge(steps: number[], total: number | null, showTotal: boolean): string {
  const of = showTotal && total !== null ? ` of ${total}` : ''
  return `▸${steps.join(',')}${of}`
}

function addStep(byLine: Map<number, Set<number>>, line: number, step: number): void {
  const steps = byLine.get(line) ?? new Set<number>()
  steps.add(step)
  byLine.set(line, steps)
}

/** Badges for marker lines, anchor lines and native fence range segments with an exact step. */
export function computeStepBadges(slides: SlideClicks[]): StepBadge[] {
  const badges: StepBadge[] = []
  for (const slide of slides) {
    const byLine = new Map<number, Set<number>>()
    for (const r of slide.registrations) {
      if ((r.kind === 'marker' || r.kind === 'anchor') && r.start !== null)
        addStep(byLine, r.line, r.start)
      for (const segment of r.segments ?? []) {
        if (segment.click !== null)
          addStep(byLine, segment.line, segment.click)
      }
    }
    for (const [line, steps] of byLine)
      badges.push({ line, steps: [...steps].sort((a, b) => a - b), total: slide.total })
  }
  return badges.sort((a, b) => a.line - b.line)
}

function unknownReason(slide: SlideClicks, before?: number): string {
  const source = slide.uncountable.find(u => before === undefined || u.line < before) ?? slide.uncountable[0]
  return source ? `${source.source} on line ${source.line + 1} may add clicks` : 'the slide sets no countable clicks'
}

/**
 * Hovers for stepped marker and anchor lines ("revealed at click 2 of 3"),
 * and for code blocks whose native ranges have no exact click.
 */
export function computeStepHovers(slides: SlideClicks[], showTotal: boolean): StepHover[] {
  const hovers: StepHover[] = []
  for (const slide of slides) {
    const byLine = new Map<number, Set<number>>()
    for (const r of slide.registrations) {
      if ((r.kind === 'marker' || r.kind === 'anchor') && r.start !== null)
        addStep(byLine, r.line, r.start)
    }
    for (const [line, stepSet] of byLine) {
      const steps = [...stepSet].sort((a, b) => a - b)
      const of = showTotal && slide.total !== null ? ` of ${slide.total}` : ''
      let contents = `Highlight revealed at click${steps.length > 1 ? 's' : ''} ${steps.join(', ')}${of}`
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
