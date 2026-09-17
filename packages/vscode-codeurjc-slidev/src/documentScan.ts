// Scans a slides.md document's raw text for the theme's two syntactic units
// this extension cares about: manual fenced code blocks (which may contain
// inline `// [!mark]` markers) and `<<<` snippet imports (followed by
// `[!mark:...]`/`[!source ...]` directive lines). Shared by the active-buffer
// annotation logic and the reference-index builder so both agree on exactly
// the same document positions.

import type { ParsedSnippetImportLine } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { isAnchorDeclarationLine, isSourceDirectiveLine, parseSnippetImportLine } from 'codeurjc-slidev-theme/composables/useSnippetImport'

export interface FencedBlock {
  lang: string
  /** Everything after the opening fence's backticks/tildes, trimmed: language, `[title]`, `{ranges}`, `{options}`. */
  info: string
  /** 0-based document line the opening fence (```) is on. */
  fenceStartLine: number
  /** 0-based document line the closing fence (```) is on. */
  fenceEndLine: number
  /** 0-based document line the first code line is on (fenceStartLine + 1). */
  codeStartLine: number
  code: string
}

const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})\s*([^\s{[]*)(.*)$/

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
    const fenceChar = open[1][0]
    const fenceLen = open[1].length
    const lang = open[2] ?? ''
    const closeRe = new RegExp(`^\\s*${fenceChar}{${fenceLen},}\\s*$`)
    let j = i + 1
    while (j < lines.length && !closeRe.test(lines[j])) j++
    if (j >= lines.length)
      break // unterminated fence: ignore
    blocks.push({
      lang,
      info: `${lang}${open[3] ?? ''}`.trim(),
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
    if (isInsideFence(i))
      continue
    const parsed = parseSnippetImportLine(lines[i])
    if (!parsed)
      continue

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

export interface SlideSpan {
  /** 1-based slide number within this file. */
  no: number
  /** 0-based line the slide starts on (its `---` separator when it has frontmatter). */
  startLine: number
  /** 0-based line its content starts on, after any frontmatter. */
  contentStartLine: number
  /** 0-based line the slide ends before (exclusive). */
  endLine: number
  /** The slide's raw frontmatter (the headmatter for the first slide), without its `---` lines. */
  frontmatter: string
}

function advanceHtmlCommentState(line: string, inHtmlComment: boolean): boolean {
  let cursor = 0
  while (cursor < line.length) {
    if (inHtmlComment) {
      const end = line.indexOf('-->', cursor)
      if (end < 0)
        return true
      inHtmlComment = false
      cursor = end + 3
    }
    else {
      const start = line.indexOf('<!--', cursor)
      if (start < 0)
        return false
      const end = line.indexOf('-->', start + 4)
      if (end < 0)
        return true
      cursor = end + 3
    }
  }
  return inHtmlComment
}

/**
 * Splits a deck into slides exactly as `@slidev/parser` does: a line starting
 * with `---` ends a slide, and when the next line isn't blank (and the
 * separator isn't `----`), the lines up to the next `---` are that slide's
 * frontmatter. Separators inside code fences and HTML comments don't count.
 */
export function splitSlides(text: string): SlideSpan[] {
  const lines = text.split(/\r?\n/)
  const slides: SlideSpan[] = []
  let start = 0
  let contentStart = 0
  let inHtmlComment = false

  function slice(end: number): void {
    if (start === end)
      return
    const hasFrontmatter = contentStart > start && lines[start]?.startsWith('---')
    slides.push({
      no: slides.length + 1,
      startLine: start,
      contentStartLine: Math.min(contentStart, end),
      endLine: end,
      frontmatter: hasFrontmatter ? lines.slice(start + 1, Math.max(start + 1, contentStart - 1)).join('\n') : '',
    })
    start = end + 1
    contentStart = end + 1
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = rawLine.trimEnd()
    if (inHtmlComment) {
      inHtmlComment = advanceHtmlCommentState(rawLine, true)
      continue
    }
    if (line.startsWith('---')) {
      slice(i)
      const next = lines[i + 1]
      if (line[3] !== '-' && next?.trim()) {
        start = i
        for (i += 1; i < lines.length; i++) {
          if (lines[i].trimEnd() === '---')
            break
        }
        contentStart = i + 1
      }
    }
    else if (line.trimStart().startsWith('```')) {
      const level = /^\s*`+/.exec(line)![0]
      let j = i + 1
      for (; j < lines.length; j++) {
        if (lines[j].startsWith(level))
          break
      }
      if (j !== lines.length)
        i = j
    }
    else {
      inHtmlComment = advanceHtmlCommentState(rawLine, false)
    }
  }
  if (start <= lines.length - 1)
    slice(lines.length)
  return slides
}

/** The slide containing `docLine`, or the last slide before it. */
export function slideAt(slides: SlideSpan[], docLine: number): SlideSpan | undefined {
  return slides.find(s => docLine >= s.startLine && docLine < s.endLine)
    ?? [...slides].reverse().find(s => s.startLine <= docLine)
}

/** 1-based ordinal of the slide containing `docLine`, following Slidev's own slide split (see `splitSlides`). */
export function computeSlideNumber(text: string, docLine: number): number {
  return slideAt(splitSlides(text), docLine)?.no ?? 1
}
