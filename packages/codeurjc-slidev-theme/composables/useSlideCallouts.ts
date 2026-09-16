// Per-slide `callouts` frontmatter: annotations that point at anything on a
// `default`-layout slide -- a spot on an image, a piece of content, or a bare
// point on the canvas. Code keeps its own callouts in `// [!mark]` markers
// next to the code they annotate (see useCodeHighlights.ts); this is the home
// for annotations of the *slide*, which is why it sits beside `geometry`.
//
//   callouts:
//     - at: { image: 0, x: 0.45, y: 0.51 }   # fraction of that image
//       text: Le damos un nombre al grupo
//       box: { x: 620, y: 300 }              # optional; auto-placed when absent
//     - at: { x: 480, y: 210 }               # free point, slide-canvas pixels
//       text: ""                             # empty -> bare arrow, no box
//     - at: { text: "Verificar" }            # follows the content it names
//       step: 2
//
// Pure (no DOM, no Vue) so the grammar is unit-testable and writers other than
// the layout editor (the ODP importer) can share the same types.

import type { Rect } from './useHighlightLayout'

export interface CalloutPoint {
  x: number
  y: number
}

/**
 * What a callout points at. Image and text anchors survive the slide being
 * re-laid out (an image resized, content re-scaled by autofit); a point anchor
 * is the escape hatch that can address empty canvas, at the cost of drifting
 * if the thing it visually pointed at later moves.
 */
export type CalloutAnchor
  // `image`: x/y are fractions (0..1) of the image's *rendered* area, not of
  // its `geometry.images` box -- an image is drawn with `object-fit: contain`,
  // so a picture whose aspect ratio differs from its box is letterboxed inside
  // it and the box's centre is not the picture's centre.
  = | { kind: 'image', index: number, x: number, y: number }
    | { kind: 'point', x: number, y: number }
    | { kind: 'text', text: string }

export interface SlideCallout {
  anchor: CalloutAnchor
  /** Empty means "no box": the callout renders as a bare arrow. */
  text: string
  /** Pinned box position in slide-canvas pixels, or null to auto-place. */
  box: CalloutPoint | null
  /** Click step (>= 1); null means always visible. */
  step: number | null
}

export interface ParsedSlideCallouts {
  /**
   * Index-aligned with the authored list: an invalid entry is `null` rather
   * than dropped, so the editor's per-index keys and write-back keep pointing
   * at the same authored entries.
   */
  callouts: (SlideCallout | null)[]
  warnings: string[]
}

export const CALLOUTS_FRONTMATTER_KEY = 'callouts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberField(raw: Record<string, unknown>, field: string, path: string, warnings: string[]): number | null {
  const v = raw[field]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    warnings.push(`${path}.${field} must be a number`)
    return null
  }
  return v
}

function parseAnchor(raw: unknown, path: string, warnings: string[]): CalloutAnchor | null {
  if (!isRecord(raw)) {
    warnings.push(`${path} must be an object: { image, x, y }, { x, y } or { text }`)
    return null
  }

  if (raw.image != null) {
    const index = raw.image
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
      warnings.push(`${path}.image must be a non-negative whole number`)
      return null
    }
    const x = numberField(raw, 'x', path, warnings)
    const y = numberField(raw, 'y', path, warnings)
    if (x === null || y === null)
      return null
    // Fractions, so the anchor keeps pointing at the same part of the picture
    // however the image is later positioned or scaled.
    for (const [field, value] of [['x', x], ['y', y]] as const) {
      if (value < 0 || value > 1) {
        warnings.push(`${path}.${field} must be a fraction between 0 and 1`)
        return null
      }
    }
    return { kind: 'image', index, x, y }
  }

  if (raw.text != null) {
    const text = raw.text
    if (typeof text !== 'string' || text.trim() === '') {
      warnings.push(`${path}.text must be a non-empty string`)
      return null
    }
    return { kind: 'text', text }
  }

  const x = numberField(raw, 'x', path, warnings)
  const y = numberField(raw, 'y', path, warnings)
  if (x === null || y === null)
    return null
  if (x < 0 || y < 0) {
    warnings.push(`${path}.${x < 0 ? 'x' : 'y'} must not be negative`)
    return null
  }
  return { kind: 'point', x, y }
}

function parseBox(raw: unknown, path: string, warnings: string[]): CalloutPoint | null {
  if (!isRecord(raw)) {
    warnings.push(`${path} must be an object with numeric x and y`)
    return null
  }
  const x = numberField(raw, 'x', path, warnings)
  const y = numberField(raw, 'y', path, warnings)
  if (x === null || y === null)
    return null
  if (x < 0 || y < 0) {
    warnings.push(`${path}.${x < 0 ? 'x' : 'y'} must not be negative`)
    return null
  }
  return { x, y }
}

function parseCallout(raw: unknown, path: string, warnings: string[]): SlideCallout | null {
  if (!isRecord(raw)) {
    warnings.push(`${path} must be an object with an "at" anchor`)
    return null
  }
  // Only a missing or invalid anchor voids the whole entry: there is nothing
  // to point at. A malformed optional field degrades to its default (with a
  // warning) so one typo doesn't make the annotation vanish.
  const anchor = parseAnchor(raw.at, `${path}.at`, warnings)
  if (anchor === null)
    return null

  let text = ''
  if (raw.text != null) {
    if (typeof raw.text === 'string')
      text = raw.text
    else
      warnings.push(`${path}.text must be a string`)
  }

  const box = raw.box == null ? null : parseBox(raw.box, `${path}.box`, warnings)

  let step: number | null = null
  if (raw.step != null) {
    if (typeof raw.step === 'number' && Number.isInteger(raw.step) && raw.step >= 1)
      step = raw.step
    else
      warnings.push(`${path}.step must be a whole number of at least 1`)
  }

  return { anchor, text, box, step }
}

/** Reads a slide's `callouts` frontmatter, dropping (with a warning) anything invalid instead of throwing. */
export function parseSlideCallouts(frontmatter: Record<string, unknown> | null | undefined): ParsedSlideCallouts {
  const warnings: string[] = []
  const raw = frontmatter?.[CALLOUTS_FRONTMATTER_KEY]
  if (raw == null)
    return { callouts: [], warnings }
  if (!Array.isArray(raw)) {
    warnings.push('callouts must be a list')
    return { callouts: [], warnings }
  }
  return {
    callouts: raw.map((entry, i) => parseCallout(entry, `callouts[${i}]`, warnings)),
    warnings,
  }
}

/** Whether the slide declares at least one usable callout. */
export function hasSlideCallouts(parsed: ParsedSlideCallouts): boolean {
  return parsed.callouts.some(c => c !== null)
}

function roundPx(point: CalloutPoint): CalloutPoint {
  return { x: Math.round(point.x), y: Math.round(point.y) }
}

/** Image anchors are fractions, so they need decimals -- four is ~1px on a 980px-wide canvas. */
function roundFraction(value: number): number {
  return Math.round(value * 10000) / 10000
}

function serializeAnchor(anchor: CalloutAnchor): Record<string, unknown> {
  if (anchor.kind === 'image')
    return { image: anchor.index, x: roundFraction(anchor.x), y: roundFraction(anchor.y) }
  if (anchor.kind === 'text')
    return { text: anchor.text }
  const { x, y } = roundPx(anchor)
  return { x, y }
}

/** Builds one `callouts` entry, omitting the parts that carry no information. */
export function serializeSlideCallout(callout: SlideCallout): Record<string, unknown> {
  const out: Record<string, unknown> = { at: serializeAnchor(callout.anchor) }
  if (callout.text !== '')
    out.text = callout.text
  if (callout.box)
    out.box = roundPx(callout.box)
  if (callout.step != null)
    out.step = callout.step
  return out
}

export function serializeSlideCallouts(callouts: SlideCallout[]): Record<string, unknown>[] | undefined {
  return callouts.length > 0 ? callouts.map(serializeSlideCallout) : undefined
}

/**
 * Returns a copy of an authored `callouts` frontmatter value with only entry
 * `index` replaced -- every other entry (including ones this parser considers
 * invalid) is kept exactly as written, since Slidev's frontmatter patch
 * replaces the whole top-level `callouts` key.
 */
export function withSlideCallout(rawCallouts: unknown, index: number, callout: SlideCallout): Record<string, unknown>[] {
  const next: unknown[] = Array.isArray(rawCallouts) ? [...rawCallouts] : []
  next[index] = serializeSlideCallout(callout)
  // A sparse write (index past the end) would leave holes that serialize as
  // nulls, so fill any gap with the empty object the parser already warns on.
  return Array.from(next, entry => (entry ?? {}) as Record<string, unknown>)
}

/** Returns a copy of an authored `callouts` value with entry `index` removed, keeping the others as written. */
export function withoutSlideCallout(rawCallouts: unknown, index: number): Record<string, unknown>[] {
  const next: unknown[] = Array.isArray(rawCallouts) ? [...rawCallouts] : []
  next.splice(index, 1)
  return Array.from(next, entry => (entry ?? {}) as Record<string, unknown>)
}

/**
 * The rect an image actually occupies inside `box` once `object-fit: contain`
 * has scaled it: centred in the box, keeping the picture's aspect ratio. This
 * is what image anchors resolve against, so a fraction points at the same part
 * of the picture whatever box it is given. Falls back to the box itself when
 * the natural size isn't known yet (an image that hasn't loaded reports 0x0).
 */
export function containedRect(box: Rect, naturalW: number, naturalH: number): Rect {
  if (!(naturalW > 0) || !(naturalH > 0) || !(box.w > 0) || !(box.h > 0))
    return box
  const scale = Math.min(box.w / naturalW, box.h / naturalH)
  const w = naturalW * scale
  const h = naturalH * scale
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

/** The point a pair of 0..1 fractions names inside `rect`. */
export function pointInRect(rect: Rect, fx: number, fy: number): CalloutPoint {
  return { x: rect.x + fx * rect.w, y: rect.y + fy * rect.h }
}

/** The inverse of `pointInRect`, clamped to 0..1 so a drag that overshoots still yields a usable anchor. */
export function fractionsInRect(rect: Rect, point: CalloutPoint): { x: number, y: number } {
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1)
  return {
    x: clamp(rect.w > 0 ? (point.x - rect.x) / rect.w : 0),
    y: clamp(rect.h > 0 ? (point.y - rect.y) / rect.h : 0),
  }
}

/**
 * Whether a callout's box already covers its own anchor. When it does, the
 * callout is a label drawn on the thing it names (a caption over an image, say)
 * and no connector is drawn -- a connector from a box to a point inside itself
 * would just be a stub under the box.
 */
export function boxContainsAnchor(box: Rect, anchor: CalloutPoint): boolean {
  return anchor.x >= box.x && anchor.x <= box.x + box.w && anchor.y >= box.y && anchor.y <= box.y + box.h
}

// Layout-editor position keys. As with geometry, the slide number is part of
// the key because the editor's position state is a singleton shared by every
// mounted slide, so `callout:0:box` alone would collide between two slides.
export function calloutKeyPrefix(slideNo: number): string {
  return `slide-callout:${slideNo}:`
}

export function calloutBoxKey(slideNo: number, index: number): string {
  return `${calloutKeyPrefix(slideNo)}${index}:box`
}

export function calloutAnchorKey(slideNo: number, index: number): string {
  return `${calloutKeyPrefix(slideNo)}${index}:anchor`
}

/** Whether an editor position key belongs to a per-slide callout (never to a layout file). */
export function isSlideCalloutKey(key: string): boolean {
  return key.startsWith('slide-callout:')
}
