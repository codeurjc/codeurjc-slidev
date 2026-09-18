import type { GitRunner } from 'codeurjc-slidev-theme/composables/useSourceLink'
import type { OdpShape } from './model'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import process from 'node:process'
import { computeSelectorForSelection } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { extractSymrefTarget, findGitRoot, parseDefaultBranch, parseGitHubRemote, realGitRunner } from 'codeurjc-slidev-theme/composables/useSourceLink'
import { shapeText } from './model'

// Code blocks: extracting their text, inferring a language, locating and
// copying the ODP's code folder, matching blocks against its files (exact ->
// `<<<` import, near -> inline fence with a source link, none -> inline), and
// building GitHub source URLs from a `--code-repo` flag or the folder's origin.

// --- Text and language ---------------------------------------------------------

/** A code shape's lines: tabs expanded to four spaces, trailing spaces trimmed, leading/trailing blank lines dropped. */
export function codeLinesOf(shape: OdpShape): string[] {
  const lines = shapeText(shape)
    .replace(/\xA0/g, ' ')
    .replace(/\t/g, '    ')
    .split('\n')
    .map(l => l.replace(/\s+$/, ''))
  while (lines.length > 0 && lines[0].trim() === '')
    lines.shift()
  while (lines.length > 0 && lines[lines.length - 1].trim() === '')
    lines.pop()
  return lines
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  java: 'java',
  kt: 'kotlin',
  groovy: 'groovy',
  gradle: 'groovy',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  html: 'html',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  json: 'json',
  properties: 'properties',
  sh: 'shell',
  bash: 'shell',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rb: 'ruby',
  sql: 'sql',
  md: 'markdown',
  css: 'css',
  toml: 'toml',
}

export function languageForFilename(filename: string): string | undefined {
  if (/(?:^|\/)dockerfile$/i.test(filename))
    return 'dockerfile'
  return EXTENSION_LANGUAGES[extname(filename).slice(1).toLowerCase()]
}

/** Language from a filename label, else from the code itself, else `text`. */
export function inferLanguage(lines: string[], label?: string): string {
  const fromLabel = label ? languageForFilename(label) : undefined
  if (fromLabel)
    return fromLabel
  const nonEmpty = lines.map(l => l.trim()).filter(Boolean)
  const first = nonEmpty[0] ?? ''
  const all = lines.join('\n')
  if (/^<!doctype html|^<html/i.test(first))
    return 'html'
  if (first.startsWith('<'))
    return 'xml'
  if (first.startsWith('$ '))
    return 'shell'
  if (/^\s*(?:name|on|jobs|steps|runs-on|services|version|image|stages|script):/m.test(all) && !/[;{}]\s*$/m.test(all))
    return 'yaml'
  if (/\b(?:package|import)\s+[\w.*]+;|\bpublic\s+(?:class|interface|enum|void|static|abstract|final)\b|@(?:Test|Override|BeforeEach|AfterEach|Mock)\b|\bclass\s+\w+\s*(?:extends|implements|\{)/.test(all))
    return 'java'
  if (/\bfunction\b|\bdescribe\(|\bconst\s+\w+\s*=|\blet\s+\w+\s*=|=>/.test(all))
    return 'javascript'
  return 'text'
}

/** The line-comment token inline markers can use in a language, or undefined when it has none. */
export function commentToken(language: string): '//' | '#' | undefined {
  if (['java', 'kotlin', 'groovy', 'javascript', 'typescript', 'jsx', 'tsx', 'c', 'cpp', 'csharp', 'go', 'css'].includes(language))
    return '//'
  if (['yaml', 'shell', 'python', 'properties', 'dockerfile', 'ruby', 'toml'].includes(language))
    return '#'
  return undefined
}

// --- Code folder -----------------------------------------------------------------

export const EXCLUDED_DIRS = new Set(['target', 'node_modules', '.git', 'build', 'dist', '.idea'])

/** `--code` when given, else a directory next to the ODP named like the ODP without its extension. */
export function resolveCodeFolder(odpPath: string, explicit?: string): string | undefined {
  const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory()
  if (explicit)
    return isDir(explicit) ? explicit : undefined
  const sibling = join(dirname(odpPath), basename(odpPath, extname(odpPath)))
  return isDir(sibling) ? sibling : undefined
}

/** Recursively copies `src` into `dest`, skipping build/tooling directories and symlinks. Returns the number of files copied. */
export function copyCodeFolder(src: string, dest: string): number {
  let count = 0
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      continue
    const from = join(src, entry.name)
    const to = join(dest, entry.name)
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name))
        count += copyCodeFolder(from, to)
    }
    else if (entry.isFile()) {
      copyFileSync(from, to)
      count++
    }
  }
  return count
}

// --- Index and matching -----------------------------------------------------------

const TEXT_FILE_RE = /\.(?:java|kt|groovy|gradle|xml|ya?ml|properties|json|m?js|cjs|tsx?|jsx|py|sh|bash|html|css|md|txt|sql|c|cpp|cc|h|hpp|cs|go|rb|php|toml|ini|cfg|conf)$|(?:^|\/)(?:Dockerfile|Makefile|Jenkinsfile)$/i
const MAX_FILE_BYTES = 300_000

export interface IndexedFile {
  /** Path relative to the code folder, with `/` separators. */
  relPath: string
  lines: string[]
  /** Non-blank lines, normalized, with their real 1-based line numbers. */
  normalized: { text: string, line: number }[]
  lineSet: Set<string>
}

export function normalizeCodeLine(line: string): string {
  return line.replace(/\s+/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, '\'')
}

const ELISION_RE = /^(?:\.\.\.|…)$/

export function indexFile(relPath: string, text: string): IndexedFile {
  const lines = text.split(/\r?\n/)
  const normalized = lines.flatMap((l, i) => {
    const n = normalizeCodeLine(l)
    return n ? [{ text: n, line: i + 1 }] : []
  })
  return { relPath, lines, normalized, lineSet: new Set(normalized.map(n => n.text)) }
}

/** Indexes every text file under `root` (skipping excluded directories and large files). */
export function buildCodeIndex(root: string): IndexedFile[] {
  const out: IndexedFile[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name))
          walk(abs)
      }
      else if (entry.isFile()) {
        const rel = relative(root, abs).split(sep).join('/')
        if (!TEXT_FILE_RE.test(rel) || statSync(abs).size > MAX_FILE_BYTES)
          continue
        out.push(indexFile(rel, readFileSync(abs, 'utf-8')))
      }
    }
  }
  walk(root)
  return out
}

export interface CodeMatch {
  kind: 'exact' | 'near' | 'none'
  file?: IndexedFile
  /** 1-based real file lines spanning the matched lines (inclusive). */
  startLine?: number
  endLine?: number
  matched: number
  total: number
}

function lcsSpan(block: string[], file: IndexedFile): { matched: number, first: number, last: number } {
  const n = block.length
  const m = file.normalized.length
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = block[i] === file.normalized[j].text ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  }
  let i = 0
  let j = 0
  let first = -1
  let last = -1
  while (i < n && j < m) {
    if (block[i] === file.normalized[j].text) {
      if (first === -1)
        first = file.normalized[j].line
      last = file.normalized[j].line
      i++
      j++
    }
    else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    }
    else {
      j++
    }
  }
  return { matched: dp[0][0], first, last }
}

function exactStart(block: string[], file: IndexedFile): number {
  const norm = file.normalized
  for (let i = 0; i + block.length <= norm.length; i++) {
    if (block.every((line, k) => norm[i + k].text === line))
      return i
  }
  return -1
}

function preferFile(a: IndexedFile, b: IndexedFile, projectLabel: string | undefined): number {
  if (projectLabel) {
    const has = (f: IndexedFile) => f.relPath.split('/').includes(projectLabel)
    if (has(a) !== has(b))
      return has(a) ? -1 : 1
  }
  if (a.relPath.length !== b.relPath.length)
    return a.relPath.length - b.relPath.length
  return a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0
}

/**
 * Matches a code block against indexed files, comparing whitespace-insensitive
 * non-blank lines. `exact`: every block line matches one contiguous run of the
 * file's non-blank lines. `near`: at least half the block's lines match in
 * order. Elision lines (`...`/`…`) are ignored but make an exact match near.
 */
export function matchCode(lines: string[], index: IndexedFile[], projectLabel?: string): CodeMatch {
  const normalized = lines.map(normalizeCodeLine).filter(Boolean)
  const hasElision = normalized.some(l => ELISION_RE.test(l))
  const block = normalized.filter(l => !ELISION_RE.test(l))
  const total = block.length
  if (total === 0)
    return { kind: 'none', matched: 0, total }

  if (!hasElision) {
    const exact = index
      .map(file => ({ file, start: exactStart(block, file) }))
      .filter(c => c.start !== -1)
      .sort((a, b) => preferFile(a.file, b.file, projectLabel))[0]
    if (exact) {
      return {
        kind: 'exact',
        file: exact.file,
        startLine: exact.file.normalized[exact.start].line,
        endLine: exact.file.normalized[exact.start + total - 1].line,
        matched: total,
        total,
      }
    }
  }

  const threshold = Math.ceil(total / 2)
  let best: { file: IndexedFile, matched: number, first: number, last: number } | undefined
  for (const file of index) {
    let present = 0
    for (const l of block) {
      if (file.lineSet.has(l))
        present++
    }
    if (present < threshold || (best && present < best.matched))
      continue
    const span = lcsSpan(block, file)
    if (span.matched < threshold)
      continue
    if (!best || span.matched > best.matched || (span.matched === best.matched && preferFile(file, best.file, projectLabel) < 0))
      best = { file, ...span }
  }
  if (!best)
    return { kind: 'none', matched: 0, total }
  return { kind: 'near', file: best.file, startLine: best.first, endLine: best.last, matched: best.matched, total }
}

/** Whether a matched span covers every non-blank line of its file. */
export function isWholeFile(file: IndexedFile, startLine: number, endLine: number): boolean {
  const norm = file.normalized
  return norm.length > 0 && startLine <= norm[0].line && endLine >= norm[norm.length - 1].line
}

/** The `<<< @/code/...` line for an exact match, with a selector unless it spans the whole file. `codeBase` is the deck's code path relative to the project root (`code`, or `code/<slug>` for a namespaced deck). */
export function importLineFor(match: CodeMatch, language: string, codeBase = 'code'): string {
  const file = match.file!
  const whole = isWholeFile(file, match.startLine!, match.endLine!)
  const selector = whole ? '' : `[${computeSelectorForSelection(file.lines, { startLine: match.startLine!, endLine: match.endLine! })}]`
  return `<<< @/${codeBase}/${file.relPath}${selector} ${language}`
}

// --- Source-link base URL -----------------------------------------------------------

export interface RepoBase {
  owner: string
  repo: string
  branch: string
  /** Path of the code folder inside the repository, `/`-separated, '' for the repo root. */
  subpath: string
}

const CODE_REPO_RE = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/tree\/([^/\s]+)(?:\/([^#?\s]*))?)?\/?$/

/**
 * Parses `--code-repo` (`https://github.com/<owner>/<repo>[/tree/<branch>/<subpath>]`).
 * A missing branch is asked from the remote like the theme does; undefined when
 * the URL isn't a GitHub repo URL or no branch can be resolved.
 */
export function parseCodeRepoFlag(url: string, git: GitRunner = realGitRunner, cwd = process.cwd()): RepoBase | undefined {
  const m = CODE_REPO_RE.exec(url.trim())
  if (!m)
    return undefined
  const [, owner, repo, branchFromUrl, subpath] = m
  const branch = branchFromUrl
    ?? parseDefaultBranch(extractSymrefTarget(git(['ls-remote', '--symref', `https://github.com/${owner}/${repo}.git`, 'HEAD'], cwd)))
  if (!branch)
    return undefined
  return { owner, repo, branch, subpath: (subpath ?? '').replace(/^\/+|\/+$/g, '') }
}

/** Derives the base from the code folder's enclosing git checkout (GitHub `origin` + default branch), unless git ignores the folder. */
export function detectRepoBase(codeFolder: string, git: GitRunner = realGitRunner): RepoBase | undefined {
  const real = realpathSync(codeFolder)
  const root = findGitRoot(real)
  // An ignored folder isn't on the remote, so links into it would 404.
  if (!root || git(['check-ignore', real], root) !== null)
    return undefined
  const github = parseGitHubRemote(git(['remote', 'get-url', 'origin'], root))
  if (!github)
    return undefined
  const branch = parseDefaultBranch(git(['symbolic-ref', 'refs/remotes/origin/HEAD'], root))
    ?? parseDefaultBranch(extractSymrefTarget(git(['ls-remote', '--symref', 'origin', 'HEAD'], root)))
  if (!branch)
    return undefined
  return { ...github, branch, subpath: relative(root, real).split(sep).join('/') }
}

/** `https://github.com/<owner>/<repo>/blob/<branch>/<subpath>/<relPath>[#L<a>-L<b>]` */
export function sourceUrl(base: RepoBase, relPath: string, lines?: { startLine: number, endLine: number }): string {
  const path = [base.subpath, relPath].filter(Boolean).join('/').split('/').map(encodeURIComponent).join('/')
  const fragment = lines ? `#L${lines.startLine}-L${lines.endLine}` : ''
  return `https://github.com/${base.owner}/${base.repo}/blob/${base.branch}/${path}${fragment}`
}
