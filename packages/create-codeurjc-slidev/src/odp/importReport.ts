import type { CodeBlockReport, ConvertResult, SlideReport } from './convert'

// The markdown import report written into `import-reports/` on every import: a
// lasting record of what the console prints (context, notices, notes, losses)
// plus how every code block matched the code folder. Pure: the clock and the
// importer version are passed in.

export interface ImportReportOptions {
  odpPath: string
  importedAt: Date
  /** create-codeurjc-slidev's version. */
  version: string
}

export const REPORTS_DIR = 'import-reports'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local `YYYY-MM-DDTHH-MM-SS`: sorts chronologically, and has no `:` (forbidden in Windows file names). */
function fileTimestamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

/** A report file name for `importedAt` that isn't in `existing`, adding `-2`, `-3`, ... on a clash. */
export function reportFileName(importedAt: Date, existing: Set<string>): string {
  const stem = `import-report-${fileTimestamp(importedAt)}`
  let name = `${stem}.md`
  for (let n = 2; existing.has(name); n++)
    name = `${stem}-${n}.md`
  return name
}

/** A table cell: pipes escaped, line breaks kept as `<br>`. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

/** Inline code wide enough to contain any backticks in `text`. */
function code(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map(m => m[0].length))
  const ticks = '`'.repeat(longest + 1)
  return longest > 0 ? `${ticks} ${text} ${ticks}` : `${ticks}${text}${ticks}`
}

function table(header: string[], rows: string[][]): string {
  return [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...rows.map(r => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n')
}

function slideLabel(r: { slidevNumber?: number, hidden: boolean }): string {
  return r.hidden ? 'hidden' : String(r.slidevNumber)
}

function odpLabel(numbers: number[]): string {
  return numbers.length === 1 ? String(numbers[0]) : `${numbers[0]}–${numbers[numbers.length - 1]}`
}

function officeLabel(office: ConvertResult['context']['office']): string {
  if (office === 'disabled')
    return 'not used'
  if (office.ok)
    return office.version
  return office.reason === 'missing' ? 'not found (`soffice` ≥ 7.4 is needed)' : `${office.version} found, but ≥ 7.4 is needed`
}

function comparisonLabel(result: ConvertResult): string {
  switch (result.comparison) {
    case 'written': return 'written to `comparison.md`'
    case 'no-losses': return 'not needed (nothing was lost)'
    default: return 'skipped (see the notices)'
  }
}

const OUTCOME_LABELS: Record<CodeBlockReport['outcome'], string> = {
  'imported': 'imported',
  'close': 'close',
  'none': 'no match',
  'command': 'command',
  'no-folder': 'no code folder',
}

function codeDetails(block: CodeBlockReport): string {
  if (block.outcome === 'imported')
    return `${code(block.file!)} lines ${block.startLine}–${block.endLine}`
  if (block.outcome === 'close')
    return `${code(block.file!)} (${block.matched} of ${block.total} lines match)`
  return block.firstLine ? code(block.firstLine) : ''
}

function perSlide(reports: SlideReport[], pick: (r: SlideReport) => string[]): SlideReport[] {
  return reports.filter(r => pick(r).length > 0)
}

export function importReportMarkdown(result: ConvertResult, options: ImportReportOptions): string {
  const { context, stats } = result
  const date = options.importedAt
  const noted = perSlide(result.reports, r => r.info)
  const lossy = perSlide(result.reports, r => r.losses)
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  const sections = [
    `# Import report — ${result.deckTitle}`,
    [
      `- **Source:** ${code(options.odpPath)}`,
      `- **Imported:** ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
      `- **Importer:** create-codeurjc-slidev ${options.version}`,
      `- **Code folder:** ${context.codeFolder ? `${code(context.codeFolder)} (${plural(context.codeFiles, 'file')})` : 'none found'}`,
      `- **Source links:** ${context.repoBase ?? 'none'}`,
      `- **LibreOffice:** ${officeLabel(context.office)}`,
      `- **Comparison deck:** ${comparisonLabel(result)}`,
    ].join('\n'),
    '## Summary',
    [
      `- ${plural(stats.odpSlides, 'ODP slide')} converted into ${plural(stats.slides, 'slide')}${stats.mergedBuildUps ? ` (${plural(stats.mergedBuildUps, 'build-up')} merged into click steps)` : ''}`,
      `- Code: ${plural(stats.imports, 'snippet import')}, ${plural(stats.inlineCode, 'inline block')}`,
      `- ${plural(lossy.length, 'slide')} with losses, ${plural(noted.length, 'slide')} with notes`,
    ].join('\n'),
    '## Notices',
    result.notices.length > 0 ? result.notices.map(n => `- ${n}`).join('\n') : 'No notices.',
    '## Code',
    [
      ...(context.codeFolder ? [] : ['No code folder was found, so no code block could be matched against files.']),
      result.codeBlocks.length > 0
        ? table(['Slide', 'ODP', 'Language', 'Result', 'Details'], result.codeBlocks.map(b => [slideLabel(b), odpLabel(b.odpNumbers), b.language, OUTCOME_LABELS[b.outcome], codeDetails(b)]))
        : 'No code blocks.',
    ].join('\n\n'),
    '## Notes',
    noted.length > 0
      ? table(['Slide', 'ODP', 'Notes'], noted.map(r => [slideLabel(r), odpLabel(r.odpNumbers), r.info.join('\n')]))
      : 'No notes.',
    '## Losses',
    lossy.length > 0
      ? table(['Slide', 'ODP', 'Losses', 'Comparison'], lossy.map((r) => {
          const slide = result.comparisonSlides.get(r.fileIndex)
          return [slideLabel(r), odpLabel(r.odpNumbers), r.losses.join('\n'), slide ? `slide ${slide}` : '—']
        }))
      : 'Nothing was lost.',
  ]
  return `${sections.join('\n\n')}\n`
}
