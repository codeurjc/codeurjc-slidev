import type { GitRunner } from 'codeurjc-slidev-theme/composables/useSourceLink'
import type { ConvertResult } from './convert'
import type { OfficeRunner } from './office'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { copyCodeFolder } from './code'
import { convertOdp } from './convert'

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
}

export interface ImportProjectResult {
  result: ConvertResult
  hasComparison: boolean
  codeFiles: number
}

function writeFile(path: string, data: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

export async function importOdpProject(options: ImportProjectOptions): Promise<ImportProjectResult> {
  const result = await convertOdp(options)
  writeFile(join(options.root, 'slides.md'), result.slidesMarkdown)
  for (const [path, data] of result.images)
    writeFile(join(options.root, 'public', path), data)
  const codeFiles = result.codeFolder ? copyCodeFolder(result.codeFolder, join(options.root, 'code')) : 0
  if (result.comparisonMarkdown) {
    writeFile(join(options.root, 'comparison.md'), result.comparisonMarkdown)
    for (const [path, svg] of result.originals)
      writeFile(join(options.root, 'public', path), svg)
  }
  return { result, hasComparison: Boolean(result.comparisonMarkdown), codeFiles }
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
  lines.push(result.comparison === 'written'
    ? '  Comparison deck written to comparison.md (open it with the dev:compare script)'
    : result.comparison === 'no-losses'
      ? '  Nothing was lost, so no comparison deck was needed'
      : '  Comparison deck not written (see the notice above)')
  return lines
}
