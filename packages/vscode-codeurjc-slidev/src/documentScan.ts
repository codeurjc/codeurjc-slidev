// Scans a slides.md document's raw text for the theme's two syntactic units
// this extension cares about: manual fenced code blocks (which may contain
// inline `// [!mark]` markers) and `<<<` snippet imports (followed by
// `[!mark:...]`/`[!source ...]` directive lines). Shared by the active-buffer
// annotation logic and the reference-index builder so both agree on exactly
// the same document positions.

import { parseSnippetImportLine, isAnchorDeclarationLine, isSourceDirectiveLine, type ParsedSnippetImportLine } from 'codeurjc-slidev-theme/composables/useSnippetImport'

export interface FencedBlock {
  lang: string
  /** 0-based document line the opening fence (```) is on. */
  fenceStartLine: number
  /** 0-based document line the closing fence (```) is on. */
  fenceEndLine: number
  /** 0-based document line the first code line is on (fenceStartLine + 1). */
  codeStartLine: number
  code: string
}

const FENCE_OPEN_RE = /^(\s*)(`{3,}|~{3,})\s*([^\s{[]*)/

/** Finds every top-level fenced code block in `text` (manual ``` fences, not `<<<` imports). */
export function findFencedBlocks(text: string): FencedBlock[] {
  const lines = text.split('\n')
  const blocks: FencedBlock[] = []
  let i = 0
  while (i < lines.length) {
    const open = FENCE_OPEN_RE.exec(lines[i])
    if (!open) {
      i++
      continue
    }
    const fenceChar = open[2][0]
    const fenceLen = open[2].length
    const lang = open[3] ?? ''
    const closeRe = new RegExp(`^\\s*${fenceChar}{${fenceLen},}\\s*$`)
    let j = i + 1
    while (j < lines.length && !closeRe.test(lines[j])) j++
    if (j >= lines.length) break // unterminated fence: ignore
    blocks.push({
      lang,
      fenceStartLine: i,
      fenceEndLine: j,
      codeStartLine: i + 1,
      code: lines.slice(i + 1, j).join('\n'),
    })
    i = j + 1
  }
  return blocks
}

export interface DirectiveLine {
  /** 0-based document line. */
  line: number
  text: string
  kind: 'anchor' | 'source'
}

export interface ImportBlock {
  /** 0-based document line the `<<<` import itself is on. */
  importLine: number
  parsed: ParsedSnippetImportLine
  directives: DirectiveLine[]
}

/** Finds every `<<<` snippet import (outside fenced blocks) plus its following anchor/source directive lines. */
export function findImportBlocks(text: string): ImportBlock[] {
  const lines = text.split('\n')
  const fenced = findFencedBlocks(text)
  const isInsideFence = (line: number) => fenced.some(f => line >= f.fenceStartLine && line <= f.fenceEndLine)

  const blocks: ImportBlock[] = []
  for (let i = 0; i < lines.length; i++) {
    if (isInsideFence(i)) continue
    const parsed = parseSnippetImportLine(lines[i])
    if (!parsed) continue

    const directives: DirectiveLine[] = []
    let j = i + 1
    while (j < lines.length) {
      const line = lines[j].trim()
      if (isAnchorDeclarationLine(line)) {
        directives.push({ line: j, text: line, kind: 'anchor' })
        j++
        continue
      }
      if (isSourceDirectiveLine(line)) {
        directives.push({ line: j, text: line, kind: 'source' })
        j++
        continue
      }
      break
    }
    blocks.push({ importLine: i, parsed, directives })
  }
  return blocks
}

const SLIDE_SEPARATOR_RE = /^---\s*$/

/**
 * 1-based ordinal of the slide containing `docLine`, counting standalone
 * `---` separators (the frontmatter's own opening/closing pair is not a
 * separator -- only the first pair of `---` lines at the very start of the
 * document is treated as frontmatter).
 */
export function computeSlideNumber(text: string, docLine: number): number {
  const lines = text.split('\n')
  let slide = 1
  let sawFrontmatterOpen = false
  let sawFrontmatterClose = false
  for (let i = 0; i < docLine && i < lines.length; i++) {
    if (!SLIDE_SEPARATOR_RE.test(lines[i])) continue
    if (!sawFrontmatterOpen) {
      sawFrontmatterOpen = true
      continue
    }
    if (!sawFrontmatterClose) {
      sawFrontmatterClose = true
      continue
    }
    slide++
  }
  return slide
}
