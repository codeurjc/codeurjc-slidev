// Quick fixes that close the gap between a `geometry.elements` entry and the
// element it is supposed to position.
//
// Writing an id into markdown is deliberately something the theme's own Layout
// tab never does -- it publishes `editor.unkeyedElements` ("2 code blocks and
// 1 mermaid diagram need an id to be positioned") and stops there, which is
// the right boundary for a browser editor patching a file over HTTP. That
// leaves a gap only an editor extension can fill, and these are it.
//
// Pure: returns plain edits the `vscode` adapter turns into a WorkspaceEdit.

import type { SlideSpan } from '../documentScan'
import type { SlideCandidates } from './candidates'
import { parseFenceInfo } from 'codeurjc-slidev-theme/composables/fenceInfo'
import { parseSlideGeometry } from 'codeurjc-slidev-theme/composables/useSlideGeometry'
import { splitSlides } from '../documentScan'
import { collectSlideCandidates } from './candidates'
import { indexFrontmatter } from './frontmatterRanges'
import { hasExternalContent } from './slideIncludes'

export interface TextEdit {
  startLine: number
  startChar: number
  endLine: number
  endChar: number
  newText: string
}

export interface GeometryQuickFix {
  title: string
  edits: TextEdit[]
  /** The 0-based document line the fix is offered on. */
  line: number
}

/** Default rect for a newly created entry: a readable box in the content area. */
const NEW_ENTRY_RECT = { x: 31, y: 98, w: 440, h: 220 }

/**
 * Fixes offered for the cursor's line.
 *
 * Two kinds: an `id:` entry that matches nothing can have its id added to a
 * fence on the same slide, and an unkeyed code block, mermaid diagram or table
 * can be given both an id and an entry positioning it.
 */
export function geometryQuickFixes(text: string, line: number): GeometryQuickFix[] {
  const lines = text.split('\n')
  const slide = splitSlides(text).find(s => line >= s.startLine && line < s.endLine)
  if (!slide)
    return []
  const layout = /^layout:\s*['"]?([^'"\s#]+)/m.exec(slide.frontmatter)?.[1]
  if (layout && layout !== 'default')
    return []
  if (hasExternalContent(slide))
    return []

  const candidates = collectSlideCandidates(text, slide)
  return [
    ...unmatchedIdFixes(lines, slide, candidates, line),
    ...unkeyedElementFixes(lines, slide, candidates, line),
  ]
}

/** On a `{id: x}` entry whose id is on nothing: offer to put that id on a fence. */
function unmatchedIdFixes(lines: string[], slide: SlideSpan, candidates: SlideCandidates, line: number): GeometryQuickFix[] {
  const entryId = /\bid\s*:\s*(['"]?)([^,}'"\s]+)\1/.exec(lines[line] ?? '')?.[2]
  if (!entryId || line >= slide.contentStartLine - 1 || line <= slide.startLine)
    return []
  // Already on something? Then there's nothing to fix.
  if (candidates.candidates.some(c => c.id === entryId || c.wrapperId === entryId))
    return []

  const fixes: GeometryQuickFix[] = []
  candidates.candidates.forEach((candidate, i) => {
    if (candidate.id || candidate.importPath || candidate.kind === 'table')
      return
    const fenceLine = candidates.candidateLines[i]
    const edit = addIdToFence(lines, fenceLine, entryId)
    if (edit)
      fixes.push({ title: `Add {id: '${entryId}'} to this ${candidate.kind} block (line ${fenceLine + 1})`, edits: [edit], line })
  })
  return fixes
}

/** On an unkeyed element: offer to give it an id and a `geometry.elements` entry. */
function unkeyedElementFixes(lines: string[], slide: SlideSpan, candidates: SlideCandidates, line: number): GeometryQuickFix[] {
  const index = candidates.candidateLines.indexOf(line)
  if (index < 0)
    return []
  const candidate = candidates.candidates[index]
  if (candidate.id || candidate.wrapperId)
    return []

  const frontmatter = indexFrontmatter(slide.frontmatter, slide.startLine + 1)
  const geometry = parseSlideGeometry(frontmatter.data)
  // A code block already positioned by its import path or title needs no id.
  if (candidate.kind === 'code') {
    const key = candidate.importPath ?? candidate.title
    if (key && geometry.elements.some(e => e?.key.kind === 'code' && e.key.text === key))
      return []
  }
  if (candidate.kind === 'table')
    return [] // A table is positioned through a `<div id>` wrapper, not an id of its own.

  const id = suggestId(candidate.kind, candidates)
  const fenceEdit = addIdToFence(lines, line, id)
  if (!fenceEdit)
    return []
  const entryEdit = addElementEntry(lines, slide, `{id: ${id}, x: ${NEW_ENTRY_RECT.x}, y: ${NEW_ENTRY_RECT.y}, w: ${NEW_ENTRY_RECT.w}, h: ${NEW_ENTRY_RECT.h}}`)
  if (!entryEdit)
    return []
  return [{ title: `Position this ${candidate.kind} block with geometry.elements`, edits: [fenceEdit, entryEdit], line }]
}

/**
 * Adds `{id: '…'}` to a fence's info string, merging into an existing options
 * object when there is one. The id is always quoted: unquoted, Vue reads it as
 * a variable and no id ever lands on the element.
 */
function addIdToFence(lines: string[], fenceLine: number, id: string): TextEdit | null {
  const raw = lines[fenceLine]
  if (raw === undefined)
    return null
  // Split the fence marker off by hand: a regex alternation of `` `{3,} ``
  // against a trailing `.*` can trade characters with it, which is the kind of
  // backtracking the lint rules (rightly) reject.
  const indent = raw.length - raw.trimStart().length
  const fenceChar = raw[indent]
  if (fenceChar !== '`' && fenceChar !== '~')
    return null
  let markerEnd = indent
  while (raw[markerEnd] === fenceChar) markerEnd++
  if (markerEnd - indent < 3)
    return null
  const info = raw.slice(markerEnd)
  const parsed = parseFenceInfo(info)
  const quoted = `'${id.replace(/'/g, '\\\'')}'`

  if (parsed.options) {
    // Merge into the existing `{…}` options object.
    const at = info.lastIndexOf(parsed.options)
    const inner = parsed.options.slice(1, -1).trim()
    const merged = `{${inner ? `${inner}, ` : ''}id: ${quoted}}`
    return {
      startLine: fenceLine,
      startChar: markerEnd + at,
      endLine: fenceLine,
      endChar: markerEnd + at + parsed.options.length,
      newText: merged,
    }
  }
  return {
    startLine: fenceLine,
    startChar: raw.length,
    endLine: fenceLine,
    endChar: raw.length,
    newText: ` {id: ${quoted}}`,
  }
}

/** Appends an entry to the slide's `geometry.elements`, creating the keys it needs. */
function addElementEntry(lines: string[], slide: SlideSpan, entry: string): TextEdit | null {
  const frontmatterStart = slide.startLine + 1
  const frontmatterEnd = slide.contentStartLine - 1
  const hasFrontmatter = frontmatterEnd > frontmatterStart && lines[slide.startLine]?.startsWith('---')

  if (!hasFrontmatter) {
    // No frontmatter at all: open one above the slide's content.
    const at = slide.startLine
    return {
      startLine: at,
      startChar: 0,
      endLine: at,
      endChar: 0,
      newText: `---\ngeometry:\n  elements:\n    - ${entry}\n---\n\n`,
    }
  }

  const body = lines.slice(frontmatterStart, frontmatterEnd)
  const geometryAt = body.findIndex(l => /^geometry\s*:/.test(l))
  if (geometryAt < 0) {
    return {
      startLine: frontmatterEnd,
      startChar: 0,
      endLine: frontmatterEnd,
      endChar: 0,
      newText: `geometry:\n  elements:\n    - ${entry}\n`,
    }
  }

  const elementsAt = body.findIndex((l, i) => i > geometryAt && /^\s+elements\s*:/.test(l))
  if (elementsAt < 0) {
    return {
      startLine: frontmatterStart + geometryAt + 1,
      startChar: 0,
      endLine: frontmatterStart + geometryAt + 1,
      endChar: 0,
      newText: `  elements:\n    - ${entry}\n`,
    }
  }

  // Append after the last entry of the existing list.
  let last = elementsAt
  for (let i = elementsAt + 1; i < body.length; i++) {
    if (/^\s+-\s/.test(body[i]) || /^\s{6,}\S/.test(body[i]))
      last = i
    else if (body[i].trim() !== '')
      break
  }
  const indent = /^(\s*)-/.exec(body[last])?.[1] ?? '    '
  return {
    startLine: frontmatterStart + last + 1,
    startChar: 0,
    endLine: frontmatterStart + last + 1,
    endChar: 0,
    newText: `${indent}- ${entry}\n`,
  }
}

/** A short id that isn't taken on this slide. */
function suggestId(kind: string, candidates: SlideCandidates): string {
  const taken = new Set(candidates.otherIds)
  const base = kind === 'mermaid' ? 'diagram' : kind
  if (!taken.has(base))
    return base
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}${n}`))
      return `${base}${n}`
  }
}
