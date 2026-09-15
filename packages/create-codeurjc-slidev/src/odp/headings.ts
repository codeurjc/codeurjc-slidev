import { advanceCarryState, isDefaultLayout } from 'codeurjc-slidev-theme/composables/useSlideTitleCarryover'

// Writes the fewest `#`/`##` headings for which the theme's own title
// carry-over resolves every `default`-layout slide to the title and subtitle
// it had in the ODP. Slides are processed in file order including hidden ones,
// because Slidev runs the carry-over preparser on every parsed slide before it
// drops hidden slides.

export interface DesiredHeadings {
  title?: string
  subtitle?: string
}

export interface HeadingSlide {
  frontmatter: Record<string, unknown>
  desired: DesiredHeadings
}

export interface EmittedHeadings {
  /** Leading heading lines to write, in order (e.g. `# Title`, `##`). */
  lines: string[]
  /** Whether to set `resetTitle: true` in the slide's frontmatter. */
  resetTitle: boolean
}

export function emitHeadings(slides: HeadingSlide[]): EmittedHeadings[] {
  let carried: DesiredHeadings = {}
  return slides.map((slide) => {
    if (!isDefaultLayout(slide.frontmatter))
      return { lines: [], resetTitle: false }

    const { title, subtitle } = slide.desired
    const clearTitle = title === undefined && carried.title !== undefined
    const clearSubtitle = subtitle === undefined && carried.subtitle !== undefined
    const resetTitle = clearTitle && clearSubtitle

    const lines: string[] = []
    if (title !== undefined && title !== carried.title)
      lines.push(`# ${title}`)
    else if (clearTitle && !resetTitle)
      lines.push('#')
    if (subtitle !== undefined && subtitle !== carried.subtitle)
      lines.push(`## ${subtitle}`)
    else if (clearSubtitle && !resetTitle)
      lines.push('##')

    const emitted = { lines, resetTitle }
    carried = advanceCarryState(carried, {
      content: lines.join('\n'),
      frontmatter: resetTitle ? { ...slide.frontmatter, resetTitle: true } : slide.frontmatter,
    })
    return emitted
  })
}
