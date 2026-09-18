// Scans a slides.md document's raw text for the theme's syntactic units this
// extension cares about: manual fenced code blocks (which may contain inline
// `// [!mark]` markers), `<<<` snippet imports (followed by
// `[!mark:...]`/`[!source ...]` directive lines), and the content a slide's
// `geometry` frontmatter can position -- images, tables, `<div id>` wrappers
// and declared ids. Shared by the active-buffer annotation logic, the
// reference-index builder and the geometry candidate builder so they all
// agree on exactly the same document positions.

import type { ParsedSnippetImportLine } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { parseFenceInfo } from 'codeurjc-slidev-theme/composables/fenceInfo'
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

/** A content image's authored src, as written in the markdown or an `<img>` tag. */
export interface ScannedImage {
  /** 0-based document line the image is written on. */
  line: number
  /** The `src` exactly as authored -- what `markdownImageSrc.ts` stamps into `data-src`. */
  src: string
}

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(\s*([^\s)]+)/g
const HTML_IMAGE_RE = /<img[^>]*?\ssrc\s*=\s*(["'])(.*?)\1/gi

/**
 * Every content image in `text`, in document order -- the order
 * `layouts/default.vue` reads `<img>`s in, and so the order `geometry.images`
 * positional entries and `src#N` occurrences count against. Images inside
 * fenced code blocks are code, not content, and don't count.
 */
export function findImages(text: string): ScannedImage[] {
  const lines = text.split('\n')
  const fenced = findFencedBlocks(text)
  const isInsideFence = (line: number) => fenced.some(f => line >= f.fenceStartLine && line <= f.fenceEndLine)

  const images: ScannedImage[] = []
  for (let i = 0; i < lines.length; i++) {
    if (isInsideFence(i))
      continue
    const found: { column: number, src: string }[] = []
    for (const m of lines[i].matchAll(MARKDOWN_IMAGE_RE))
      found.push({ column: m.index ?? 0, src: m[1] })
    for (const m of lines[i].matchAll(HTML_IMAGE_RE))
      found.push({ column: m.index ?? 0, src: m[2] })
    // A line can carry both forms; document order within the line is column order.
    found.sort((a, b) => a.column - b.column)
    for (const { src } of found)
      images.push({ line: i, src })
  }
  return images
}

/** An element carrying an `id`, and what kind of thing the id is on. */
export interface ScannedId {
  /** 0-based document line the id is declared on. */
  line: number
  id: string
  /**
   * `fence` -- a code or mermaid fence's `{id: '…'}` option.
   * `div` -- a `<div id="…">` wrapper.
   * `other` -- any other element with an id, which can only ever be a wrong-kind match.
   */
  kind: 'fence' | 'div' | 'other'
}

/** A `<div id="…">` and the single element it wraps, if that element is a table or `<<<` import. */
export interface ScannedDivWrapper {
  /** 0-based document line the opening `<div>` is on. */
  line: number
  id: string
  /** 0-based line of the wrapped element's start, or null when the div doesn't wrap exactly one table or import. */
  wrappedLine: number | null
}

const DIV_OPEN_RE = /^\s*<div[^>]*?\sid\s*=\s*(["'])(.*?)\1[^>]*>\s*$/i
const DIV_CLOSE_RE = /^\s*<\/div>\s*$/i
const HTML_ID_RE = /<(\w+)[^>]*?\sid\s*=\s*(["'])(.*?)\2/gi
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/

/** True if `info`'s `{…}` options declare `id: '…'`, and that id. */
export function fenceOptionId(options: string | undefined): string | null {
  if (!options)
    return null
  // Only a quoted id lands on the element: unquoted, Vue reads it as a variable.
  return /\bid\s*:\s*(["'])(.*?)\1/.exec(options)?.[2] ?? null
}

/**
 * `<div id="…">` blocks whose only child is a markdown table or a `<<<`
 * import -- the two things the theme lets a wrapper id position (see
 * `resolveGeometryElements`). A div wrapping anything else reports
 * `wrappedLine: null`, so its id can still be reported as a wrong-kind match.
 */
export function findDivWrappers(text: string): ScannedDivWrapper[] {
  const lines = text.split('\n')
  const fenced = findFencedBlocks(text)
  const isInsideFence = (line: number) => fenced.some(f => line >= f.fenceStartLine && line <= f.fenceEndLine)

  const wrappers: ScannedDivWrapper[] = []
  for (let i = 0; i < lines.length; i++) {
    if (isInsideFence(i))
      continue
    const open = DIV_OPEN_RE.exec(lines[i])
    if (!open)
      continue
    // Collect the non-blank lines up to the matching close, at this nesting level only.
    const body: number[] = []
    let depth = 1
    let j = i + 1
    for (; j < lines.length; j++) {
      if (DIV_CLOSE_RE.test(lines[j])) {
        depth--
        if (depth === 0)
          break
      }
      else if (DIV_OPEN_RE.test(lines[j]) || /^\s*<div\b/i.test(lines[j])) {
        depth++
      }
      if (lines[j].trim() !== '')
        body.push(j)
    }
    if (j >= lines.length) {
      wrappers.push({ line: i, id: open[2], wrappedLine: null })
      continue
    }
    wrappers.push({ line: i, id: open[2], wrappedLine: wrappedElementLine(lines, body) })
    i = j
  }
  return wrappers
}

/** The start line of the single table or `<<<` import `body` consists of, else null. */
function wrappedElementLine(lines: string[], body: number[]): number | null {
  if (body.length === 0)
    return null
  if (body.length === 1 && parseSnippetImportLine(lines[body[0]]))
    return body[0]
  // A table: every line is a pipe row, and there are at least a header and a delimiter.
  if (body.length >= 2 && body.every(n => TABLE_ROW_RE.test(lines[n])))
    return body[0]
  return null
}

/**
 * Every markdown table in `text`, by the line its header row is on, in
 * document order. A table is a run of `|`-delimited lines with a delimiter
 * row (`|---|`) second.
 */
export function findTables(text: string): { line: number }[] {
  const lines = text.split('\n')
  const fenced = findFencedBlocks(text)
  const isInsideFence = (line: number) => fenced.some(f => line >= f.fenceStartLine && line <= f.fenceEndLine)

  const tables: { line: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    if (isInsideFence(i) || !TABLE_ROW_RE.test(lines[i]))
      continue
    const delimiter = lines[i + 1]
    if (delimiter && TABLE_ROW_RE.test(delimiter) && /^[\s|:-]+$/.test(delimiter)) {
      tables.push({ line: i })
      // Skip the rest of this table's rows.
      let j = i + 2
      while (j < lines.length && TABLE_ROW_RE.test(lines[j]) && !isInsideFence(j)) j++
      i = j - 1
    }
  }
  return tables
}

/** Every `id` declared in `text`, from fence options and HTML attributes alike. */
export function findIds(text: string): ScannedId[] {
  const lines = text.split('\n')
  const ids: ScannedId[] = []
  const fenced = findFencedBlocks(text)

  for (const block of fenced) {
    const id = fenceOptionId(parseFenceInfo(block.info).options)
    if (id)
      ids.push({ line: block.fenceStartLine, id, kind: 'fence' })
  }
  const isInsideFence = (line: number) => fenced.some(f => line >= f.fenceStartLine && line <= f.fenceEndLine)
  for (let i = 0; i < lines.length; i++) {
    if (isInsideFence(i))
      continue
    for (const m of lines[i].matchAll(HTML_ID_RE))
      ids.push({ line: i, id: m[3], kind: m[1].toLowerCase() === 'div' ? 'div' : 'other' })
  }
  return ids.sort((a, b) => a.line - b.line)
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
