import { basename, dirname, resolve } from 'path'
import { readFileSync } from 'fs'
import { defineTransformersSetup } from '@slidev/types'
import { injectHighlightSpans, parseCodeHighlights, parseExternalHighlightAnchors } from '../composables/useCodeHighlights'
import {
  combineCodeAndAnchors,
  DEFAULT_CODE_ROOT,
  isAnchorDeclarationLine,
  isWithinCodeRoot,
  parseSnippetImportLine,
  parseSnippetSelector,
  resolveSnippetSelector,
  splitCodeAndAnchors,
} from '../composables/useSnippetImport'

function resolveImportPath(filePath: string, slideDir: string, userRoot: string): string {
  if (filePath.startsWith('@/')) return resolve(userRoot, filePath.slice(2))
  return resolve(slideDir, filePath)
}

/** Mirrors just enough of Slidev's own `wrapper_default` codeblock transformer to preserve its `[title]` rendering when this file's own `codeblocks` transformer intercepts a fence to inject highlight spans. */
function wrapInCodeBlockTitle(info: string, html: string): string {
  const title = /\[([^\]]*)\]/.exec(info)?.[1] ?? ''
  const escaped = html.replace(/\{\{/g, '&lbrace;&lbrace;')
  return `<CodeBlockWrapper title=${JSON.stringify(title)}>${escaped}</CodeBlockWrapper>`
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

      let i = 0
      while (i < lines.length) {
        const parsed = parseSnippetImportLine(lines[i])
        if (!parsed) {
          i++
          continue
        }

        const absPath = resolveImportPath(parsed.filePath, slideDir, userRoot)
        if (!isWithinCodeRoot(absPath, userRoot, DEFAULT_CODE_ROOT)) {
          warn(`import resolves outside the "${DEFAULT_CODE_ROOT}" root: ${absPath}`)
        }

        const fileText = readFileSync(absPath, 'utf-8')

        let selector = null
        if (parsed.selectorRaw !== null) {
          selector = parseSnippetSelector(parsed.selectorRaw)
          if (selector === null) warn(`malformed selector "[${parsed.selectorRaw}]"; showing the whole file`)
        }
        const slicedCode = resolveSnippetSelector(fileText, selector, warn)

        let j = i + 1
        const anchorLines: string[] = []
        while (j < lines.length && isAnchorDeclarationLine(lines[j].trim())) {
          anchorLines.push(lines[j].trim())
          j++
        }

        const combined = combineCodeAndAnchors(slicedCode, anchorLines)
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
    // `[title]`), so intercepting here to inject highlight spans -- as both
    // branches below must, to reach the raw pre-Shiki code -- would otherwise
    // silently drop the title bar for every highlighted snippet. Replicating
    // just enough of wrapper_default's own wrapping (title extraction +
    // mustache-escaping) keeps that behavior intact.
    async (ctx) => {
      const { code: realCode, anchorLines } = splitCodeAndAnchors(ctx.code)
      if (anchorLines.length > 0) {
        const highlights = parseExternalHighlightAnchors(realCode, anchorLines)
        if (highlights.length === 0) return undefined
        const html = await ctx.renderHighlighted({ code: realCode })
        return wrapInCodeBlockTitle(ctx.info, injectHighlightSpans(html, highlights))
      }

      const { code, highlights } = parseCodeHighlights(ctx.code)
      if (highlights.length === 0) return undefined
      const html = await ctx.renderHighlighted({ code })
      return wrapInCodeBlockTitle(ctx.info, injectHighlightSpans(html, highlights))
    },
  ],
}))
