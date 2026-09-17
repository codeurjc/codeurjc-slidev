import type { CalloutAnchor, SlideCallout } from 'codeurjc-slidev-theme/composables/useSlideCallouts'
import type { AnnotationResult } from './annotations'
import type { ClassifiedSlide } from './classify'
import type { OdpShape, Rect } from './model'
import { distanceToRect, endpointPairs, oneLine } from './annotations'
import { CONNECTOR_DISTANCE_CM } from './constants'
import { mapPoint } from './geometry'

// Arrows and labels drawn over images (and labelled arrows pointing at slide
// content) become `callouts` frontmatter -- the slide-level counterpart of the
// code marks in annotations.ts, which this reuses the pairing helpers from.
// Everything here runs after code annotations have claimed their own texts and
// connectors, so the two never convert the same shape twice.

/** An image the slide actually emits, with its position among the slide's emitted images. */
export interface EmittedImage {
  shape: OdpShape
  index: number
}

export interface SlideCalloutResult {
  callouts: SlideCallout[]
  consumedTexts: Set<OdpShape>
  consumedConnectors: Set<OdpShape>
}

function centerOf(rect: Rect): { x: number, y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

/** Where a point sits inside an image, as 0..1 fractions, so the anchor survives the image being repositioned. */
function fractionIn(rect: Rect, x: number, y: number): { x: number, y: number } {
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1)
  return { x: clamp(rect.w > 0 ? (x - rect.x) / rect.w : 0), y: clamp(rect.h > 0 ? (y - rect.y) / rect.h : 0) }
}

/**
 * An anchor at a point of an emitted image. The image is named by position
 * here, since its public path isn't known until the draft registers its image
 * files; `applyOverlay` (draft.ts) then rewrites it to a src reference.
 */
function imageAnchor(image: EmittedImage, x: number, y: number): CalloutAnchor {
  const { x: fx, y: fy } = fractionIn(image.shape.rect!, x, y)
  return { kind: 'image', ref: { kind: 'position', index: image.index }, x: fx, y: fy }
}

export function slideCalloutsFor(
  cs: ClassifiedSlide,
  region: Rect,
  annotations: AnnotationResult,
  emittedImages: EmittedImage[],
): SlideCalloutResult {
  const result: SlideCalloutResult = { callouts: [], consumedTexts: new Set(), consumedConnectors: new Set() }
  const images = emittedImages.filter(i => i.shape.rect)
  const available = (t: OdpShape): boolean =>
    Boolean(t.rect) && !annotations.consumedTexts.has(t) && !result.consumedTexts.has(t)

  for (const connector of cs.connectors) {
    if (annotations.consumedConnectors.has(connector))
      continue

    // Each orientation gives a candidate "tip" (px, py) and its opposite end,
    // where a label would sit. An arrow into an image wins over one that only
    // has a label, since the image is the more specific target.
    let labelled: { anchor: CalloutAnchor, text: OdpShape } | undefined
    let bare: CalloutAnchor | undefined
    let pointLabelled: { anchor: CalloutAnchor, text: OdpShape } | undefined

    for (const [ax, ay, bx, by] of endpointPairs(connector)) {
      for (const [px, py, qx, qy] of [[ax, ay, bx, by], [bx, by, ax, ay]]) {
        const image = images.find(i => distanceToRect(px, py, i.shape.rect!) <= CONNECTOR_DISTANCE_CM)
        const text = cs.texts.find(t => available(t) && distanceToRect(qx, qy, t.rect!) <= CONNECTOR_DISTANCE_CM)
        if (image && text && !labelled)
          labelled = { anchor: imageAnchor(image, px, py), text }
        else if (image && !bare)
          bare = imageAnchor(image, px, py)
        else if (text && !pointLabelled)
          pointLabelled = { anchor: { kind: 'point', ...mapPoint(px, py, region) }, text }
      }
    }

    const chosen = labelled ?? pointLabelled
    if (chosen) {
      result.callouts.push({
        anchor: chosen.anchor,
        text: oneLine(chosen.text),
        box: mapPoint(chosen.text.rect!.x, chosen.text.rect!.y, region),
        step: null,
      })
      result.consumedTexts.add(chosen.text)
      result.consumedConnectors.add(connector)
    }
    else if (bare) {
      // An arrow pointing into the image with nothing to say: the theme draws
      // the arrow and no box (see useSlideCallouts' bare-arrow rule).
      result.callouts.push({ anchor: bare, text: '', box: null, step: null })
      result.consumedConnectors.add(connector)
    }
  }

  // A text box drawn on top of an image is a label: its box sits over its own
  // anchor, which is exactly the theme's "no connector" case.
  for (const text of cs.texts) {
    if (!available(text))
      continue
    const center = centerOf(text.rect!)
    const image = images.find(i => distanceToRect(center.x, center.y, i.shape.rect!) === 0)
    if (!image)
      continue
    result.callouts.push({
      anchor: imageAnchor(image, center.x, center.y),
      text: oneLine(text),
      box: mapPoint(text.rect!.x, text.rect!.y, region),
      step: null,
    })
    result.consumedTexts.add(text)
  }

  return result
}
