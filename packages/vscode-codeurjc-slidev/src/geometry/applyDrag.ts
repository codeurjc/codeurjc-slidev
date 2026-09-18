// Applies a drag reported by the theme (under controlled mode, see the theme's
// useInspectProtocol.ts) to the open document's text.
//
// The extension, not the theme, writes: the theme's own write goes through the
// dev server from the *server's* copy of the file, which would race whatever
// the author hasn't saved yet. Applying into the live buffer instead keeps
// those edits by construction and makes the drag one undoable edit.
//
// The entry is located by its stable key, never by list position -- the
// buffer may have gained or lost entries since the preview rendered. That also
// makes the rest of the policy fall out as a lookup rather than a merge:
//
// - found on the dragged slide → apply. If its rect there differs from the
//   drag's `from`, the preview was merely rendering an older file; the drag
//   still states where the author put the element, so it wins.
// - found on another slide → slide boundaries have drifted (a slide was added
//   or removed above it and not saved yet): the number the preview sent may
//   name a different slide now, so nothing is applied.
// - found nowhere → the entry was removed; nothing to apply.
//
// Pure: text in, edits out.

import type { InspectKey, InspectRect } from 'codeurjc-slidev-theme/composables/useInspectProtocol'
import type { YAMLMap } from 'yaml'
import type { SlideSpan } from '../documentScan'
import type { TextEdit } from './quickFixes'
import { formatImageRef, imageRefFor, parseImageRef } from 'codeurjc-slidev-theme/composables/useImageRefs'
import { parseSlideGeometry, resolveGeometryImages } from 'codeurjc-slidev-theme/composables/useSlideGeometry'
import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import { splitSlides } from '../documentScan'
import { collectSlideCandidates } from './candidates'
import { lineOffsets, positionAt } from './frontmatterRanges'

export interface Drag {
  slideNo: number
  key: InspectKey
  from: InspectRect
  to: InspectRect
}

export type DragOutcome
  = | { kind: 'apply', edits: TextEdit[], /** The buffer's rect differed from the one the preview dragged from. */ stale: boolean }
    | { kind: 'gone' }
    | { kind: 'drift', /** The slide the entry is on now. */ foundOnSlide: number }

const RECT_FIELDS = ['x', 'y', 'w', 'h'] as const

export function applyDrag(text: string, drag: Drag): DragOutcome {
  const slides = splitSlides(text)
  const target = slides.find(s => s.no === drag.slideNo)
  if (target) {
    const found = locate(text, target, drag)
    if (found)
      return found
  }
  for (const slide of slides) {
    if (slide.no !== drag.slideNo && locate(text, slide, drag))
      return { kind: 'drift', foundOnSlide: slide.no }
  }
  return { kind: 'gone' }
}

/** The entry's rect edit on `slide`, or null when the key isn't there. */
function locate(text: string, slide: SlideSpan, drag: Drag): DragOutcome | null {
  if (!/^geometry\s*:/m.test(slide.frontmatter))
    return null
  let doc
  try {
    doc = parseDocument(slide.frontmatter)
  }
  catch {
    return null
  }
  const geometryNode = isMap(doc.contents) ? doc.contents.get('geometry', true) : null
  if (!isMap(geometryNode))
    return null

  const entry = findEntryNode(text, slide, geometryNode, drag.key)
  if (!isMap(entry))
    return null

  const offsets = lineOffsets(slide.frontmatter)
  const frontmatterStartLine = slide.startLine + 1
  const edits: TextEdit[] = []
  let stale = false
  for (const field of RECT_FIELDS) {
    const value = entry.get(field, true)
    if (!isScalar(value) || !value.range)
      return null // not a well-formed rect: leave it to the diagnostics
    if (value.value !== drag.from[field])
      stale = true
    if (value.value === drag.to[field])
      continue
    const from = positionAt(offsets, value.range[0])
    const to = positionAt(offsets, value.range[1])
    edits.push({
      startLine: from.line + frontmatterStartLine,
      startChar: from.char,
      endLine: to.line + frontmatterStartLine,
      endChar: to.char,
      newText: String(Math.round(drag.to[field])),
    })
  }
  return { kind: 'apply', edits, stale }
}

function findEntryNode(text: string, slide: SlideSpan, geometryNode: YAMLMap, key: InspectKey): unknown {
  if (key.kind === 'content')
    return geometryNode.get('content', true)

  const elements = geometryNode.get('elements', true)
  const elementItems = isSeq(elements) ? elements.items : []
  const field = (item: unknown, name: string): unknown => (isMap(item) ? (item.get(name) as unknown) : undefined)

  if (key.kind === 'id')
    return elementItems.find(item => field(item, 'id') === key.name)
  if (key.kind === 'code')
    return elementItems.find(item => field(item, 'code') === key.text)

  // An image: an `elements` entry naming it wins, as it does in the theme.
  const byElement = elementItems.find(item => field(item, 'image') === key.ref)
  if (byElement)
    return byElement
  const images = geometryNode.get('images', true)
  const imageItems = isSeq(images) ? images.items : []
  const bySrc = imageItems.find(item => field(item, 'src') === key.ref)
  if (bySrc)
    return bySrc

  // A positional entry (the legacy form) is named by the src of the image it
  // resolves to -- resolve it against the slide's own images the way the
  // theme does, and compare in the same shortest-reference form.
  if (!parseImageRef(key.ref))
    return undefined
  const { srcs } = collectSlideCandidates(text, slide)
  const geometry = parseSlideGeometry({ geometry: geometryNode.toJSON() })
  const { indexes } = resolveGeometryImages(geometry, srcs)
  const at = indexes.findIndex((image, i) => image >= 0 && geometry.imageRefs[i]?.kind === 'position' && formatImageRef(imageRefFor(srcs, image)) === key.ref)
  return at >= 0 ? imageItems[at] : undefined
}
