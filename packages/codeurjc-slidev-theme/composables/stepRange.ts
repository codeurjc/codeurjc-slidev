// Click steps as ranges: `{N}` (from click N on), `{N-}` (the same), `{N-M}`
// (clicks N through M, hidden again from M+1) and `{-M}` (from the start of
// the slide through click M; `{-0}` is "only before the first click"). One
// definition shared by code-highlight markers and anchors, slide callouts,
// the ODP importer and the VS Code extension.

export interface StepRange {
  /** First click the item is visible at; absent means visible from click 0. */
  from?: number
  /** Last click the item is visible at; absent means visible to the end of the slide. */
  to?: number
}

// `N`, `N-`, `N-M` (groups 1-3), or `-M` (group 4).
const STEP_RANGE_RE = /^(?:(\d+)(?:(-)(\d*))?|-(\d+))$/

/** Parses a step or step range as written between the braces (or as a callout's `step:` value); null when malformed. */
export function parseStepRange(text: string | number): StepRange | null {
  // YAML reads `step: -0` as the number -0, which `String` would turn into "0".
  const written = Object.is(text, -0) ? '-0' : String(text)
  const m = STEP_RANGE_RE.exec(written.trim())
  if (!m)
    return null
  const [, fromText, dash, toAfterFrom, openStartTo] = m
  const toText = openStartTo ?? (toAfterFrom || undefined)
  if (fromText !== undefined && !dash) {
    // A single number: `{N}`, N ≥ 1.
    const from = Number(fromText)
    return from >= 1 ? { from } : null
  }
  const from = fromText === undefined ? undefined : Number(fromText)
  const to = toText === undefined ? undefined : Number(toText)
  if (from !== undefined && from < 1)
    return null
  if (to !== undefined && from !== undefined && to < from)
    return null
  // No leading zeros games: `{-0}` is allowed, `{0-2}` isn't (from ≥ 1 above).
  return to === undefined ? { from } : from === undefined ? { to } : { from, to }
}

/** The shortest written form: `2`, `-1`, `2-4`. */
export function formatStepRange(range: StepRange): string {
  if (range.to === undefined)
    return String(range.from ?? 0)
  if (range.from === undefined)
    return `-${range.to}`
  return `${range.from}-${range.to}`
}

/** Whether an item with this range is visible at `click`. */
export function isVisibleAt(range: StepRange, click: number): boolean {
  return (range.from ?? 0) <= click && (range.to === undefined || click <= range.to)
}

/** The clicks at which an item with this range changes, which Slidev must count: its start and the click after its end. */
export function rangeRegistrations(range: StepRange): number[] {
  const clicks: number[] = []
  if (range.from !== undefined)
    clicks.push(range.from)
  if (range.to !== undefined)
    clicks.push(range.to + 1)
  return clicks
}

/** Whether two items can be visible at the same click; an absent range is visible at every click. */
export function rangesOverlap(a: StepRange | undefined, b: StepRange | undefined): boolean {
  const aFrom = a?.from ?? 0
  const bFrom = b?.from ?? 0
  const aTo = a?.to ?? Number.POSITIVE_INFINITY
  const bTo = b?.to ?? Number.POSITIVE_INFINITY
  return aFrom <= bTo && bFrom <= aTo
}

/** The first click an item with this range is visible at, for ordering. */
export function rangeStart(range: StepRange | undefined): number {
  return range?.from ?? 0
}
