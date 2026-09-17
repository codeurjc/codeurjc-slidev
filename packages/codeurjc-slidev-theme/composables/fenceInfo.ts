// A fence's info string, split the way Slidev's own `wrapper_default` code
// block transformer splits it: ```` ```lang [title] {ranges} {options} rest ````.
// The theme wraps marked and source-linked fences itself, so it has to forward
// the same ranges and options Slidev would; the VS Code extension's click model
// reads them too.

// Slidev's `RE_BLOCK_INFO` (node/syntax/codeblock/wrapper.ts), verbatim.
const BLOCK_INFO_RE = /^([\w'-]+)?(?:[ \t]*|[ \t][ \w\t'-]*)(?:\[([^\]]*)\])?[ \t]*(?:\{([\w,|\-*]+)\})?[ \t]*(\{[^}]*\})?(.*)$/

export interface FenceInfo {
  lang: string
  title: string
  /** Line-highlight ranges, one per click segment (`{1|3-4|all}` → `['1', '3-4', 'all']`). */
  ranges: string[]
  /** The raw `{…}` options object literal, if any (e.g. `{at: 3, lines: true}`). */
  options?: string
  rest: string
}

export function parseFenceInfo(info: string): FenceInfo {
  const [, lang = '', title = '', rangeStr = '', options, rest = ''] = BLOCK_INFO_RE.exec(info.trim()) ?? []
  const ranges = rangeStr.trim() ? rangeStr.trim().split('|').map(r => r.trim()) : []
  return { lang, title, ranges, options: options || undefined, rest }
}
