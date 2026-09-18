import type { GitRunner } from 'codeurjc-slidev-theme/composables/useSourceLink'
import type { ConvertResult } from './convert'
import type { OfficeRunner } from './office'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { copyCodeFolder } from './code'
import { convertOdp } from './convert'
import { importReportMarkdown, reportFileName, REPORTS_DIR } from './importReport'

// Entry point bundled into `dist/odp-import.mjs` for the published CLI:
// converts an ODP and writes the result into an already-scaffolded project.

export { convertOdp } from './convert'

export interface ImportProjectOptions {
  odpPath: string
  /** The scaffolded project's root directory. */
  root: string
  codeDir?: string
  codeRepo?: string
  office?: OfficeRunner | false
  git?: GitRunner
  /** Clock for the import report's timestamp (tests pin it). */
  now?: () => Date
  /** create-codeurjc-slidev's version, recorded in the import report. */
  version?: string
  /** The deck's own markdown file name, relative to `root`. Default `slides.md`. */
  deckFile?: string
  /** The deck's code path relative to `root` (`@/<codeBase>/...` imports resolve here too). Default `code`. */
  codeBase?: string
  /** The deck's images path relative to `root/public`. Default `images`. */
  imagesBase?: string
  /** The deck's rendered-original SVGs path relative to `root/public`. Default `odp-originals`. */
  originalsBase?: string
  /** The comparison deck's own markdown file name, relative to `root`. Default `comparison.md`. */
  comparisonFile?: string
}

export interface ImportProjectResult {
  result: ConvertResult
  hasComparison: boolean
  codeFiles: number
  /** The import report's path, relative to the project root. */
  reportPath?: string
  /** The comparison file's name used for this import (whether or not it was actually written). Default `comparison.md`. */
  comparisonFile?: string
}

function writeFile(path: string, data: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

export async function importOdpProject(options: ImportProjectOptions): Promise<ImportProjectResult> {
  const deckFile = options.deckFile ?? 'slides.md'
  const codeBase = options.codeBase ?? 'code'
  const comparisonFile = options.comparisonFile ?? 'comparison.md'
  const result = await convertOdp({ ...options, deckFile, codeBase })
  writeFile(join(options.root, deckFile), result.slidesMarkdown)
  for (const [path, data] of result.images)
    writeFile(join(options.root, 'public', path), data)
  const codeFiles = result.codeFolder ? copyCodeFolder(result.codeFolder, join(options.root, codeBase)) : 0
  if (result.comparisonMarkdown) {
    writeFile(join(options.root, comparisonFile), result.comparisonMarkdown)
    for (const [path, svg] of result.originals)
      writeFile(join(options.root, 'public', path), svg)
  }
  // The report goes last, so it records the comparison deck's final outcome.
  // Earlier reports are never overwritten: the name is timestamped, with a
  // suffix on a same-second clash.
  const importedAt = (options.now ?? (() => new Date()))()
  const reportsDir = join(options.root, REPORTS_DIR)
  const fileName = reportFileName(importedAt, new Set(existsSync(reportsDir) ? readdirSync(reportsDir) : []))
  writeFile(join(reportsDir, fileName), importReportMarkdown(result, { odpPath: options.odpPath, importedAt, version: options.version ?? 'unknown', deckFile, comparisonFile }))
  return { result, hasComparison: Boolean(result.comparisonMarkdown), codeFiles, reportPath: `${REPORTS_DIR}/${fileName}`, comparisonFile }
}

/** Console lines summarizing an import: counts, notices, and every loss by slide. */
export function formatReport(imported: ImportProjectResult): string[] {
  const { result, codeFiles } = imported
  const { stats } = result
  const lines = [
    `  Converted ${stats.odpSlides} ODP slides into ${stats.slides} slides${stats.mergedBuildUps ? ` (${stats.mergedBuildUps} build-up${stats.mergedBuildUps === 1 ? '' : 's'} merged into click steps)` : ''}`,
    `  Code: ${stats.imports} snippet import${stats.imports === 1 ? '' : 's'}, ${stats.inlineCode} inline block${stats.inlineCode === 1 ? '' : 's'}${codeFiles ? `, ${codeFiles} files copied into code/` : ''}`,
    ...result.notices.map(n => `  ! ${n}`),
  ]
  const where = (r: ConvertResult['reports'][number]) => {
    const odp = r.odpNumbers.length === 1 ? `ODP slide ${r.odpNumbers[0]}` : `ODP slides ${r.odpNumbers[0]}–${r.odpNumbers[r.odpNumbers.length - 1]}`
    return r.hidden ? `Hidden slide (${odp})` : `Slide ${r.slidevNumber} (${odp})`
  }
  const noted = result.reports.filter(r => r.info.length > 0)
  if (noted.length > 0) {
    lines.push(`  Converted with notes (${noted.length} slide${noted.length === 1 ? '' : 's'}; nothing lost, worth a look):`)
    for (const r of noted)
      lines.push(`    ${where(r)}: ${r.info.join('; ')}`)
  }
  const lossy = result.reports.filter(r => r.losses.length > 0)
  if (lossy.length > 0) {
    lines.push(`  Not converted (${lossy.length} slide${lossy.length === 1 ? '' : 's'}; slides.md contains none of this):`)
    for (const r of lossy)
      lines.push(`    ${where(r)}: ${r.losses.join('; ')}`)
  }
  const comparisonFile = imported.comparisonFile ?? 'comparison.md'
  lines.push(result.comparison === 'written'
    ? `  Comparison deck written to ${comparisonFile} (open it with \`slidev ${comparisonFile} --open\`)`
    : result.comparison === 'no-losses'
      ? '  Nothing was lost, so no comparison deck was needed'
      : '  Comparison deck not written (see the notice above)')
  if (imported.reportPath)
    lines.push(`  Report written to ${imported.reportPath}`)
  return lines
}
