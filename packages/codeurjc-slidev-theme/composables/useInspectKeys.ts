// The stable key a geometry drag is reported under (see useInspectProtocol.ts).
// Kept apart from the protocol module because `vite.config.ts` imports that
// one, and this needs the geometry grammar, which Vite's config loader would
// otherwise have to bundle into the config itself.

import type { InspectKey } from './useInspectProtocol'
import type { ParsedSlideGeometry } from './useSlideGeometry'
import { formatImageRef, imageRefFor } from './useImageRefs'
import { resolveGeometryImages } from './useSlideGeometry'

/**
 * The stable key a drag of one geometry entry is reported under: `content`,
 * an `elements` entry's own key, or an `images` entry's src reference. A
 * positional `images` entry (the legacy form) is named by the src of the image
 * it resolves to, in the shortest unambiguous form -- the same reference the
 * theme's own writers migrate it to. Null when the entry has no nameable
 * target (a positional entry whose image has no src, or resolves to nothing).
 */
export function inspectKeyFor(
  geometry: ParsedSlideGeometry,
  target: { kind: 'content' } | { kind: 'image', index: number } | { kind: 'element', index: number },
  srcs: (string | null | undefined)[],
): InspectKey | null {
  if (target.kind === 'content')
    return { kind: 'content' }
  if (target.kind === 'element') {
    const key = geometry.elements[target.index]?.key
    if (!key)
      return null
    if (key.kind === 'image')
      return { kind: 'image', ref: String(formatImageRef(key.ref)) }
    return key.kind === 'code' ? { kind: 'code', text: key.text } : { kind: 'id', name: key.name }
  }
  const ref = geometry.imageRefs[target.index]
  if (!ref)
    return null
  if (ref.kind === 'src')
    return { kind: 'image', ref: String(formatImageRef(ref)) }
  const resolved = resolveGeometryImages(geometry, srcs).indexes[target.index]
  if (resolved === undefined || resolved < 0)
    return null
  const named = imageRefFor(srcs, resolved)
  return named.kind === 'src' ? { kind: 'image', ref: String(formatImageRef(named)) } : null
}
