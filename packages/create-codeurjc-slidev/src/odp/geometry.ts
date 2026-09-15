import type { GeometryRect } from 'codeurjc-slidev-theme/composables/useSlideGeometry'
import type { OdpDeck, OdpSlide, Rect } from './model'
import { CANVAS, DEFAULT_BODY_REGION, DEFAULT_BODY_REGION_PAGE_WIDTH, GEOMETRY_TOLERANCE_CM, THEME_CONTENT_BOX } from './constants'

// Maps ODP centimeter geometry onto Slidev's canvas by aligning the ODP's
// default body region with the theme's default content box, scaling each axis
// independently. Positioned images use `object-fit: contain`, so the differing
// axis scales never distort them.

/** The slide master's body (outline placeholder) region, else the corpus default scaled to the page width. */
export function bodyRegionFor(deck: OdpDeck, slide: OdpSlide): Rect {
  const fromMaster = deck.masters.get(slide.masterName)?.bodyRegion
  if (fromMaster && fromMaster.w > 0 && fromMaster.h > 0)
    return fromMaster
  const k = deck.pageWidth / DEFAULT_BODY_REGION_PAGE_WIDTH
  return { x: DEFAULT_BODY_REGION.x * k, y: DEFAULT_BODY_REGION.y * k, w: DEFAULT_BODY_REGION.w * k, h: DEFAULT_BODY_REGION.h * k }
}

/** Maps a centimeter rect to whole canvas pixels, clamped to the canvas. */
export function mapRect(r: Rect, region: Rect): GeometryRect {
  const sx = THEME_CONTENT_BOX.w / region.w
  const sy = THEME_CONTENT_BOX.h / region.h
  let x = THEME_CONTENT_BOX.x + (r.x - region.x) * sx
  let y = THEME_CONTENT_BOX.y + (r.y - region.y) * sy
  let w = r.w * sx
  let h = r.h * sy
  if (x < 0) {
    w += x
    x = 0
  }
  if (y < 0) {
    h += y
    y = 0
  }
  w = Math.min(w, CANVAS.width - x)
  h = Math.min(h, CANVAS.height - y)
  return {
    x: Math.round(Math.min(x, CANVAS.width - 1)),
    y: Math.round(Math.min(y, CANVAS.height - 1)),
    w: Math.max(1, Math.round(w)),
    h: Math.max(1, Math.round(h)),
  }
}

/** Maps a point (e.g. a callout box's top-left corner) to whole canvas pixels, clamped. */
export function mapPoint(x: number, y: number, region: Rect): { x: number, y: number } {
  const { x: px, y: py } = mapRect({ x, y, w: 1, h: 1 }, region)
  return { x: px, y: py }
}

/**
 * Content geometry for a body frame whose left or right edge moved away from
 * the master's body region (e.g. narrowed beside an image); undefined when
 * it's within tolerance. Height stays the theme default, since body frames
 * routinely differ in height without meaning anything for the layout.
 */
export function contentGeometryFor(body: Rect | undefined, region: Rect): GeometryRect | undefined {
  if (!body)
    return undefined
  const leftMoved = Math.abs(body.x - region.x) > GEOMETRY_TOLERANCE_CM
  const rightMoved = Math.abs((body.x + body.w) - (region.x + region.w)) > GEOMETRY_TOLERANCE_CM
  if (!leftMoved && !rightMoved)
    return undefined
  const mapped = mapRect(body, region)
  return { x: mapped.x, y: THEME_CONTENT_BOX.y, w: mapped.w, h: THEME_CONTENT_BOX.h }
}
