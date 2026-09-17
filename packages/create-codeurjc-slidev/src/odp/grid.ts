import type { DraftBlock, DraftImage, SlideDraft } from './draft'
import type { Rect } from './model'

// Side-by-side content becomes grid columns rather than positioned geometry:
// a code block beside another code block, an image or the body text is laid
// out with a UnoCSS grid in the slide's markdown, so it reflows like any other
// content. Computed from the final draft (after build-up merging), so a merged
// run gets the same grid its last slide would.

export type GridItem
  = | { kind: 'block', block: DraftBlock, rect: Rect }
    | { kind: 'image', image: DraftImage, rect: Rect }

export interface GridColumn {
  /** Horizontal extent of the column's frames on the ODP slide, in cm. */
  width: number
  /** Top to bottom. */
  items: GridItem[]
}

export interface DraftGrid {
  /** Left to right. */
  columns: GridColumn[]
}

export interface DraftLayout {
  grids: DraftGrid[]
  /** Draft blocks inside a grid, with the grid they belong to. */
  blockGrid: Map<DraftBlock, DraftGrid>
  /** Images inside a grid; they get no `geometry.images` entry. */
  gridImages: Set<DraftImage>
  /** Every image in the order the slide's markdown shows it. */
  images: DraftImage[]
  /** Whether the body text is a grid column (then the slide gets no `geometry.content`). */
  bodyInGrid: boolean
}

/** Frames overlapping by less than this (cm) still count as beside each other. */
const OVERLAP_TOLERANCE = 0.3
/** Share of the shorter item's height two items must have in common to be side by side. */
const MIN_SHARED_HEIGHT = 0.3

function horizontalOverlap(a: { x: number, w: number }, b: { x: number, w: number }): number {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
}

export function sideBySide(a: Rect, b: Rect): boolean {
  if (horizontalOverlap(a, b) > OVERLAP_TOLERANCE)
    return false
  const shared = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return shared >= MIN_SHARED_HEIGHT * Math.min(a.h, b.h)
}

function columnsOf(items: GridItem[]): GridColumn[] {
  const spans: { x: number, w: number, items: GridItem[] }[] = []
  for (const item of [...items].sort((a, b) => a.rect.x - b.rect.x)) {
    const touching = spans.filter(s => horizontalOverlap(s, item.rect) > OVERLAP_TOLERANCE)
    const left = Math.min(item.rect.x, ...touching.map(s => s.x))
    const right = Math.max(item.rect.x + item.rect.w, ...touching.map(s => s.x + s.w))
    const merged = { x: left, w: right - left, items: [...touching.flatMap(s => s.items), item] }
    spans.splice(0, spans.length, ...spans.filter(s => !touching.includes(s)), merged)
  }
  return spans
    .sort((a, b) => a.x - b.x)
    .map(s => ({ width: s.w, items: s.items.sort((a, b) => a.rect.y - b.rect.y) }))
}

export function layoutDraft(draft: SlideDraft): DraftLayout {
  const cs = draft.classified
  const items: GridItem[] = []
  for (const block of draft.blocks) {
    if (block.kind === 'code' && block.code.shape.rect)
      items.push({ kind: 'block', block, rect: block.code.shape.rect })
  }
  // A body split by a diagram has no single frame to place.
  const bodies = draft.blocks.filter(b => b.kind === 'body')
  if (bodies.length === 1 && cs.bodyShape?.rect)
    items.push({ kind: 'block', block: bodies[0], rect: cs.bodyShape.rect })
  for (const image of draft.images) {
    if (image.odpRect)
      items.push({ kind: 'image', image, rect: image.odpRect })
  }

  const grids: DraftGrid[] = []
  const seen = new Set<GridItem>()
  for (const start of items) {
    if (seen.has(start))
      continue
    const component = [start]
    seen.add(start)
    for (let i = 0; i < component.length; i++) {
      for (const other of items) {
        if (!seen.has(other) && sideBySide(component[i].rect, other.rect)) {
          seen.add(other)
          component.push(other)
        }
      }
    }
    if (!component.some(item => item.kind === 'block' && item.block.kind === 'code'))
      continue
    const columns = columnsOf(component)
    if (columns.length >= 2)
      grids.push({ columns })
  }

  const blockGrid = new Map<DraftBlock, DraftGrid>()
  const gridImages = new Set<DraftImage>()
  for (const grid of grids) {
    for (const item of grid.columns.flatMap(c => c.items)) {
      if (item.kind === 'block')
        blockGrid.set(item.block, grid)
      else
        gridImages.add(item.image)
    }
  }

  // Grids render where their first block would; loose images follow all blocks.
  const images: DraftImage[] = []
  const rendered = new Set<DraftGrid>()
  for (const block of draft.blocks) {
    const grid = blockGrid.get(block)
    if (!grid || rendered.has(grid))
      continue
    rendered.add(grid)
    for (const item of grid.columns.flatMap(c => c.items)) {
      if (item.kind === 'image')
        images.push(item.image)
    }
  }
  images.push(...draft.images.filter(image => !gridImages.has(image)))

  return { grids, blockGrid, gridImages, images, bodyInGrid: bodies.some(b => blockGrid.has(b)) }
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** `grid-cols-2`, or `grid-cols-[3fr_2fr]` from the column widths rounded to 0.5 cm. */
export function gridColumnsClass(columns: GridColumn[]): string {
  const halves = columns.map(c => Math.max(1, Math.round(c.width * 2)))
  const divisor = halves.reduce(gcd)
  const fractions = halves.map(h => h / divisor)
  return fractions.every(f => f === fractions[0])
    ? `grid-cols-${columns.length}`
    : `grid-cols-[${fractions.map(f => `${f}fr`).join('_')}]`
}

/** The grid's markup around each column's already rendered markdown (blank lines keep it parsed as markdown). */
export function renderGrid(grid: DraftGrid, columnMarkdown: string[]): string {
  const columns = columnMarkdown.map(md => `<div class="min-w-0">\n\n${md}\n\n</div>`)
  return `<div class="grid ${gridColumnsClass(grid.columns)} gap-6">\n${columns.join('\n')}\n</div>`
}
