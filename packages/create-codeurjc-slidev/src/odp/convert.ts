import type { GitRunner } from 'codeurjc-slidev-theme/composables/useSourceLink'
import type { IndexedFile, RepoBase } from './code'
import type { ComparisonEntry } from './comparison'
import type { DraftContext, SlideDraft } from './draft'
import type { DesiredHeadings } from './headings'
import type { LibreOfficeStatus, OfficeRunner } from './office'
import type { SvgExport } from './svgCrop'
import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { formatImageRef, imageRefFor, resolveImageRef } from 'codeurjc-slidev-theme/composables/useImageRefs'
import { serializeSlideCallouts } from 'codeurjc-slidev-theme/composables/useSlideCallouts'
import { serializeSlideGeometry } from 'codeurjc-slidev-theme/composables/useSlideGeometry'
import { realGitRunner } from 'codeurjc-slidev-theme/composables/useSourceLink'
import { mergeBuildUps } from './buildups'
import { classifySlide } from './classify'
import { buildCodeIndex, detectRepoBase, languageForFilename, parseCodeRepoFlag, resolveCodeFolder } from './code'
import { comparisonMarkdown } from './comparison'
import { boxOf } from './diagrams'
import { draftSlide, renderDraftBody } from './draft'
import { toYaml } from './frontmatter'
import { bodyRegionFor, mapRect } from './geometry'
import { layoutDraft } from './grid'
import { emitHeadings } from './headings'
import { detectLibreOffice, exportSvg, realOfficeRunner } from './office'
import { parseOdp } from './parse'
import { splitSvgSlides } from './svg'
import { cropDiagram, parseSvgExport } from './svgCrop'

// The ODP -> Slidev conversion pipeline, producing everything a project needs
// (slides.md, images, the code folder to copy, the optional comparison deck)
// without writing anything itself.

export interface ConvertOptions {
  odpPath: string
  /** `--code`: explicit code folder. */
  codeDir?: string
  /** `--code-repo`: GitHub base URL for source links. */
  codeRepo?: string
  git?: GitRunner
  /** LibreOffice process runner; `false` disables LibreOffice (no comparison deck, no diagram images). */
  office?: OfficeRunner | false
  /** The deck's own markdown file name, referenced by the comparison deck's `src:` includes. Default `slides.md`. */
  deckFile?: string
  /** The deck's code path relative to the project root (`@/<codeBase>/...` imports). Default `code`. */
  codeBase?: string
  /** The deck's images path relative to `public/`. Default `images`. */
  imagesBase?: string
  /** The deck's rendered-original SVGs path relative to `public/`, for the comparison deck. Default `odp-originals`. */
  originalsBase?: string
}

export interface SlideReport {
  odpNumbers: number[]
  /** Number shown when presenting slides.md; undefined for hidden slides. */
  slidevNumber?: number
  /** 1-based position in slides.md, hidden slides included. */
  fileIndex: number
  hidden: boolean
  losses: string[]
  /** Conversion notes that lost nothing (e.g. a diagram redrawn by mermaid or embedded as an image). */
  info: string[]
}

/** How one code block of the converted slides matched the code folder. */
export interface CodeBlockReport {
  odpNumbers: number[]
  /** Number shown when presenting slides.md; undefined for hidden slides. */
  slidevNumber?: number
  hidden: boolean
  language: string
  /**
   * `imported`: exact match, emitted as a `<<<` import; `close`: near match left
   * inline; `none`: nothing matched; `command`: a terminal block (never
   * matched); `no-folder`: the import had no code folder to match against.
   */
  outcome: 'imported' | 'close' | 'none' | 'command' | 'no-folder'
  /** Matched file, relative to the code folder. */
  file?: string
  startLine?: number
  endLine?: number
  /** Block lines found in the file, out of the block's non-blank lines (near matches). */
  matched?: number
  total?: number
  /** The block's first non-blank line, to find it in the deck. */
  firstLine: string
}

/** What an import worked with: the code folder, source-link base and LibreOffice. */
export interface ImportContext {
  codeFolder?: string
  codeFiles: number
  /** GitHub base for source links, e.g. `https://github.com/org/repo/tree/main/sub`. */
  repoBase?: string
  /** LibreOffice detection result, or `disabled` when LibreOffice isn't used at all. */
  office: LibreOfficeStatus | 'disabled'
}

export interface ConvertResult {
  deckTitle: string
  slidesMarkdown: string
  /** Each slide's own source (frontmatter + content), in file order; `slidesMarkdown` is these joined. */
  slideSources: string[]
  /** Public-dir relative path (e.g. `images/a.png`) -> file data. */
  images: Map<string, Uint8Array>
  codeFolder?: string
  comparisonMarkdown?: string
  /** Public-dir relative path (e.g. `odp-originals/page16.svg`) -> SVG text. */
  originals: Map<string, string>
  reports: SlideReport[]
  notices: string[]
  comparison: 'written' | 'no-losses' | 'skipped'
  /** fileIndex of a slide with losses -> its information slide's number in comparison.md (empty unless written). */
  comparisonSlides: Map<number, number>
  codeBlocks: CodeBlockReport[]
  context: ImportContext
  stats: { odpSlides: number, slides: number, mergedBuildUps: number, imports: number, inlineCode: number, slidesWithLosses: number }
}

const HEADMATTER = { theme: 'codeurjc-slidev-theme', colorSchema: 'light', aspectRatio: '16/9' }

function desiredHeadings(draft: SlideDraft): DesiredHeadings {
  const [first, second] = draft.titleLines
  if (second !== undefined)
    return { title: first, subtitle: second }
  if (first !== undefined)
    return { title: first, subtitle: draft.heading }
  return { subtitle: draft.heading }
}

function slideFrontmatter(draft: SlideDraft): Record<string, unknown> {
  const fm: Record<string, unknown> = {}
  if (draft.role === 'cover') {
    fm.layout = 'cover'
    const { subject, lesson, date, authors } = draft.cover ?? {}
    Object.assign(fm, Object.fromEntries(Object.entries({ subject, lesson, date, authors }).filter(([, v]) => v)))
  }
  else if (draft.role === 'copyright') {
    fm.layout = 'copyright'
  }
  if (draft.hidden)
    fm.hide = true
  if (draft.role === 'content') {
    // Image entries are keyed by the src the slide's markdown uses, so they
    // keep applying to their picture however the images are later reordered.
    // Images in a grid column are laid out by the grid, and a body in one
    // spans the grid's column rather than a positioned content box.
    const layout = layoutDraft(draft)
    const srcs = layout.images.map(i => `/${i.publicPath}`)
    const geometry = serializeSlideGeometry({
      content: layout.bodyInGrid ? undefined : draft.contentGeometry,
      images: layout.images.flatMap((image, index) => (layout.gridImages.has(image) ? [] : [{ ...image.rect, src: String(formatImageRef(imageRefFor(srcs, index))) }])),
    })
    if (geometry)
      fm.geometry = geometry
    // Callout image references were written against the draft's image order;
    // a grid can show the images in another one, which matters for `src#N`.
    const draftSrcs = draft.images.map(i => `/${i.publicPath}`)
    const callouts = serializeSlideCallouts(draft.callouts.map((callout) => {
      if (callout.anchor.kind !== 'image')
        return callout
      const { index } = resolveImageRef(callout.anchor.ref, draftSrcs)
      const shown = index < 0 ? -1 : layout.images.indexOf(draft.images[index])
      return shown < 0 ? callout : { ...callout, anchor: { ...callout.anchor, ref: imageRefFor(srcs, shown) } }
    }))
    if (callouts)
      fm.callouts = callouts
  }
  return fm
}

function slideSource(frontmatter: Record<string, unknown>, content: string): string {
  const yaml = Object.keys(frontmatter).length > 0 ? toYaml(frontmatter as Parameters<typeof toYaml>[0]) : ''
  const head = yaml ? `---\n${yaml}\n---` : '---'
  return content ? `${head}\n\n${content}\n` : `${head}\n`
}

export async function convertOdp(options: ConvertOptions): Promise<ConvertResult> {
  const git = options.git ?? realGitRunner
  const deckFile = options.deckFile ?? 'slides.md'
  const codeBase = options.codeBase ?? 'code'
  const imagesBase = options.imagesBase ?? 'images'
  const originalsBase = options.originalsBase ?? 'odp-originals'
  const notices: string[] = []
  const deck = parseOdp(readFileSync(options.odpPath))
  const classified = deck.slides.map(slide => classifySlide(slide, deck))

  // Code folder, index and source-link base.
  const codeFolder = resolveCodeFolder(options.odpPath, options.codeDir)
  let codeIndex: IndexedFile[] = []
  let repoBase: RepoBase | undefined
  if (options.codeDir && !codeFolder)
    notices.push(`--code folder not found: ${options.codeDir}; code stays inline`)
  if (codeFolder) {
    codeIndex = buildCodeIndex(codeFolder)
    repoBase = options.codeRepo ? parseCodeRepoFlag(options.codeRepo, git) : detectRepoBase(codeFolder, git)
    if (!repoBase) {
      notices.push(options.codeRepo
        ? `--code-repo isn't a GitHub repository URL, or its default branch couldn't be resolved: ${options.codeRepo}; source links skipped`
        : `No GitHub origin found for the code folder (${codeFolder}); source links skipped (use --code-repo to set one)`)
    }
  }
  else if (!options.codeDir) {
    notices.push(`No code folder found next to the ODP (expected "${basename(options.odpPath, extname(options.odpPath))}/"); code stays inline`)
  }

  // LibreOffice, needed for diagram images and the comparison deck. Its SVG
  // export runs at most once, the first time either needs it.
  const office = options.office === false ? undefined : options.office ?? realOfficeRunner
  const officeStatus: LibreOfficeStatus | undefined = office ? await detectLibreOffice(office) : undefined
  let exported: Promise<string> | undefined
  const exportOnce = () => (exported ??= exportSvg(options.odpPath, office!))

  // Drafts, build-ups.
  const ctx: DraftContext = { deck, codeIndex, repoBase, images: new Map(), imagePaths: new Map(), canEmbedDiagrams: officeStatus?.ok === true, imagesBase }
  const merged = mergeBuildUps(classified.map(cs => draftSlide(cs, ctx)))
  notices.push(...merged.warnings)
  const drafts = merged.drafts

  // Diagram images, cropped from the export.
  if (drafts.some(d => d.unembeddedDiagrams > 0) && officeStatus && !officeStatus.ok) {
    notices.push(officeStatus.reason === 'missing'
      ? 'Diagrams kept as losses: LibreOffice ≥ 7.4 (soffice) was not found'
      : `Diagrams kept as losses: LibreOffice ${officeStatus.version} found, but ≥ 7.4 is required`)
  }
  if (drafts.some(d => d.diagramCandidates.length > 0)) {
    let svg: SvgExport | undefined
    try {
      svg = parseSvgExport(await exportOnce())
    }
    catch (error) {
      notices.push(`Diagram images not written: ${(error as Error).message}`)
    }
    for (const draft of drafts) {
      const slide = draft.classified.slide
      const region = bodyRegionFor(deck, slide)
      draft.diagramCandidates.forEach((group, i) => {
        const cropped = svg && cropDiagram(svg, slide.name, group.members.map(boxOf), group.extras.map(boxOf))
        if (!cropped) {
          draft.losses.push('diagram omitted (not found in LibreOffice\'s SVG export)')
          return
        }
        let path = `${imagesBase}/diagram-${slide.name}${i > 0 ? `-${i + 1}` : ''}.svg`
        for (let n = 2; ctx.images.has(path); n++)
          path = `${imagesBase}/diagram-${slide.name}-${i + 1}-${n}.svg`
        ctx.images.set(path, new TextEncoder().encode(cropped))
        draft.images.push({ key: path, publicPath: path, rect: mapRect(group.rect, region) })
        draft.info.push('diagram embedded as an SVG image (not editable)')
      })
    }
  }

  const deckTitle = drafts.find(d => d.role === 'cover' && !d.hidden)?.cover?.title
    ?? drafts.find(d => d.role === 'cover')?.cover?.title
    ?? basename(options.odpPath, extname(options.odpPath))

  // Headings with carry-over, then slides.md.
  const frontmatters = drafts.map(slideFrontmatter)
  const headings = emitHeadings(drafts.map((d, i) => ({
    frontmatter: frontmatters[i],
    desired: d.role === 'content' ? desiredHeadings(d) : {},
  })))

  const reports: SlideReport[] = []
  const codeBlocks: CodeBlockReport[] = []
  const sources: string[] = []
  let slidevNumber = 0
  let imports = 0
  let inlineCode = 0
  drafts.forEach((draft, i) => {
    const frontmatter: Record<string, unknown> = { ...(i === 0 ? { ...HEADMATTER, title: deckTitle } : {}), ...frontmatters[i] }
    if (headings[i].resetTitle)
      frontmatter.resetTitle = true
    let content: string
    const losses = [...draft.losses]
    if (draft.role === 'cover') {
      content = draft.cover?.title ? `# ${draft.cover.title}` : ''
    }
    else if (draft.role === 'copyright') {
      content = ''
    }
    else {
      const body = renderDraftBody(draft, repoBase, codeBase)
      losses.push(...body.losses)
      imports += body.imports
      inlineCode += body.inlineCode
      // Title and subtitle must be adjacent lines for carry-over to read them as a pair.
      content = [headings[i].lines.join('\n'), body.markdown].filter(Boolean).join('\n\n')
    }
    sources.push(slideSource(frontmatter, content))
    if (!draft.hidden)
      slidevNumber++
    for (const block of draft.role === 'content' ? draft.blocks : []) {
      if (block.kind !== 'code')
        continue
      const { code } = block
      const { match } = code
      // The same condition renderCode uses to emit a `<<<` import.
      const imported = match.kind === 'exact' && match.file && match.startLine && match.endLine
      const outcome: CodeBlockReport['outcome'] = code.terminal
        ? 'command'
        : !codeFolder ? 'no-folder' : imported ? 'imported' : match.kind === 'near' && match.file ? 'close' : 'none'
      codeBlocks.push({
        odpNumbers: draft.odpNumbers,
        slidevNumber: draft.hidden ? undefined : slidevNumber,
        hidden: draft.hidden,
        language: imported ? languageForFilename(match.file!.relPath) ?? code.language : code.language,
        outcome,
        ...(outcome === 'imported' || outcome === 'close'
          ? { file: match.file!.relPath, startLine: match.startLine, endLine: match.endLine, matched: match.matched, total: match.total }
          : {}),
        firstLine: (code.lines.find(l => l.trim()) ?? '').trim(),
      })
    }
    reports.push({ odpNumbers: draft.odpNumbers, slidevNumber: draft.hidden ? undefined : slidevNumber, fileIndex: i + 1, hidden: draft.hidden, losses, info: [...draft.info] })
  })

  // Comparison deck.
  const originals = new Map<string, string>()
  const comparisonSlides = new Map<number, number>()
  let comparison: ConvertResult['comparison'] = 'no-losses'
  let comparisonMd: string | undefined
  const lossy = reports.filter(r => r.losses.length > 0)
  if (lossy.length > 0) {
    comparison = 'skipped'
    if (!officeStatus) {
      notices.push('Comparison deck disabled')
    }
    else {
      const status = officeStatus
      if (!status.ok) {
        notices.push(status.reason === 'missing'
          ? 'Comparison deck skipped: LibreOffice ≥ 7.4 (soffice) was not found'
          : `Comparison deck skipped: LibreOffice ${status.version} found, but ≥ 7.4 is required`)
      }
      else {
        const wanted = new Map<number, string>()
        lossy.forEach((r) => {
          const draft = drafts[r.fileIndex - 1]
          if (!r.hidden)
            wanted.set(r.fileIndex, draft.odpNames[draft.odpNames.length - 1])
        })
        let rendered = new Map<string, string>()
        try {
          rendered = splitSvgSlides(await exportOnce(), new Set(wanted.values()))
        }
        catch (error) {
          notices.push(`Comparison deck written without originals: ${(error as Error).message}`)
        }
        const entries: ComparisonEntry[] = lossy.map((r) => {
          const name = wanted.get(r.fileIndex)
          const svg = name ? rendered.get(name) : undefined
          if (name && svg)
            originals.set(`${originalsBase}/${name}.svg`, svg)
          return { ...r, originalImage: name && svg ? `/${originalsBase}/${name}.svg` : undefined }
        })
        comparisonMd = comparisonMarkdown(entries, deckTitle, deckFile)
        comparison = 'written'
        // comparisonMarkdown's layout: an information slide per lossy slide,
        // then the imported converted slide unless it's hidden.
        let next = 1
        for (const r of lossy) {
          comparisonSlides.set(r.fileIndex, next)
          next += r.hidden ? 1 : 2
        }
      }
    }
  }

  return {
    deckTitle,
    slidesMarkdown: sources.join('\n'),
    slideSources: sources,
    images: ctx.images,
    codeFolder,
    comparisonMarkdown: comparisonMd,
    originals,
    reports,
    notices,
    comparison,
    comparisonSlides,
    codeBlocks,
    context: {
      codeFolder,
      codeFiles: codeIndex.length,
      repoBase: repoBase && `https://github.com/${repoBase.owner}/${repoBase.repo}/tree/${repoBase.branch}${repoBase.subpath ? `/${repoBase.subpath}` : ''}`,
      office: officeStatus ?? 'disabled',
    },
    stats: {
      odpSlides: deck.slides.length,
      slides: drafts.length,
      mergedBuildUps: merged.mergedRuns,
      imports,
      inlineCode,
      slidesWithLosses: lossy.length,
    },
  }
}
