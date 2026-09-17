import type { CodeHighlight } from '../composables/useCodeHighlights'
import type { CombinedSourceLink } from '../composables/useSnippetImport'
import { readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { defineTransformersSetup } from '@slidev/types'
import { parseFenceInfo } from '../composables/fenceInfo'
import {
  extractInlineSourceLink,
  injectHighlightSpans,
  parseCodeHighlights,
  parseExternalHighlightAnchors,
} from '../composables/useCodeHighlights'
import { slideCalloutClickSteps } from '../composables/useSlideCallouts'
import { isDefaultLayout } from '../composables/useSlideTitleCarryover'
import {
  combineCodeAndAnchors,

  combineWithSourceLink,
  DEFAULT_CODE_ROOT,
  isAnchorDeclarationLine,
  isSourceDirectiveLine,
  isWithinCodeRoot,
  parseSnippetImportLine,
  parseSnippetSelector,
  parseSourceDirective,
  resolveSnippetSelector,
  splitCodeAndAnchors,
  splitSourceLink,
} from '../composables/useSnippetImport'
import { buildGithubSourceLink } from '../composables/useSourceLink'

function resolveImportPath(filePath: string, slideDir: string, userRoot: string): string {
  if (filePath.startsWith('@/'))
    return resolve(userRoot, filePath.slice(2))
  return resolve(slideDir, filePath)
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** The small clickable GitHub-style icon rendered beside a titled code block's title bar. Absolutely positioned within `.slidev-code-wrapper` (already `position: relative` in Slidev's own `CodeBlockWrapper`), offset clear of its native copy button. */
function sourceLinkIconHtml(url: string): string {
  return `<a class="slidev-source-link-icon" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" title="View source" style="position:absolute;top:0.5rem;right:2.25rem;z-index:1;display:flex;opacity:0.7" onclick="event.stopPropagation()"><span class="i-carbon-logo-github" style="width:1.1rem;height:1.1rem"></span></a>`
}

/**
 * Mirrors just enough of Slidev's own `wrapper_default` codeblock transformer
 * to preserve its `[title]` rendering when this file's own `codeblocks`
 * transformer intercepts a fence to inject highlight spans and/or a source
 * link. When `sourceLink` is set, its placement is decided here: beside the
 * title (a real icon, inlined into the wrapper's slot content) when a title
 * is shown and bottom placement wasn't forced, otherwise a `data-source-link-*`
 * attribute pair on the wrapper root (which -- since it's a plain, undeclared
 * prop -- falls through onto `CodeBlockWrapper`'s single root element via
 * Vue's automatic attribute inheritance) for `layouts/default.vue` to collect
 * into the slide's bottom row.
 */
export function wrapCodeBlock(info: string, html: string, sourceLink: CombinedSourceLink | null, clickSteps: number[] = []): string {
  const { title, ranges, options } = parseFenceInfo(info)
  // Native `{1|3}` ranges and `{at: …}`-style options, forwarded the way
  // Slidev's own wrapper does, so they keep working on fences wrapped here.
  const nativeAttrs = `${options ? ` v-bind="${options}"` : ''} title=${JSON.stringify(title)} :ranges='${JSON.stringify(ranges)}'`
  const escaped = html.replace(/\{\{/g, '&lbrace;&lbrace;') + clickStepRegistrations(clickSteps)
  if (!sourceLink)
    return `<CodeBlockWrapper${nativeAttrs}>${escaped}</CodeBlockWrapper>`

  const placedAtTitle = !sourceLink.bottom && title !== ''
  const linkAttrs = ` data-source-link-url="${escapeAttr(sourceLink.url)}" data-source-link-placement="${placedAtTitle ? 'title' : 'bottom'}"`
  const icon = placedAtTitle ? sourceLinkIconHtml(sourceLink.url) : ''
  return `<CodeBlockWrapper${nativeAttrs}${linkAttrs}>${escaped}${icon}</CodeBlockWrapper>`
}

/**
 * Records, per highlight, how many identical source lines precede it within
 * the slide. The dev server's position write-back uses it to rewrite the right
 * line when a slide repeats one (two identical marked lines, or the same line
 * in two fences). Needs the fence's own position in the slide, so it only
 * applies to hand-typed fences, whose text appears verbatim in the markdown --
 * a `<<<` import's code lives in another file, and its anchor lines are left
 * at occurrence 0.
 */
function withLineOccurrences(highlights: CodeHighlight[], raw: string, rawFence: string | undefined): CodeHighlight[] {
  const at = rawFence ? raw.indexOf(rawFence) : -1
  if (at === -1)
    return highlights
  const rawLines = raw.split('\n')
  const fenceLine = raw.slice(0, at).split('\n').length - 1
  return highlights.map((h) => {
    const absolute = fenceLine + h.startLine
    if (rawLines[absolute] !== h.sourceLine)
      return h
    let lineOccurrence = 0
    for (let i = 0; i < absolute; i++) {
      if (rawLines[i] === h.sourceLine)
        lineOccurrence++
    }
    return { ...h, lineOccurrence }
  })
}

/**
 * Zero-size `v-click` placeholders, one per distinct callout click step in a
 * code block. Slidev only counts click-driven elements registered before the
 * slide mounts, and callouts themselves are only measured/placed by
 * `layouts/default.vue` after mount -- emitting the steps here, as part of the
 * slide's own compiled template, is what makes them count toward the slide's
 * total clicks (so the presenter reveals every step before advancing).
 */
export function clickStepRegistrations(clickSteps: number[]): string {
  return [...new Set(clickSteps)]
    .sort((a, b) => a - b)
    .map(step => `<span v-click="${step}" class="code-callout-step" data-click-step="${step}" aria-hidden="true"></span>`)
    .join('')
}

/**
 * The same hidden placeholders for a slide's callout steps (its `callouts`
 * frontmatter), as a block appended to the slide's markdown: the layout only
 * reads callouts after mount, too late for Slidev to count their clicks.
 * Empty when the slide isn't `default`-layout (callouts only render there) or
 * has no stepped callout.
 */
export function slideCalloutStepBlock(frontmatter: Record<string, unknown> | undefined): string {
  if (!isDefaultLayout(frontmatter))
    return ''
  const steps = slideCalloutClickSteps(frontmatter)
  if (steps.length === 0)
    return ''
  return `\n\n<div class="slide-callout-steps" aria-hidden="true" hidden>${clickStepRegistrations(steps)}</div>\n`
}

export default defineTransformersSetup(() => ({
  pre: [
    // Rewrites `<<< @/path[selector] lang` lines into a literal fenced code
    // block *before* markdown-it (and therefore Slidev's own native `<<<`
    // rule, which only slices via in-file #region markers) ever parses the
    // slide -- see composables/useSnippetImport.ts for the selector grammar
    // and design.md ("A `pre` markdown-transformer intercepts...") for why
    // this has to happen at this stage. Also consumes any immediately
    // following `[!mark:...]` anchor-declaration lines (composables/
    // useCodeHighlights.ts), appending them to the fence's code behind a
    // sentinel so they travel through the normal codeblocks pipeline below
    // without ever being written into the referenced file.
    (ctx) => {
      const original = ctx.s.original
      const lines = original.split('\n')
      const lineStarts: number[] = []
      let offset = 0
      for (const line of lines) {
        lineStarts.push(offset)
        offset += line.length + 1
      }

      const slideDir = dirname(ctx.slide.source.filepath)
      const userRoot = ctx.options.userRoot
      const warn = (message: string) => console.warn(`[code-snippet-import] slide ${ctx.slide.index}: ${message}`)

      let inFence = false
      let i = 0
      while (i < lines.length) {
        if (/^\s*(?:`{3,}|~{3,})/.test(lines[i])) {
          inFence = !inFence
          i++
          continue
        }

        const parsed = inFence ? null : parseSnippetImportLine(lines[i])
        if (!parsed) {
          i++
          continue
        }

        const absPath = resolveImportPath(parsed.filePath, slideDir, userRoot)
        if (!isWithinCodeRoot(absPath, userRoot, DEFAULT_CODE_ROOT)) {
          warn(`import resolves outside the "${DEFAULT_CODE_ROOT}" root: ${absPath}`)
        }

        let fileText: string
        try {
          fileText = readFileSync(absPath, 'utf-8')
        }
        catch {
          warn(`could not read file, leaving line as-is: ${absPath}`)
          i++
          continue
        }

        let selector = null
        if (parsed.selectorRaw !== null) {
          selector = parseSnippetSelector(parsed.selectorRaw)
          if (selector === null)
            warn(`malformed selector "[${parsed.selectorRaw}]"; showing the whole file`)
        }
        const { text: slicedCode, startLine, endLine } = resolveSnippetSelector(fileText, selector, warn)

        // Consume any immediately following `[!mark:...]` anchor-declaration
        // lines and/or a `[!source ...]` directive line, in either order.
        let j = i + 1
        const anchorLines: string[] = []
        let directive = null as ReturnType<typeof parseSourceDirective> | null
        while (j < lines.length) {
          const trimmed = lines[j].trim()
          if (isAnchorDeclarationLine(trimmed)) {
            anchorLines.push(trimmed)
            j++
            continue
          }
          if (isSourceDirectiveLine(trimmed)) {
            const parsedDirective = parseSourceDirective(trimmed)
            if (parsedDirective)
              directive = parsedDirective
            else warn(`malformed "[!source ...]" directive: "${trimmed}"`)
            j++
            continue
          }
          break
        }

        let sourceLink: CombinedSourceLink | null = null
        if (directive?.mode !== 'none') {
          const configuredBranch = typeof ctx.options.data.headmatter.codeSourceLinkBranch === 'string'
            ? ctx.options.data.headmatter.codeSourceLinkBranch
            : undefined
          const url = directive?.mode === 'url'
            ? directive.url!
            : buildGithubSourceLink(absPath, { startLine, endLine, isWholeFile: selector === null }, configuredBranch)
          if (url)
            sourceLink = { url, bottom: directive?.bottom ?? false }
        }

        const combined = combineWithSourceLink(combineCodeAndAnchors(slicedCode, anchorLines), sourceLink)
        const fenceInfo = parsed.notitle ? parsed.lang : `${parsed.lang} [${basename(parsed.filePath)}]`
        const fenceText = `\`\`\`${fenceInfo}\n${combined}\n\`\`\``

        const startOffset = lineStarts[i]
        const lastConsumedIdx = j - 1
        const endOffset = lineStarts[lastConsumedIdx] + lines[lastConsumedIdx].length
        ctx.s.overwrite(startOffset, endOffset, fenceText)

        const watchFiles = ctx.options.data.watchFiles
        watchFiles[absPath] ??= new Set()
        watchFiles[absPath].add(ctx.slide.index)

        i = j
      }
    },
  ],
  post: [
    (ctx) => {
      const block = slideCalloutStepBlock(ctx.slide?.frontmatter)
      if (block)
        ctx.s.append(block)
    },
  ],
  codeblocks: [
    // Runs before Slidev's own built-in `wrapper_default` transformer (which
    // is what normally wraps a fence in `<CodeBlockWrapper>` to render its
    // `[title]`), so intercepting here to inject highlight spans and/or a
    // source-link icon -- both need the raw pre-Shiki code -- would
    // otherwise silently drop the title bar for every highlighted or
    // source-linked snippet. Replicating just enough of wrapper_default's own
    // wrapping (title extraction + mustache-escaping) keeps that behavior
    // intact. Only falls through to Slidev's own native transformer
    // (returning undefined) when there's neither a highlight nor a source
    // link to add -- a plain fence is otherwise untouched.
    async (ctx) => {
      const { payload, link: importSourceLink } = splitSourceLink(ctx.code)
      const { code: afterAnchorSplit, anchorLines } = splitCodeAndAnchors(payload)

      let sourceLink = importSourceLink
      let code = afterAnchorSplit
      let highlights
      // The fence exactly as it sits in the slide's markdown (markers still in
      // place), used below to locate it within the slide's raw text.
      let rawFence: string | undefined

      if (anchorLines.length > 0) {
        highlights = parseExternalHighlightAnchors(code, anchorLines)
      }
      else {
        // Only hand-typed (non-`<<<`-imported) fences can carry an inline
        // `// [!source ...]` marker -- an import's link travels via the
        // sentinel above instead, resolved/overridden back in the `pre`
        // stage where the file path is known.
        if (!sourceLink) {
          const extracted = extractInlineSourceLink(code)
          code = extracted.code
          if (extracted.url) {
            const title = /\[([^\]]*)\]/.exec(ctx.info)?.[1] ?? ''
            sourceLink = { url: extracted.url, bottom: title === '' }
          }
        }
        const parsed = parseCodeHighlights(code)
        rawFence = code
        code = parsed.code
        highlights = parsed.highlights
      }
      highlights = withLineOccurrences(highlights, ctx.slide?.source?.raw ?? '', rawFence)

      if (highlights.length === 0 && !sourceLink)
        return undefined
      // Highlighted without the title/ranges/options, as Slidev's wrapper does.
      const { lang, rest } = parseFenceInfo(ctx.info)
      const html = await ctx.renderHighlighted({ code, info: `${lang} ${rest}` })
      const highlighted = highlights.length > 0 ? injectHighlightSpans(html, highlights) : html
      const clickSteps = highlights.flatMap(h => (h.click ? [h.click] : []))
      return wrapCodeBlock(ctx.info, highlighted, sourceLink, clickSteps)
    },
  ],
}))
