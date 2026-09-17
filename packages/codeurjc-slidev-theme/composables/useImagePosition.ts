interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface PresetResult {
  content: Rect
  image: Rect
}

const GAP = 24
// Cap how much of the box the image can claim, so an extreme (e.g. wide
// panoramic) aspect ratio can't squeeze the content column down to nothing.
const RIGHT_IMAGE_MAX_WIDTH_RATIO = 0.5
// "Below": the content keeps between these fractions of the height below its
// top, the image fills the rest, and never spans more than this much of the
// canvas width. A small margin keeps the image off the canvas's bottom edge.
const BELOW_CONTENT_MIN_RATIO = 0.3
const BELOW_CONTENT_MAX_RATIO = 0.6
const BELOW_IMAGE_MAX_WIDTH_RATIO = 0.8
const BELOW_BOTTOM_MARGIN = 16

export interface CanvasSize {
  w: number
  h: number
}

/**
 * Content full width on top, image centred below it -- always inside the
 * canvas. The height below the content's top is split: the content box takes
 * its rendered text height, clamped to 30-60% of it (content autofit shrinks
 * text that doesn't fit), and the image is fitted by aspect ratio into what's
 * left, at most 80% of the canvas width.
 */
export function computeBelowPreset(content: Rect, canvas: CanvasSize, imageAspectRatio: number, textHeight: number, fullContentWidth: number): PresetResult {
  const available = Math.max(0, canvas.h - content.y - BELOW_BOTTOM_MARGIN)
  const contentH = Math.round(Math.min(Math.max(textHeight, available * BELOW_CONTENT_MIN_RATIO), available * BELOW_CONTENT_MAX_RATIO))
  // Reset to full width rather than preserving content.w: this preset must
  // undo a prior "Right" narrowing, not just leave it as-is.
  const newContent: Rect = { x: 0, y: content.y, w: fullContentWidth, h: contentH }
  const boxW = canvas.w * BELOW_IMAGE_MAX_WIDTH_RATIO
  const boxH = Math.max(1, available - contentH - GAP)
  const ratio = imageAspectRatio > 0 ? imageAspectRatio : 1
  const scale = Math.min(boxW / ratio, boxH)
  const imageH = Math.max(1, Math.floor(scale))
  const imageW = Math.max(1, Math.floor(imageH * ratio))
  const image: Rect = {
    x: Math.round((canvas.w - imageW) / 2),
    y: content.y + contentH + GAP,
    w: imageW,
    h: imageH,
  }
  return { content: newContent, image }
}

export function computeRightPreset(content: Rect, imageAspectRatio: number): PresetResult {
  // Derive the image's width from the content box's height and the image's
  // own aspect ratio first (so height matches content by construction for
  // any normal aspect ratio), then let the content column take whatever
  // width remains — guaranteeing no overlap, rather than fixing the split
  // ratio up front and clamping the image into whatever's left.
  const maxImageW = Math.round(content.w * RIGHT_IMAGE_MAX_WIDTH_RATIO)
  const rawImageW = Math.round(content.h * imageAspectRatio)
  const imageW = Math.min(rawImageW, maxImageW)
  const imageH = imageW === rawImageW ? content.h : Math.round(imageW / imageAspectRatio)
  const newContentW = content.w - imageW - GAP
  const newContent: Rect = { x: content.x, y: content.y, w: newContentW, h: content.h }
  const image: Rect = {
    x: content.x + newContentW + GAP,
    y: content.y,
    w: imageW,
    h: imageH,
  }
  return { content: newContent, image }
}
