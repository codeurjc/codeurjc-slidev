import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

// LibreOffice access for the comparison deck: version detection and SVG
// export. The process call is injected (`OfficeRunner`) so everything else is
// testable without LibreOffice installed.

export interface OfficeResult {
  /** Process exit code; -1 when the executable couldn't be started (e.g. not installed). */
  code: number
  stdout: string
}

export type OfficeRunner = (args: string[], timeoutMs: number) => Promise<OfficeResult>

export const realOfficeRunner: OfficeRunner = (args, timeoutMs) => new Promise((resolve) => {
  execFile('soffice', args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
    const code = error ? (typeof (error as NodeJS.ErrnoException).code === 'number' ? Number((error as NodeJS.ErrnoException).code) : -1) : 0
    resolve({ code, stdout: String(stdout ?? '') })
  })
})

export const MIN_LIBREOFFICE = { major: 7, minor: 4 }

export type LibreOfficeStatus
  = | { ok: true, version: string }
    | { ok: false, reason: 'missing' }
    | { ok: false, reason: 'too-old', version: string }

export async function detectLibreOffice(run: OfficeRunner = realOfficeRunner): Promise<LibreOfficeStatus> {
  const { code, stdout } = await run(['--version'], 60_000)
  const m = /LibreOffice\s+(\d+)\.(\d+)(?:\.\d+)*/.exec(stdout)
  if (code !== 0 || !m)
    return { ok: false, reason: 'missing' }
  const [major, minor] = [Number(m[1]), Number(m[2])]
  const version = m[0].replace(/^LibreOffice\s+/, '')
  if (major < MIN_LIBREOFFICE.major || (major === MIN_LIBREOFFICE.major && minor < MIN_LIBREOFFICE.minor))
    return { ok: false, reason: 'too-old', version }
  return { ok: true, version }
}

/**
 * Exports every visible slide of `odpPath` to one SVG document with a
 * throwaway LibreOffice user profile (so an already-open LibreOffice session
 * doesn't interfere), returning its text. Temporary files are always removed.
 */
export async function exportSvg(odpPath: string, run: OfficeRunner = realOfficeRunner): Promise<string> {
  const work = mkdtempSync(join(tmpdir(), 'odp-import-office-'))
  try {
    const profile = join(work, 'profile')
    const outDir = join(work, 'out')
    const { code, stdout } = await run([
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      '--headless',
      '--convert-to',
      'svg',
      '--outdir',
      outDir,
      odpPath,
    ], 300_000)
    const svgPath = join(outDir, `${basename(odpPath, extname(odpPath))}.svg`)
    try {
      return readFileSync(svgPath, 'utf-8')
    }
    catch {
      const detail = stdout.trim().split('\n').pop()
      throw new Error(`LibreOffice SVG export failed (exit code ${code}): ${svgPath} was not written${detail ? ` (${detail})` : ''}`)
    }
  }
  finally {
    rmSync(work, { recursive: true, force: true })
  }
}
