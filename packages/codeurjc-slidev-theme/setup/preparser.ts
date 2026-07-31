import type { ResolvedHeadings } from '../composables/useSlideTitleCarryover'
import { definePreparserSetup } from '@slidev/types'
import {
  advanceCarryState,
  injectCarriedHeadings,
  isDefaultLayout,
  parseLeadingHeadings,

} from '../composables/useSlideTitleCarryover'

// `@slidev/parser`'s `parse()` slices the whole file into slides strictly in
// document order, in one pass, every time slides.md changes -- and this
// setup function is called fresh (a new closure) for every such pass. That
// makes plain closure state safe here, unlike the per-slide, on-demand Vite
// transform in setup/transformers.ts (see design.md): `state` below always
// starts empty and only ever advances slide-by-slide in order within a
// single parse.
//
// Mutating `slide.content` here (via the returned string) is also what
// actually injects the carried heading into the rendered slide -- the
// virtual `__slidev_N.md` module Vite loads for each slide serves this same
// mutated `slide.content`, so no separate injection step is needed in
// setup/transformers.ts.
export default definePreparserSetup(() => {
  let state: ResolvedHeadings = {}

  return [
    {
      name: 'slide-title-carryover',
      async transformSlide(content, frontmatter) {
        if (!isDefaultLayout(frontmatter))
          return undefined

        const own = parseLeadingHeadings(content)
        state = advanceCarryState(state, { content, frontmatter })

        // `frontmatter` is the slide's actual `frontmatter` object; setting
        // `title` on it here feeds back into the parser's own `slide.title`
        // (used by the presenter overview / table of contents / tab title),
        // matching what's rendered below.
        if (typeof state.title === 'string')
          frontmatter.title = state.title

        return injectCarriedHeadings(content, own, state)
      },
    },
  ]
})
