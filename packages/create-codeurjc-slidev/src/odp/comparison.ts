import { toYaml } from './frontmatter'

// Builds `comparison.md`: for every converted slide that lost something, an
// information slide (rendered original, losses, and the converted slide's
// Slidev number) followed by that converted slide imported from `slides.md`.
// Information slides never use the `default` layout, so they can't take part
// in (or disturb) title carry-over of the imported slides.

export interface ComparisonEntry {
  /** ODP slide numbers (several when a build-up was merged into one slide). */
  odpNumbers: number[]
  /** Slide number shown when presenting `slides.md` (not counting hidden slides); undefined for hidden slides. */
  slidevNumber?: number
  /** 1-based position among all slides of `slides.md`, hidden ones included -- what `src: ./slides.md#N` indexes. */
  fileIndex: number
  hidden: boolean
  losses: string[]
  /** Public path of the rendered original (e.g. `/odp-originals/page16.svg`), when one exists. */
  originalImage?: string
}

const HEADMATTER = { theme: 'codeurjc-slidev-theme', colorSchema: 'light', aspectRatio: '16/9' }

function odpLabel(numbers: number[]): string {
  return numbers.length === 1 ? `ODP slide ${numbers[0]}` : `ODP slides ${numbers[0]}–${numbers[numbers.length - 1]}`
}

/** The comparison deck's markdown, or undefined when no slide has losses. `deckFile` is the deck's own markdown file name (default `slides.md`) that `src:` includes point at. */
export function comparisonMarkdown(entries: ComparisonEntry[], deckTitle: string, deckFile = 'slides.md'): string | undefined {
  const withLosses = entries.filter(e => e.losses.length > 0)
  if (withLosses.length === 0)
    return undefined

  const slides: string[] = []
  withLosses.forEach((entry, i) => {
    const frontmatter: Record<string, string> = {
      ...(i === 0 ? { ...HEADMATTER, title: `Comparison — ${deckTitle}` } : {}),
      ...(entry.originalImage
        ? { layout: 'image-right', image: entry.originalImage, backgroundSize: 'contain' }
        : { layout: 'center' }),
    }
    const heading = entry.hidden ? `# Hidden slide` : `# Slide ${entry.slidevNumber}`
    const notes = [
      odpLabel(entry.odpNumbers),
      ...(entry.hidden ? ['', 'Original not rendered: LibreOffice doesn\'t export hidden slides, and Slidev doesn\'t load them.'] : []),
      ...(!entry.hidden && !entry.originalImage ? ['', 'Original not rendered.'] : []),
    ]
    const losses = entry.losses.map(l => `- ${l}`)
    slides.push(`---\n${toYaml(frontmatter)}\n---\n\n${heading}\n\n${notes.join('\n')}\n\n${losses.join('\n')}\n`)
    if (!entry.hidden)
      slides.push(`---\nsrc: ./${deckFile}#${entry.fileIndex}\n---\n`)
  })
  return slides.join('\n')
}
