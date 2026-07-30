import { basename, dirname, resolve } from 'path'
import { readFileSync } from 'fs'
import { defineTransformersSetup } from '@slidev/types'
import {
  extractInlineSourceLink,
  injectHighlightSpans,
  parseCodeHighlights,
  parseExternalHighlightAnchors,
} from '../composables/useCodeHighlights'
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
  type CombinedSourceLink,
} from '../composables/useSnippetImport'
import { injectCarriedHeadings, isDefaultLayout, parseLeadingHeadings, resolveSlideHeadings, type SlideForHeadingResolve } from '../composables/useSlideTitleCarryover'
import { buildGithubSourceLink } from '../composables/useSourceLink'

function resolveImportPath(filePath: string, slideDir: string, userRoot: string): string {
  if (filePath.startsWith('@/')) return resolve(userRoot, filePath.slice(2))
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
function wrapCodeBlock(info: string, html: string, sourceLink: CombinedSourceLink | null): string {
  const title = /\[([^\]]*)\]/.exec(info)?.[1] ?? ''
  const escaped = html.replace(/\{\{/g, '&lbrace;&lbrace;')
  if (!sourceLink) return `<CodeBlockWrapper title=${JSON.stringify(title)}>${escaped}</CodeBlockWrapper>`

  const placedAtTitle = !sourceLink.bottom && title !== ''
  const linkAttrs = ` data-source-link-url="${escapeAttr(sourceLink.url)}" data-source-link-placement="${placedAtTitle ? 'title' : 'bottom'}"`
  const icon = placedAtTitle ? sourceLinkIconHtml(sourceLink.url) : ''
  return `<CodeBlockWrapper title=${JSON.stringify(title)}${linkAttrs}>${escaped}${icon}</CodeBlockWrapper>`
}

export default defineTransformersSetup(() => ({
  pre: [
    // Belt-and-suspenders alongside setup/preparser.ts's transformSlide hook:
    // Slidev resolves the active theme *from* slides.md's own headmatter, so
    // its very first parse of the file (just to read that headmatter) runs
    // before the theme -- and thus this package's setup/preparser.ts -- is
    // even known, using a roots list that excludes it. That first parse's
    // result becomes `ctx.options.data` for the rest of the process's
    // lifetime; in `slidev build`/`slidev export` there is no later
    // reparse-with-full-roots to correct it (unlike the dev server, which
    // gets one via a real file edit), so the preparser's injection silently
    // never applies there and carried titles are simply absent from the
    // exported output. This transformer recomputes the same carry-over
    // decision independently, from `ctx.options.data.slides` (always present
    // and already reflecting every slide's own raw content/frontmatter,
    // regardless of whether the preparser ran) -- so rendering is correct
    // even when the preparser's `slide.title`/TOC feedback isn't. Runs first
    // so its overwrite (confined to the leading heading lines only, via the
    // common-suffix diff below) can't collide with the snippet-import
    // transformer below, which only ever touches later lines.
    (ctx) => {
      if (!isDefaultLayout(ctx.slide.frontmatter)) return
      const content = ctx.s.original
      const own = parseLeadingHeadings(content)
      const allSlides: SlideForHeadingResolve[] = ctx.options.data.slides.map((s) => ({
        content: s.content,
        frontmatter: s.frontmatter,
      }))
      const resolved = resolveSlideHeadings(allSlides, ctx.slide.index)
      const newContent = injectCarriedHeadings(content, own, resolved)
      if (newContent === content) return

      // Diffed down to a common-suffix overwrite (rather than replacing the
      // whole slide) so this can never collide with the snippet-import
      // transformer below, which only ever touches lines further down.
      let suffixLen = 0
      const maxSuffix = Math.min(content.length, newContent.length)
      while (
        suffixLen < maxSuffix &&
        content[content.length - 1 - suffixLen] === newContent[newContent.length - 1 - suffixLen]
      ) suffixLen++

      const overwriteEnd = content.length - suffixLen
      const newPrefix = newContent.slice(0, newContent.length - suffixLen)
      // A slide with no leading blank line and no own heading at all (carried
      // title/subtitle purely prepended, nothing of the original consumed)
      // diffs down to a zero-length range, which MagicString's `overwrite`
      // rejects -- insert instead.
      if (overwriteEnd === 0) ctx.s.appendLeft(0, newPrefix)
      else ctx.s.overwrite(0, overwriteEnd, newPrefix)
    },
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
        if (/^\s*(```+|~~~+)/.test(lines[i])) {
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
        } catch {
          warn(`could not read file, leaving line as-is: ${absPath}`)
          i++
          continue
        }

        let selector = null
        if (parsed.selectorRaw !== null) {
          selector = parseSnippetSelector(parsed.selectorRaw)
          if (selector === null) warn(`malformed selector "[${parsed.selectorRaw}]"; showing the whole file`)
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
            if (parsedDirective) directive = parsedDirective
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
          if (url) sourceLink = { url, bottom: directive?.bottom ?? false }
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

      if (anchorLines.length > 0) {
        highlights = parseExternalHighlightAnchors(code, anchorLines)
      } else {
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
        code = parsed.code
        highlights = parsed.highlights
      }

      if (highlights.length === 0 && !sourceLink) return undefined
      const html = await ctx.renderHighlighted({ code })
      const highlighted = highlights.length > 0 ? injectHighlightSpans(html, highlights) : html
      return wrapCodeBlock(ctx.info, highlighted, sourceLink)
    },
  ],
}))
