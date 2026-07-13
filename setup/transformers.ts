import { defineTransformersSetup } from '@slidev/types'
import { injectHighlightSpans, parseCodeHighlights } from '../composables/useCodeHighlights'

export default defineTransformersSetup(() => ({
  codeblocks: [
    async (ctx) => {
      const { code, highlights } = parseCodeHighlights(ctx.code)
      if (highlights.length === 0) return undefined
      const html = await ctx.renderHighlighted({ code })
      return injectHighlightSpans(html, highlights)
    },
  ],
}))
