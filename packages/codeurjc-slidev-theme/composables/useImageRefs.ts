// How slide frontmatter refers to one of the slide's images (`geometry.images`
// entries, callout `image` anchors). A reference is the image's `src` as the
// author wrote it -- `/images/a.png`, or `/images/a.png#2` for the second
// image with that src -- so inserting or reordering other images doesn't
// re-target it. A plain number is the older positional form (the Nth content
// image), still accepted.
//
// Pure: callers pass the slide's authored srcs in document order (read from
// each `<img>`'s `data-src`, see markdownImageSrc.ts), so the grammar is
// shared by the theme, the ODP importer and editor tooling.

export type ImageRef
  = | { kind: 'src', src: string, occurrence?: number }
    | { kind: 'position', index: number }

export interface ResolvedImageRef {
  /** Index into the slide's images (document order), or -1 when nothing matches. */
  index: number
  warning?: string
}

const OCCURRENCE_RE = /^(.*)#(\d+)$/

/**
 * Reads a reference: a non-negative whole number (position) or a non-empty
 * string (src). Only a trailing `#` followed by digits is an occurrence, so a
 * fragment like `icons.svg#logo` stays part of the src; `#0` is invalid.
 */
export function parseImageRef(raw: unknown): ImageRef | null {
  if (typeof raw === 'number')
    return Number.isInteger(raw) && raw >= 0 ? { kind: 'position', index: raw } : null
  if (typeof raw !== 'string' || raw.trim() === '')
    return null
  const occurrence = OCCURRENCE_RE.exec(raw)
  if (occurrence) {
    const n = Number(occurrence[2])
    return n >= 1 && occurrence[1] !== '' ? { kind: 'src', src: occurrence[1], occurrence: n } : null
  }
  return raw.endsWith('#') ? null : { kind: 'src', src: raw }
}

export function formatImageRef(ref: ImageRef): string | number {
  if (ref.kind === 'position')
    return ref.index
  return ref.occurrence ? `${ref.src}#${ref.occurrence}` : ref.src
}

/**
 * The shortest reference that picks image `index`: its bare src when no other
 * image on the slide shares it, `src#N` when it repeats, and its position
 * when the image has no known src.
 */
export function imageRefFor(srcs: (string | null | undefined)[], index: number): ImageRef {
  const src = srcs[index]
  if (!src)
    return { kind: 'position', index }
  const same = srcs.reduce<number[]>((acc, s, i) => (s === src ? [...acc, i] : acc), [])
  return same.length > 1 ? { kind: 'src', src, occurrence: same.indexOf(index) + 1 } : { kind: 'src', src }
}

/** Resolves a reference against the slide's srcs, never falling back to a different image. */
export function resolveImageRef(ref: ImageRef, srcs: (string | null | undefined)[]): ResolvedImageRef {
  if (ref.kind === 'position') {
    return ref.index < srcs.length
      ? { index: ref.index }
      : { index: -1, warning: `image ${ref.index} doesn't exist (the slide has ${srcs.length})` }
  }
  const same = srcs.reduce<number[]>((acc, s, i) => (s === ref.src ? [...acc, i] : acc), [])
  if (same.length === 0)
    return { index: -1, warning: `no image with src "${ref.src}"` }
  if (ref.occurrence) {
    return ref.occurrence <= same.length
      ? { index: same[ref.occurrence - 1] }
      : { index: -1, warning: `"${formatImageRef(ref)}" asks for occurrence ${ref.occurrence}, but only ${same.length} image${same.length === 1 ? ' has' : 's have'} that src` }
  }
  return same.length > 1
    ? { index: same[0], warning: `"${ref.src}" appears ${same.length} times; using the first (write "${ref.src}#1" to "${ref.src}#${same.length}" to pick one)` }
    : { index: same[0] }
}

/** The authored src of a rendered content image (`data-src`, stamped at markdown render time), else its literal `src` attribute. */
export function authoredSrc(img: { getAttribute: (name: string) => string | null }): string | null {
  return img.getAttribute('data-src') ?? img.getAttribute('src')
}
