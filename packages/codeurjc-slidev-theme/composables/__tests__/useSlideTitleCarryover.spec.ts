import { describe, it, expect } from 'vitest'
import {
  parseLeadingHeadings,
  isDefaultLayout,
  hasResetHeadingsFlag,
  resolveSlideHeadings,
  injectCarriedHeadings,
  RESET_HEADINGS_FRONTMATTER_KEY,
  type SlideForHeadingResolve,
} from '../useSlideTitleCarryover'

describe('parseLeadingHeadings', () => {
  it('reads title and subtitle when both are present', () => {
    expect(parseLeadingHeadings('# Dobles\n## Ejercicio 8\n- bullet')).toEqual({
      title: { kind: 'own', text: 'Dobles' },
      subtitle: { kind: 'own', text: 'Ejercicio 8' },
    })
  })

  it('reads a title with no subtitle', () => {
    expect(parseLeadingHeadings('# Ejercicios\n- bullet')).toEqual({
      title: { kind: 'own', text: 'Ejercicios' },
      subtitle: { kind: 'absent' },
    })
  })

  it('reads a subtitle with no title', () => {
    expect(parseLeadingHeadings('## Ejercicio 3\n- bullet')).toEqual({
      title: { kind: 'absent' },
      subtitle: { kind: 'own', text: 'Ejercicio 3' },
    })
  })

  it('treats a bare # as an empty title', () => {
    expect(parseLeadingHeadings('#\n- bullet').title).toEqual({ kind: 'empty' })
  })

  it('treats a bare ## as an empty subtitle', () => {
    expect(parseLeadingHeadings('# Title\n##\n- bullet').subtitle).toEqual({ kind: 'empty' })
  })

  it('does not treat a heading found later in the body as a leading heading', () => {
    expect(parseLeadingHeadings('- bullet\n# Not a title')).toEqual({
      title: { kind: 'absent' },
      subtitle: { kind: 'absent' },
    })
  })

  it('does not treat a non-adjacent ## as a subtitle', () => {
    expect(parseLeadingHeadings('# Title\n\n## Not adjacent').subtitle).toEqual({ kind: 'absent' })
  })
})

describe('isDefaultLayout', () => {
  it('treats undefined layout as default', () => {
    expect(isDefaultLayout(undefined)).toBe(true)
    expect(isDefaultLayout({})).toBe(true)
  })

  it('treats explicit layout: default as default', () => {
    expect(isDefaultLayout({ layout: 'default' })).toBe(true)
  })

  it('treats any other layout as non-default', () => {
    expect(isDefaultLayout({ layout: 'cover' })).toBe(false)
  })
})

describe('hasResetHeadingsFlag', () => {
  it('is true only when the flag is exactly true', () => {
    expect(hasResetHeadingsFlag({ [RESET_HEADINGS_FRONTMATTER_KEY]: true })).toBe(true)
    expect(hasResetHeadingsFlag({ [RESET_HEADINGS_FRONTMATTER_KEY]: false })).toBe(false)
    expect(hasResetHeadingsFlag({})).toBe(false)
    expect(hasResetHeadingsFlag(undefined)).toBe(false)
  })
})

function slide(content: string, frontmatter: Record<string, unknown> = {}): SlideForHeadingResolve {
  return { content, frontmatter }
}

describe('resolveSlideHeadings', () => {
  it('carries a title across consecutive titleless slides', () => {
    const slides = [
      slide('# Ejercicios\n- a'),
      slide('- b'),
      slide('- c'),
    ]
    expect(resolveSlideHeadings(slides, 1)).toEqual({ title: 'Ejercicios', subtitle: undefined })
    expect(resolveSlideHeadings(slides, 2)).toEqual({ title: 'Ejercicios', subtitle: undefined })
  })

  it('starts a new chain when a slide sets its own title', () => {
    const slides = [
      slide('# Ejercicios\n- a'),
      slide('- b'),
      slide('# Casos de uso\n- c'),
      slide('- d'),
    ]
    expect(resolveSlideHeadings(slides, 3)).toEqual({ title: 'Casos de uso', subtitle: undefined })
  })

  it('carries title and subtitle independently', () => {
    const slides = [
      slide('# Dobles\n## Ejercicio 1\n- a'),
      slide('# Dobles\n## Ejercicio 2\n- b'),
      slide('## Ejercicio 3\n- c'),
    ]
    expect(resolveSlideHeadings(slides, 1)).toEqual({ title: 'Dobles', subtitle: 'Ejercicio 2' })
    expect(resolveSlideHeadings(slides, 2)).toEqual({ title: 'Dobles', subtitle: 'Ejercicio 3' })
  })

  it('carries subtitle while title changes', () => {
    const slides = [
      slide('# Dobles\n## Ejercicio 8\n- a'),
      slide('# Casos especiales\n- b'),
    ]
    expect(resolveSlideHeadings(slides, 1)).toEqual({ title: 'Casos especiales', subtitle: 'Ejercicio 8' })
  })

  it('resets the title chain from an empty heading onward', () => {
    const slides = [
      slide('# Ejercicios\n- a'),
      slide('#\n- b'),
      slide('- c'),
      slide('# Casos de uso\n- d'),
    ]
    expect(resolveSlideHeadings(slides, 1)).toEqual({ title: undefined, subtitle: undefined })
    expect(resolveSlideHeadings(slides, 2)).toEqual({ title: undefined, subtitle: undefined })
    expect(resolveSlideHeadings(slides, 3)).toEqual({ title: 'Casos de uso', subtitle: undefined })
  })

  it('resets the subtitle chain independently of the title', () => {
    const slides = [
      slide('# Ejercicios\n## Parte 1\n- a'),
      slide('##\n- b'),
      slide('- c'),
    ]
    expect(resolveSlideHeadings(slides, 1)).toEqual({ title: 'Ejercicios', subtitle: undefined })
    expect(resolveSlideHeadings(slides, 2)).toEqual({ title: 'Ejercicios', subtitle: undefined })
  })

  it('resets both chains via the frontmatter flag', () => {
    const slides = [
      slide('# Ejercicios\n## Parte 1\n- a'),
      slide('- b', { [RESET_HEADINGS_FRONTMATTER_KEY]: true }),
      slide('- c'),
    ]
    expect(resolveSlideHeadings(slides, 1)).toEqual({ title: undefined, subtitle: undefined })
    expect(resolveSlideHeadings(slides, 2)).toEqual({ title: undefined, subtitle: undefined })
  })

  it('lets the reset-flag slide also set its own new heading', () => {
    const slides = [
      slide('# Ejercicios\n- a'),
      slide('# Nueva seccion\n- b', { [RESET_HEADINGS_FRONTMATTER_KEY]: true }),
      slide('- c'),
    ]
    expect(resolveSlideHeadings(slides, 1)).toEqual({ title: 'Nueva seccion', subtitle: undefined })
    expect(resolveSlideHeadings(slides, 2)).toEqual({ title: 'Nueva seccion', subtitle: undefined })
  })

  it('skips non-default-layout slides without breaking the chain', () => {
    const slides = [
      slide('# Ejercicios\n- a'),
      slide('# Cover slide\n- cover', { layout: 'cover' }),
      slide('- b'),
    ]
    expect(resolveSlideHeadings(slides, 2)).toEqual({ title: 'Ejercicios', subtitle: undefined })
  })

  it('renders nothing when no earlier slide set a title', () => {
    const slides = [slide('- a')]
    expect(resolveSlideHeadings(slides, 0)).toEqual({ title: undefined, subtitle: undefined })
  })

  it('is order-independent: resolving a later index directly matches resolving sequentially', () => {
    const slides = [
      slide('# Ejercicios\n- a'),
      slide('- b'),
      slide('- c'),
      slide('# Casos de uso\n- d'),
      slide('- e'),
    ]
    // Resolving index 4 directly (as if slide 3's transform hadn't "run" yet
    // in some other bookkeeping sense) must still see the chain correctly,
    // since resolution always reads the full `slides` array from scratch.
    expect(resolveSlideHeadings(slides, 4)).toEqual({ title: 'Casos de uso', subtitle: undefined })
  })
})

describe('injectCarriedHeadings', () => {
  it('injects both title and subtitle when absent', () => {
    const own = parseLeadingHeadings('- bullet')
    expect(injectCarriedHeadings('- bullet', own, { title: 'Ejercicios', subtitle: 'Parte 1' }))
      .toBe('# Ejercicios\n## Parte 1\n- bullet')
  })

  it('injects only the subtitle when the slide already has its own title', () => {
    const content = '# Dobles\n- bullet'
    const own = parseLeadingHeadings(content)
    expect(injectCarriedHeadings(content, own, { title: 'Dobles', subtitle: 'Ejercicio 8' }))
      .toBe('# Dobles\n## Ejercicio 8\n- bullet')
  })

  it('injects only the title when the slide already has its own subtitle', () => {
    const content = '## Ejercicio 3\n- bullet'
    const own = parseLeadingHeadings(content)
    expect(injectCarriedHeadings(content, own, { title: 'Dobles', subtitle: 'Ejercicio 3' }))
      .toBe('# Dobles\n## Ejercicio 3\n- bullet')
  })

  it('leaves content untouched when nothing needs injecting', () => {
    const content = '# Dobles\n## Ejercicio 8\n- bullet'
    const own = parseLeadingHeadings(content)
    expect(injectCarriedHeadings(content, own, { title: 'Dobles', subtitle: 'Ejercicio 8' })).toBe(content)
  })

  it('leaves an explicit empty heading as-is rather than filling it back in', () => {
    const content = '#\n- bullet'
    const own = parseLeadingHeadings(content)
    expect(injectCarriedHeadings(content, own, { title: undefined, subtitle: undefined })).toBe(content)
  })

  it('leaves content untouched when nothing is resolved and nothing is own', () => {
    const content = '- bullet'
    const own = parseLeadingHeadings(content)
    expect(injectCarriedHeadings(content, own, {})).toBe(content)
  })
})
