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

export function computeBelowPreset(content: Rect, slideWidth: number, imageAspectRatio: number, fullContentWidth: number): PresetResult {
  // Reset to full width rather than preserving content.w: this preset must
  // undo a prior "Right" narrowing, not just leave it as-is.
  const newContent: Rect = { x: 0, y: content.y, w: fullContentWidth, h: content.h }
  const imageW = Math.round(slideWidth * 0.4)
  const imageH = Math.round(imageW / imageAspectRatio)
  const image: Rect = {
    x: Math.round((slideWidth - imageW) / 2),
    y: content.y + content.h + GAP,
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
