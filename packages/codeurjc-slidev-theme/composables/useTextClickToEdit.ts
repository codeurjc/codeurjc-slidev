import MarkdownIt from 'markdown-it'

// The set of rendered tags a double-click can resolve to. Any Slidev-specific
// wrapper (v-click groups, custom container divs, etc.) never appears here,
// so `Element.closest()` walks straight past them to find the nearest real
// content block -- no separate skip-list bookkeeping needed.
export const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, tr'

export interface MarkdownBlock {
  type: string
  startLine: number
  endLine: number
}

const md = new MarkdownIt()

// markdown-it's token stream is already a flat, depth-first (document-order)
// walk of the source -- open tokens appear before the tokens nested inside
// them -- so no manual recursion is needed to match DOM document order.
export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const tokens = md.parse(source, {})
  const blocks: MarkdownBlock[] = []
  for (const token of tokens) {
    if (!token.map || token.hidden) continue
    let type: string | null = null
    if (token.type === 'paragraph_open') type = 'p'
    else if (token.type === 'heading_open') type = token.tag
    else if (token.type === 'list_item_open') type = 'li'
    else if (token.type === 'blockquote_open') type = 'blockquote'
    else if (token.type === 'fence' || token.type === 'code_block') type = 'pre'
    else if (token.type === 'tr_open') type = 'tr'
    if (!type) continue
    blocks.push({ type, startLine: token.map[0], endLine: token.map[1] })
  }
  return blocks
}

export interface CharRange {
  start: number
  end: number
}

function buildLineOffsets(source: string): number[] {
  const lines = source.split('\n')
  const offsets: number[] = [0]
  for (const line of lines) offsets.push(offsets[offsets.length - 1] + line.length + 1)
  return offsets
}

// Converts a markdown-it [startLine, endLine) line range into a character
// offset range within the same source string, trimming the block's trailing
// newline(s) so the selection covers just the block's own text.
export function lineRangeToCharRange(source: string, startLine: number, endLine: number): CharRange {
  const offsets = buildLineOffsets(source)
  const start = offsets[startLine] ?? source.length
  let end = Math.min(offsets[endLine] ?? source.length, source.length)
  while (end > start && source[end - 1] === '\n') end--
  return { start, end }
}

export function collectDomBlocks(container: Element): Element[] {
  return Array.from(container.querySelectorAll(BLOCK_SELECTOR))
}

export function blockTypeForElement(el: Element): string {
  return el.tagName.toLowerCase()
}

// Resolves a double-clicked DOM node to its raw-markdown character range.
// Returns null whenever the DOM-side and markdown-it-side block lists don't
// line up with confidence -- callers should treat null as "leave the
// existing selection alone", never as "guess".
export function resolveBlockRange(container: Element, target: Element, source: string): CharRange | null {
  const matched = target.closest(BLOCK_SELECTOR)
  if (!matched || !container.contains(matched)) return null

  const domBlocks = collectDomBlocks(container)
  const index = domBlocks.indexOf(matched)
  if (index === -1) return null

  const mdBlocks = parseMarkdownBlocks(source)
  if (mdBlocks.length !== domBlocks.length) return null

  const block = mdBlocks[index]
  if (!block || block.type !== blockTypeForElement(matched)) return null

  return lineRangeToCharRange(source, block.startLine, block.endLine)
}
