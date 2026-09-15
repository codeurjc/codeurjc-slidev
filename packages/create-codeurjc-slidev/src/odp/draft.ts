import type { GeometryRect } from 'codeurjc-slidev-theme/composables/useSlideGeometry'
import type { AnnotationResult, CodeMark } from './annotations'
import type { ClassifiedSlide, CoverFields, SlideRole } from './classify'
import type { CodeMatch, IndexedFile, RepoBase } from './code'
import type { OdpDeck, OdpShape, Paragraph, Rect } from './model'
import { basename, extname } from 'node:path'
import { annotateCodes, renderAnchorMarks, renderInlineMarks } from './annotations'
import { codeLinesOf, commentToken, importLineFor, inferLanguage, isWholeFile, languageForFilename, matchCode, normalizeCodeLine, sourceUrl } from './code'
import { bodyRegionFor, contentGeometryFor, mapRect } from './geometry'
import { paragraphsToMarkdown, runsToMarkdown, tableToMarkdown } from './markdown'
import { shapeText } from './model'

// A slide draft: everything needed to write one slide of slides.md, still in
// structured form so build-up merging can assign click steps before rendering.

export interface DraftContext {
  deck: OdpDeck
  codeIndex: IndexedFile[]
  repoBase?: RepoBase
  /** Collected image files: public path (e.g. `images/a.png`) -> data. Filled while drafting. */
  images: Map<string, Uint8Array>
  /** Archive href -> public path, so a picture reused on several slides is written once. */
  imagePaths: Map<string, string>
}

export interface DraftCode {
  shape: OdpShape
  lines: string[]
  language: string
  title?: string
  terminal: boolean
  match: CodeMatch
  marks: CodeMark[]
}

export type DraftBlock
  = | { kind: 'body', y: number, paragraphs: Paragraph[], steps?: number[] }
    | { kind: 'code', y: number, code: DraftCode }
    | { kind: 'markdown', y: number, markdown: string }

export interface DraftImage {
  key: string
  publicPath: string
  rect: GeometryRect
  step?: number
}

export interface SlideDraft {
  odpNumbers: number[]
  odpNames: string[]
  hidden: boolean
  role: SlideRole
  cover?: CoverFields
  titleLines: string[]
  heading?: string
  blocks: DraftBlock[]
  images: DraftImage[]
  contentGeometry?: GeometryRect
  /** Losses found while drafting (rendering may add more, e.g. for code). */
  losses: string[]
  classified: ClassifiedSlide
  annotations: AnnotationResult
}

const BROWSER_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.avif'])

function countLosses(descriptions: string[]): string[] {
  const counts = new Map<string, number>()
  for (const d of descriptions)
    counts.set(d, (counts.get(d) ?? 0) + 1)
  return [...counts].map(([d, n]) => (n > 1 ? `${d} (×${n})` : d))
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function pickImageHref(shape: OdpShape): string | undefined {
  return shape.images.find(h => extname(h).toLowerCase() === '.svg') ?? shape.images[0]
}

function publicImagePath(href: string, ctx: DraftContext): string | undefined {
  const existing = ctx.imagePaths.get(href)
  if (existing)
    return existing
  const data = ctx.deck.pictures.get(href)
  if (!data)
    return undefined
  let name = basename(href)
  const taken = new Set(ctx.images.keys())
  for (let i = 2; taken.has(`images/${name}`); i++)
    name = `${basename(href, extname(href))}-${i}${extname(href)}`
  const path = `images/${name}`
  ctx.images.set(path, data)
  ctx.imagePaths.set(href, path)
  return path
}

export function draftSlide(cs: ClassifiedSlide, ctx: DraftContext): SlideDraft {
  const { slide } = cs
  const region = bodyRegionFor(ctx.deck, slide)
  const losses: string[] = []
  const annotations = annotateCodes(cs, region)
  const draft: SlideDraft = {
    odpNumbers: [slide.index],
    odpNames: [slide.name],
    hidden: slide.hidden,
    role: cs.role,
    cover: cs.cover,
    titleLines: cs.titleLines,
    heading: cs.heading,
    blocks: [],
    images: [],
    losses,
    classified: cs,
    annotations,
  }
  if (cs.role !== 'content')
    return draft

  if (cs.bodyShape && cs.bodyParagraphs.length > 0)
    draft.blocks.push({ kind: 'body', y: cs.bodyShape.rect?.y ?? 0, paragraphs: cs.bodyParagraphs })

  for (const code of cs.codes) {
    const lines = codeLinesOf(code.shape)
    const language = code.terminal ? 'shell' : inferLanguage(lines, code.label)
    const match = ctx.codeIndex.length > 0 && !code.terminal ? matchCode(lines, ctx.codeIndex, code.projectLabel) : { kind: 'none' as const, matched: 0, total: 0 }
    draft.blocks.push({
      kind: 'code',
      y: code.shape.rect?.y ?? 0,
      code: { shape: code.shape, lines, language, title: code.label, terminal: code.terminal, match, marks: annotations.marksByCode.get(code) ?? [] },
    })
  }

  for (const table of cs.tables) {
    const md = tableToMarkdown(table.table ?? [])
    if (md)
      draft.blocks.push({ kind: 'markdown', y: table.rect?.y ?? 0, markdown: md })
  }

  for (const text of cs.texts) {
    if (annotations.consumedTexts.has(text))
      continue
    if (text.hasBorder || text.hasFill) {
      const preview = shapeText(text).replace(/\s+/g, ' ').trim()
      losses.push(`shape with text omitted ("${preview.length > 40 ? `${preview.slice(0, 40)}…` : preview}")`)
      continue
    }
    const md = paragraphsToMarkdown(text.paragraphs)
    if (md) {
      draft.blocks.push({ kind: 'markdown', y: text.rect?.y ?? 0, markdown: md })
      losses.push('positioned text box flattened into a paragraph')
    }
  }
  draft.blocks.sort((a, b) => a.y - b.y)

  for (const link of cs.links) {
    const md = link.paragraphs.map(p => runsToMarkdown(p.runs)).filter(Boolean).join('<br>')
    if (md)
      draft.blocks.push({ kind: 'markdown', y: Number.POSITIVE_INFINITY, markdown: md })
  }

  const tableRects = cs.tables.flatMap(t => (t.rect ? [t.rect] : []))
  for (const image of [...cs.images].sort((a, b) => (a.rect?.y ?? 0) - (b.rect?.y ?? 0) || (a.rect?.x ?? 0) - (b.rect?.x ?? 0))) {
    const href = pickImageHref(image)
    if (!href || !image.rect)
      continue
    if (tableRects.some(t => overlaps(t, image.rect!))) {
      losses.push('image placed over a table omitted')
      continue
    }
    if (!BROWSER_IMAGE_EXTENSIONS.has(extname(href).toLowerCase())) {
      losses.push(`image in an unsupported format omitted (${extname(href) || href})`)
      continue
    }
    const publicPath = publicImagePath(href, ctx)
    if (!publicPath) {
      losses.push('linked (not embedded) image omitted')
      continue
    }
    draft.images.push({ key: href, publicPath, rect: mapRect(image.rect, region) })
  }

  if (draft.images.length > 0 || cs.bodyShape)
    draft.contentGeometry = contentGeometryFor(cs.bodyShape?.rect, region)

  const unusedConnectors = cs.connectors.filter(c => !annotations.consumedConnectors.has(c)).length
  if (unusedConnectors > 0)
    losses.push(unusedConnectors === 1 ? 'arrow or line omitted' : `${unusedConnectors} arrows or lines omitted`)
  losses.push(...countLosses([...cs.decorations.map(d => d.description), ...annotations.losses]))
  return draft
}

// --- Rendering ------------------------------------------------------------------

function fence(lines: string[], info: string): string {
  const longest = Math.max(2, ...lines.map(l => (/`{3,}/.exec(l)?.[0].length ?? 0)))
  const ticks = '`'.repeat(Math.max(3, longest + 1))
  return `${ticks}${info}\n${lines.join('\n')}\n${ticks}`
}

/** Maps a code-block line index to its 1-based line within an exact match's snippet. */
function snippetLineMapper(code: DraftCode): (index: number) => number | undefined {
  const { file, startLine } = code.match
  if (!file || startLine === undefined)
    return () => undefined
  const startOrdinal = file.normalized.findIndex(n => n.line === startLine)
  const ordinals: (number | undefined)[] = []
  let k = 0
  for (const line of code.lines)
    ordinals.push(normalizeCodeLine(line) ? k++ : undefined)
  return (index) => {
    const ordinal = ordinals[index]
    const entry = ordinal === undefined ? undefined : file.normalized[startOrdinal + ordinal]
    return entry ? entry.line - startLine + 1 : undefined
  }
}

export function renderCode(code: DraftCode, repoBase: RepoBase | undefined): { markdown: string, losses: string[], imported: boolean } {
  const losses: string[] = []
  const { match } = code
  if (match.kind === 'exact' && match.file && match.startLine && match.endLine) {
    const language = languageForFilename(match.file.relPath) ?? code.language
    const out = [importLineFor(match, language)]
    if (repoBase) {
      const whole = isWholeFile(match.file, match.startLine, match.endLine)
      out.push(`[!source ${sourceUrl(repoBase, match.file.relPath, whole ? undefined : { startLine: match.startLine, endLine: match.endLine })}]`)
    }
    const snippetLines = match.file.lines.slice(match.startLine - 1, match.endLine)
    const rendered = renderAnchorMarks(code.lines, snippetLines, code.marks, snippetLineMapper(code))
    out.push(...rendered.anchors)
    losses.push(...rendered.losses)
    return { markdown: out.join('\n'), losses, imported: true }
  }

  const token = commentToken(code.language)
  const rendered = renderInlineMarks(code.lines, code.marks, token)
  losses.push(...rendered.losses)
  const lines = [...rendered.lines]
  if (match.kind === 'near' && match.file) {
    losses.push(`code differs from ${basename(match.file.relPath)}`)
    if (repoBase && token && match.startLine && match.endLine)
      lines.unshift(`${token} [!source ${sourceUrl(repoBase, match.file.relPath, { startLine: match.startLine, endLine: match.endLine })}]`)
  }
  const info = `${code.language}${code.title ? ` [${code.title}]` : ''}`
  return { markdown: fence(lines, info), losses, imported: false }
}

function renderBody(block: Extract<DraftBlock, { kind: 'body' }>): string {
  if (!block.steps || block.steps.every(s => !s))
    return paragraphsToMarkdown(block.paragraphs)
  // Group consecutive paragraphs revealed on the same click into one v-click block.
  const groups: { step: number, paragraphs: Paragraph[] }[] = []
  block.paragraphs.forEach((p, i) => {
    const step = block.steps![i] ?? 0
    const last = groups[groups.length - 1]
    if (last && last.step === step)
      last.paragraphs.push(p)
    else
      groups.push({ step, paragraphs: [p] })
  })
  return groups.map(g => (g.step
    ? `<v-click at="${g.step}">\n\n${paragraphsToMarkdown(g.paragraphs)}\n\n</v-click>`
    : paragraphsToMarkdown(g.paragraphs))).join('\n\n')
}

/** Renders a draft's content blocks (not headings/frontmatter), returning the markdown and any rendering losses. */
export function renderDraftBody(draft: SlideDraft, repoBase: RepoBase | undefined): { markdown: string, losses: string[], imports: number, inlineCode: number } {
  const parts: string[] = []
  const losses: string[] = []
  let imports = 0
  let inlineCode = 0
  if (draft.heading && draft.titleLines.length === 2)
    parts.push(`### ${draft.heading}`)
  for (const block of draft.blocks) {
    if (block.kind === 'body') {
      parts.push(renderBody(block))
    }
    else if (block.kind === 'code') {
      const rendered = renderCode(block.code, repoBase)
      parts.push(rendered.markdown)
      losses.push(...rendered.losses)
      if (rendered.imported)
        imports++
      else
        inlineCode++
    }
    else {
      parts.push(block.markdown)
    }
  }
  for (const image of draft.images)
    parts.push(image.step ? `<img v-click="${image.step}" src="/${image.publicPath}">` : `![](/${image.publicPath})`)
  return { markdown: parts.filter(Boolean).join('\n\n'), losses: countLosses(losses), imports, inlineCode }
}
