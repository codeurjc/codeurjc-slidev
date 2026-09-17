// Per-slide `geometry` frontmatter: lets a single `default`-layout slide
// reposition its content box and position any number of its content images,
// without forking the whole layout file (contrast with the layout-level
// `--ed-*` variables `/api/save-layout` writes). Coordinates are slide-canvas
// pixels -- the same space the layout editor's positions and the `--ed-*`
// variables already use, since `.content`/`.content-inner` are unpositioned
// and both the tracked image and the editor overlays resolve against the
// layout root.
//
//   geometry:
//     content: { x: 31, y: 98, w: 560, h: 424 }
//     images:
//       - { src: /images/a.png, x: 620, y: 110, w: 320, h: 400 }
//     elements:
//       - { code: "@/code/A.java", x: 31, y: 98, w: 440, h: 400 }
//       - { id: flow, x: 500, y: 98, w: 440, h: 400, fit: none }
//
// An image entry names its image by `src` (see useImageRefs.ts); an entry
// without one positions the image at its own list position, as before.
// `elements` entries name what they position by a stable key only (an image
// src, a `<<<` import's path or a fence's title, or an id), never by position.
//
// Pure (no DOM, no Vue) so the grammar is unit-testable and writers other
// than the layout editor (e.g. the ODP importer) can share the same types.

import type { ImageRef } from './useImageRefs'
import { formatImageRef, imageRefFor, parseImageRef, resolveImageRef } from './useImageRefs'

export interface GeometryRect {
  x: number
  y: number
  w: number
  h: number
}

export interface ParsedSlideGeometry {
  content: GeometryRect | null
  /**
   * Index-aligned with the authored `geometry.images` list: an invalid entry
   * is `null` (its image stays in normal content flow) rather than dropped,
   * so every later entry still positions its own image by document order.
   */
  images: (GeometryRect | null)[]
  /** Index-aligned with `images`: which image each entry positions (its `src`, else its own list position). */
  imageRefs: ImageRef[]
  /** Index-aligned with the authored `geometry.elements` list: an invalid entry is `null`. */
  elements: (ElementEntry | null)[]
  warnings: string[]
}

/** What a `geometry.elements` entry positions: an image by src, a code block by import path or fence title, or an element by id. */
export type ElementKey = { kind: 'image', ref: ImageRef & { kind: 'src' } } | { kind: 'code', text: string } | { kind: 'id', name: string }

/** `contain` scales the element down (mermaid: to) fit its box, centred; `none` keeps its natural size at the box's top-left. */
export type ElementFit = 'contain' | 'none'

export interface ElementEntry {
  key: ElementKey
  rect: GeometryRect
  fit: ElementFit
}

export type GeometryTarget = { kind: 'content' } | { kind: 'image', index: number }

export const GEOMETRY_FRONTMATTER_KEY = 'geometry'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseGeometryRect(raw: unknown, path: string, warnings: string[]): GeometryRect | null {
  if (!isRecord(raw)) {
    warnings.push(`${path} must be an object with numeric x, y, w and h`)
    return null
  }
  const values: Partial<GeometryRect> = {}
  for (const field of ['x', 'y', 'w', 'h'] as const) {
    const v = raw[field]
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      warnings.push(`${path}.${field} must be a number`)
      return null
    }
    values[field] = v
  }
  const rect = values as GeometryRect
  if (rect.x < 0 || rect.y < 0) {
    warnings.push(`${path}.${rect.x < 0 ? 'x' : 'y'} must not be negative`)
    return null
  }
  if (rect.w <= 0 || rect.h <= 0) {
    warnings.push(`${path}.${rect.w <= 0 ? 'w' : 'h'} must be greater than 0`)
    return null
  }
  return rect
}

/** Reads a slide's `geometry` frontmatter, dropping (with a warning) anything invalid instead of throwing. */
export function parseSlideGeometry(frontmatter: Record<string, unknown> | null | undefined): ParsedSlideGeometry {
  const warnings: string[] = []
  const raw = frontmatter?.[GEOMETRY_FRONTMATTER_KEY]
  if (raw == null)
    return { content: null, images: [], imageRefs: [], elements: [], warnings }
  if (!isRecord(raw)) {
    warnings.push('geometry must be an object with optional content, images and elements')
    return { content: null, images: [], imageRefs: [], elements: [], warnings }
  }

  const content = raw.content == null ? null : parseGeometryRect(raw.content, 'geometry.content', warnings)

  let images: (GeometryRect | null)[] = []
  let imageRefs: ImageRef[] = []
  if (raw.images != null) {
    if (Array.isArray(raw.images)) {
      imageRefs = raw.images.map((entry, i) => ({ kind: 'position', index: i }))
      images = raw.images.map((entry, i) => {
        const path = `geometry.images[${i}]`
        if (isRecord(entry) && entry.src != null) {
          const ref = parseImageRef(entry.src)
          if (!ref || ref.kind !== 'src') {
            warnings.push(`${path}.src must be an image src, optionally with #N (N >= 1)`)
            return null
          }
          imageRefs[i] = ref
        }
        return parseGeometryRect(entry, path, warnings)
      })
    }
    else {
      warnings.push('geometry.images must be a list')
    }
  }

  let elements: (ElementEntry | null)[] = []
  if (raw.elements != null) {
    if (Array.isArray(raw.elements))
      elements = raw.elements.map((entry, i) => parseElementEntry(entry, `geometry.elements[${i}]`, warnings))
    else warnings.push('geometry.elements must be a list')
  }

  return { content, images, imageRefs, elements, warnings }
}

const ELEMENT_KEYS = ['image', 'code', 'id'] as const

function parseElementEntry(entry: unknown, path: string, warnings: string[]): ElementEntry | null {
  if (!isRecord(entry)) {
    warnings.push(`${path} must be an object with one of image, code or id, and x, y, w and h`)
    return null
  }
  const present = ELEMENT_KEYS.filter(k => entry[k] != null)
  if (present.length !== 1) {
    warnings.push(`${path} must have exactly one of image, code or id`)
    return null
  }
  let key: ElementKey
  const value = entry[present[0]]
  if (present[0] === 'image') {
    const ref = parseImageRef(value)
    if (!ref || ref.kind !== 'src') {
      warnings.push(`${path}.image must be an image src, optionally with #N (N >= 1)`)
      return null
    }
    key = { kind: 'image', ref }
  }
  else {
    if (typeof value !== 'string' || value.trim() === '') {
      warnings.push(`${path}.${present[0]} must be a non-empty string`)
      return null
    }
    key = present[0] === 'code' ? { kind: 'code', text: value } : { kind: 'id', name: value }
  }
  let fit: ElementFit = 'contain'
  if (entry.fit != null) {
    if (entry.fit !== 'contain' && entry.fit !== 'none') {
      warnings.push(`${path}.fit must be "contain" or "none"`)
      return null
    }
    fit = entry.fit
  }
  const rect = parseGeometryRect(entry, path, warnings)
  return rect ? { key, rect, fit } : null
}

/** A code block, mermaid diagram or table in the rendered content, as `resolveGeometryElements` needs it (no DOM). */
export interface ElementCandidate {
  kind: 'code' | 'mermaid' | 'table'
  /** The element's own `id` (a fence's `{id: '…'}`). */
  id?: string
  /** The `id` of a `<div>` whose only element child is this element. */
  wrapperId?: string
  /** A code block's `[title]` (`data-title`). */
  title?: string
  /** A `<<<` import's file path as written (`data-import-path`). */
  importPath?: string
}

/** What a resolved `geometry.elements` entry positions. */
export type ElementTarget = { kind: 'element', index: number } | { kind: 'image', index: number }

function describeKey(key: ElementKey): string {
  if (key.kind === 'image')
    return `image ${formatImageRef(key.ref)}`
  return key.kind === 'code' ? `code "${key.text}"` : `id "${key.name}"`
}

/**
 * Resolves `geometry.elements` (and `geometry.images`) against a slide's
 * content: `candidates` are its code blocks, mermaid diagrams and tables,
 * `srcs` its images' authored srcs, `otherIds` the ids of any other element in
 * the content (to tell a wrong-kind id from a missing one).
 *
 * - `code:` matches a `<<<` import by its path as written, else a fence (not an
 *   import) by its title.
 * - `id:` matches a code block or mermaid diagram with that id, or a `<div id>`
 *   wrapping only a table or an import (which is what gets positioned).
 * - No match, several matches, a wrong kind or a target claimed twice leave
 *   the element in flow with a warning; an element image target wins over a
 *   `geometry.images` entry for the same image.
 */
export function resolveGeometryElements(
  geometry: ParsedSlideGeometry,
  candidates: ElementCandidate[],
  srcs: (string | null | undefined)[],
  otherIds: ReadonlySet<string> = new Set(),
): { targets: (ElementTarget | null)[], imageIndexes: number[], warnings: string[] } {
  const warnings: string[] = []
  const claimed = new Set<string>()
  const targets = geometry.elements.map((entry, i): ElementTarget | null => {
    if (!entry)
      return null
    const path = `geometry.elements[${i}] (${describeKey(entry.key)})`
    let target: ElementTarget | null = null
    if (entry.key.kind === 'image') {
      const resolved = resolveImageRef(entry.key.ref, srcs)
      if (resolved.warning)
        warnings.push(`${path}: ${resolved.warning}`)
      if (resolved.index >= 0)
        target = { kind: 'image', index: resolved.index }
    }
    else {
      const key = entry.key
      let matches: number[]
      if (key.kind === 'code') {
        matches = candidates.flatMap((c, j) => (c.kind === 'code' && c.importPath === key.text ? [j] : []))
        if (matches.length === 0)
          matches = candidates.flatMap((c, j) => (c.kind === 'code' && !c.importPath && c.title === key.text ? [j] : []))
      }
      else {
        matches = candidates.flatMap((c, j) => {
          const own = (c.kind === 'code' || c.kind === 'mermaid') && c.id === key.name
          const wrapped = c.wrapperId === key.name && (c.kind === 'table' || (c.kind === 'code' && !!c.importPath))
          return own || wrapped ? [j] : []
        })
      }
      if (matches.length === 1) {
        target = { kind: 'element', index: matches[0] }
      }
      else if (matches.length > 1) {
        warnings.push(`${path} matches ${matches.length} elements; give the one to position an id`)
      }
      else if (key.kind === 'id' && otherIds.has(key.name)) {
        warnings.push(`${path} is not a code block, mermaid diagram, or a <div id> wrapping only a table or <<< import`)
      }
      else {
        warnings.push(key.kind === 'id'
          ? `${path} matches nothing; add {id: '${key.name}'} to a code or mermaid fence (with quotes), or wrap a table or <<< import in <div id="${key.name}">`
          : `${path} matches no <<< import path or code block title; add an id to position it`)
      }
    }
    if (!target)
      return null
    const claim = `${target.kind}:${target.index}`
    if (claimed.has(claim)) {
      warnings.push(`${path} targets an element already positioned by another entry`)
      return null
    }
    claimed.add(claim)
    return target
  })

  const images = resolveGeometryImages(geometry, srcs)
  warnings.push(...images.warnings)
  const imageIndexes = images.indexes.map((index, i) => {
    if (index >= 0 && claimed.has(`image:${index}`)) {
      warnings.push(`geometry.images[${i}]: that image is positioned by geometry.elements, which wins`)
      return -1
    }
    return index
  })
  return { targets, imageIndexes, warnings }
}

/** Whether the slide positions its images through frontmatter (which disables the layout's single tracked-image extraction). */
export function hasGeometryImages(geometry: ParsedSlideGeometry): boolean {
  return geometry.images.some(rect => rect !== null)
}

/**
 * Which image (index into `srcs`, the slide's authored image srcs in document
 * order) each `geometry.images` entry positions, or -1. Src entries claim
 * their images first, so a positional entry landing on an image a src entry
 * already took is skipped rather than fighting over it.
 */
export function resolveGeometryImages(geometry: ParsedSlideGeometry, srcs: (string | null | undefined)[]): { indexes: number[], warnings: string[] } {
  const warnings: string[] = []
  const indexes = geometry.images.map(() => -1)
  const claimed = new Set<number>()
  const pass = (kind: ImageRef['kind']) => geometry.imageRefs.forEach((ref, i) => {
    if (ref.kind !== kind || !geometry.images[i])
      return
    const resolved = resolveImageRef(ref, srcs)
    if (resolved.warning && (kind === 'src' || resolved.index >= 0))
      warnings.push(`geometry.images[${i}]: ${resolved.warning}`)
    if (resolved.index < 0)
      return
    if (claimed.has(resolved.index)) {
      warnings.push(`geometry.images[${i}]: image ${resolved.index} is already positioned by another entry`)
      return
    }
    claimed.add(resolved.index)
    indexes[i] = resolved.index
  })
  pass('src')
  pass('position')
  return { indexes, warnings }
}

function roundRect(rect: GeometryRect): GeometryRect {
  return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }
}

/** Builds a `geometry` frontmatter value from rects (image entries optionally keyed by `src`), rounding to whole pixels and omitting empty parts. */
export function serializeSlideGeometry(geometry: { content?: GeometryRect | null, images?: (GeometryRect & { src?: string })[] }): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {}
  if (geometry.content)
    out.content = roundRect(geometry.content)
  if (geometry.images && geometry.images.length > 0)
    out.images = geometry.images.map(({ src, ...rect }) => (src ? { src, ...roundRect(rect) } : roundRect(rect)))
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Returns a copy of an authored `geometry` frontmatter value with only
 * `target`'s rect replaced -- every other entry (including ones this parser
 * considers invalid) is kept exactly as written, since Slidev's frontmatter
 * patch replaces the whole top-level `geometry` key.
 *
 * Given the slide's authored image `srcs`, the write also keys every
 * positional image entry that resolves to an image with a src by that src
 * (`#N` when it repeats), so a slide migrates to src references the first
 * time it's edited. Entries that don't resolve are kept as written.
 */
export function withGeometryRect(rawGeometry: unknown, target: GeometryTarget, rect: GeometryRect, srcs?: (string | null | undefined)[]): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(rawGeometry) ? { ...rawGeometry } : {}
  if (target.kind === 'content') {
    next.content = roundRect(rect)
  }
  else {
    const images = Array.isArray(next.images) ? [...next.images] : []
    const current = images[target.index]
    images[target.index] = isRecord(current) && current.src != null ? { src: current.src, ...roundRect(rect) } : roundRect(rect)
    next.images = images
  }
  if (srcs && Array.isArray(next.images)) {
    const images = next.images as unknown[]
    const { indexes } = resolveGeometryImages(parseSlideGeometry({ [GEOMETRY_FRONTMATTER_KEY]: next }), srcs)
    next.images = images.map((entry, i) => {
      if (!isRecord(entry) || entry.src != null || indexes[i] < 0)
        return entry
      const ref = imageRefFor(srcs, indexes[i])
      return ref.kind === 'src' ? { src: formatImageRef(ref), ...entry } : entry
    })
  }
  return next
}

/**
 * The geometry a paste preset writes: `content` set to the preset's content
 * rect, and the pasted image positioned by an entry keyed by its src -- the
 * entry that already positions that image is replaced, otherwise one is
 * appended. Every other entry is kept (positional ones migrated to src, as any
 * geometry write does), so positioning one picture never disturbs another.
 */
export function withPositionedImage(rawGeometry: unknown, content: GeometryRect, image: ImageRef & { kind: 'src' }, rect: GeometryRect, srcs: (string | null | undefined)[]): Record<string, unknown> {
  let next = withGeometryRect(rawGeometry, { kind: 'content' }, content, srcs)
  const target = resolveImageRef(image, srcs).index
  const { indexes } = resolveGeometryImages(parseSlideGeometry({ [GEOMETRY_FRONTMATTER_KEY]: next }), srcs)
  const entry = target >= 0 ? indexes.indexOf(target) : -1
  if (entry >= 0)
    return withGeometryRect(next, { kind: 'image', index: entry }, rect, srcs)
  next = { ...next, images: [...(Array.isArray(next.images) ? next.images : []), { src: formatImageRef(image), ...roundRect(rect) }] }
  return next
}

/** A copy of an authored `geometry` value with one `elements` entry's rect replaced, keeping its key, `fit` and every other entry as written. */
export function withElementRect(rawGeometry: unknown, index: number, rect: GeometryRect): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(rawGeometry) ? { ...rawGeometry } : {}
  const elements = Array.isArray(next.elements) ? [...next.elements] : []
  const current = elements[index]
  elements[index] = isRecord(current) ? { ...current, ...roundRect(rect) } : roundRect(rect)
  next.elements = elements
  return next
}

export function sameRect(a: GeometryRect, b: GeometryRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/** The `--ed-content-*` overrides a slide's content geometry applies on the layout root. */
export function geometryContentVars(rect: GeometryRect): Record<string, string> {
  return {
    '--ed-content-x': `${rect.x}px`,
    '--ed-content-y': `${rect.y}px`,
    '--ed-content-w': `${rect.w}px`,
    '--ed-content-h': `${rect.h}px`,
  }
}

// Layout-editor position keys for frontmatter-positioned elements. The slide
// number is part of the key because the editor's position state is a
// singleton shared by every mounted slide (Slidev keeps neighbours mounted),
// so `geometry:content` alone would collide between two slides that both
// declare one.
export function geometryKeyPrefix(slideNo: number): string {
  return `geometry:${slideNo}:`
}

export function geometryContentKey(slideNo: number): string {
  return `${geometryKeyPrefix(slideNo)}content`
}

export function geometryImageKey(slideNo: number, index: number): string {
  return `${geometryKeyPrefix(slideNo)}image:${index}`
}

export function geometryElementKey(slideNo: number, index: number): string {
  return `${geometryKeyPrefix(slideNo)}element:${index}`
}

/** Whether an editor position key belongs to per-slide frontmatter geometry (never to a layout file). */
export function isGeometryKey(key: string): boolean {
  return key.startsWith('geometry:')
}
