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
//       - { x: 620, y: 110, w: 320, h: 400 }
//
// Pure (no DOM, no Vue) so the grammar is unit-testable and writers other
// than the layout editor (e.g. the ODP importer) can share the same types.

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
  warnings: string[]
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
    return { content: null, images: [], warnings }
  if (!isRecord(raw)) {
    warnings.push('geometry must be an object with optional content and images')
    return { content: null, images: [], warnings }
  }

  const content = raw.content == null ? null : parseGeometryRect(raw.content, 'geometry.content', warnings)

  let images: (GeometryRect | null)[] = []
  if (raw.images != null) {
    if (Array.isArray(raw.images))
      images = raw.images.map((entry, i) => parseGeometryRect(entry, `geometry.images[${i}]`, warnings))
    else
      warnings.push('geometry.images must be a list')
  }

  return { content, images, warnings }
}

/** Whether the slide positions its images through frontmatter (which disables the layout's single tracked-image extraction). */
export function hasGeometryImages(geometry: ParsedSlideGeometry): boolean {
  return geometry.images.some(rect => rect !== null)
}

function roundRect(rect: GeometryRect): GeometryRect {
  return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }
}

/** Builds a `geometry` frontmatter value from rects, rounding to whole pixels and omitting empty parts. */
export function serializeSlideGeometry(geometry: { content?: GeometryRect | null, images?: GeometryRect[] }): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {}
  if (geometry.content)
    out.content = roundRect(geometry.content)
  if (geometry.images && geometry.images.length > 0)
    out.images = geometry.images.map(roundRect)
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Returns a copy of an authored `geometry` frontmatter value with only
 * `target`'s rect replaced -- every other entry (including ones this parser
 * considers invalid) is kept exactly as written, since Slidev's frontmatter
 * patch replaces the whole top-level `geometry` key.
 */
export function withGeometryRect(rawGeometry: unknown, target: GeometryTarget, rect: GeometryRect): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(rawGeometry) ? { ...rawGeometry } : {}
  if (target.kind === 'content') {
    next.content = roundRect(rect)
  }
  else {
    const images = Array.isArray(next.images) ? [...next.images] : []
    images[target.index] = roundRect(rect)
    next.images = images
  }
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

/** Whether an editor position key belongs to per-slide frontmatter geometry (never to a layout file). */
export function isGeometryKey(key: string): boolean {
  return key.startsWith('geometry:')
}
