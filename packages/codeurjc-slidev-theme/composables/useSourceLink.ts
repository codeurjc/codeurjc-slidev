// Resolves a GitHub source link for a file backed by a `<<<` snippet import:
// walks up to the file's nearest enclosing git repo, reads its `origin`
// remote, resolves a branch (configured override, else the repo's actual
// default branch), and assembles a `.../blob/<branch>/<path>#L<start>-L<end>`
// URL. Runs in a Node/Vite context (setup/transformers.ts) and in unit tests;
// git access is injected (`GitRunner`) so parsing/assembly can be unit tested
// without a real git repo, and so the real implementation can be swapped for
// a stub in tests that exercise the caching layer.

import { existsSync, realpathSync } from 'fs'
import { dirname, relative, sep } from 'path'
import { execFileSync } from 'child_process'

/** Runs `git <args>` in `cwd`, returning trimmed stdout, or `null` on any failure (not a git repo, no such remote/ref, git not installed). */
export type GitRunner = (args: string[], cwd: string) => string | null

export const realGitRunner: GitRunner = (args, cwd) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  }
  catch {
    return null
  }
}

/** Walks up from `startDir` looking for a `.git` entry (directory or file, the latter covering worktrees/submodules). Returns the containing directory, or null if none is found before the filesystem root. */
export function findGitRoot(startDir: string): string | null {
  let dir = startDir
  while (true) {
    if (existsSync(`${dir}${sep}.git`)) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export interface GitHubRepo {
  owner: string
  repo: string
}

const SSH_REMOTE_RE = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/
const HTTPS_REMOTE_RE = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/

/** Parses a git remote URL into a GitHub `{ owner, repo }`, or null for a missing/non-GitHub remote. */
export function parseGitHubRemote(remoteUrl: string | null): GitHubRepo | null {
  if (!remoteUrl) return null
  const m = SSH_REMOTE_RE.exec(remoteUrl) ?? HTTPS_REMOTE_RE.exec(remoteUrl)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

/** Strips a `refs/remotes/origin/`, bare `origin/`, or `refs/heads/` prefix off a resolved ref target, leaving just the branch name. The first two come from a local `symbolic-ref`; `refs/heads/` comes from the remote's own `ls-remote --symref` report (see `extractSymrefTarget`). */
export function parseDefaultBranch(refTarget: string | null): string | null {
  if (!refTarget) return null
  const m = /^(?:refs\/remotes\/origin\/|refs\/heads\/|origin\/)(.+)$/.exec(refTarget)
  return m ? m[1] : refTarget
}

/** Extracts the `ref: refs/heads/<branch>` target line out of `git ls-remote --symref origin HEAD`'s output. */
export function extractSymrefTarget(lsRemoteOutput: string | null): string | null {
  if (!lsRemoteOutput) return null
  const m = /^ref:\s+(\S+)/m.exec(lsRemoteOutput)
  return m ? m[1] : null
}

export interface RepoLinkInfo {
  repoRoot: string
  github: GitHubRepo | null
  defaultBranch: string | null
}

/**
 * Resolves the GitHub repo + default branch for the git repo containing
 * `absFilePath`. Returns null if no enclosing git repo is found.
 *
 * Default-branch resolution tries the local `refs/remotes/origin/HEAD`
 * symref first (fast, no network) -- but that ref is only ever written by
 * `git clone` itself or an explicit `git remote set-head origin -a`, not by
 * a plain `fetch`/`pull`, so a repo set up any other way (or copied without
 * that one ref file) has it missing even though the remote it points at
 * knows its own default branch perfectly well. Falling back to asking the
 * remote directly via `git ls-remote --symref origin HEAD` covers exactly
 * that gap; the extra network round-trip only happens once per repo root
 * thanks to `resolveRepoLinkInfoCached` below.
 */
export function resolveRepoLinkInfo(absFilePath: string, git: GitRunner = realGitRunner): RepoLinkInfo | null {
  const repoRoot = findGitRoot(dirname(absFilePath))
  if (!repoRoot) return null
  const github = parseGitHubRemote(git(['remote', 'get-url', 'origin'], repoRoot))
  const localSymref = parseDefaultBranch(git(['symbolic-ref', 'refs/remotes/origin/HEAD'], repoRoot))
  const defaultBranch = localSymref ?? parseDefaultBranch(extractSymrefTarget(git(['ls-remote', '--symref', 'origin', 'HEAD'], repoRoot)))
  return { repoRoot, github, defaultBranch }
}

const repoLinkInfoCache = new Map<string, RepoLinkInfo | null>()

/** Same as `resolveRepoLinkInfo`, cached per resolved repo root for the lifetime of the process (a repo's remote/default-branch doesn't change mid dev-server-session). */
export function resolveRepoLinkInfoCached(absFilePath: string, git: GitRunner = realGitRunner): RepoLinkInfo | null {
  const repoRoot = findGitRoot(dirname(absFilePath))
  if (!repoRoot) return null
  if (!repoLinkInfoCache.has(repoRoot)) {
    repoLinkInfoCache.set(repoRoot, resolveRepoLinkInfo(absFilePath, git))
  }
  return repoLinkInfoCache.get(repoRoot) ?? null
}

/** Clears the per-repo-root cache; test-only escape hatch. */
export function clearRepoLinkInfoCache(): void {
  repoLinkInfoCache.clear()
}

export interface SourceLinkSelection {
  startLine: number
  endLine: number
  /** Whether the selection spans the whole file -- suppresses the `#L..` fragment. */
  isWholeFile: boolean
}

/**
 * Builds the final GitHub source-link URL for `absFilePath`, or null if no
 * link can be resolved (no enclosing git repo, no GitHub `origin` remote, or
 * no resolvable branch).
 */
export function buildGithubSourceLink(
  absFilePath: string,
  selection: SourceLinkSelection,
  configuredBranch: string | null | undefined,
  git: GitRunner = realGitRunner,
): string | null {
  // Resolves symlinks before walking up for `.git`/computing the repo-relative
  // path -- otherwise a `code/` directory reached through a symlink (as in
  // this project's own isolated-worker e2e fixtures, or a consumer's `code/`
  // being a submodule symlink) would compute a relative path rooted at the
  // symlink's own location rather than the real repo it points into.
  let realAbsFilePath = absFilePath
  try {
    realAbsFilePath = realpathSync(absFilePath)
  } catch {
    // File doesn't exist on disk (shouldn't happen -- the import already
    // read it successfully by this point) -- fall back to the given path.
  }

  const info = resolveRepoLinkInfoCached(realAbsFilePath, git)
  if (!info?.github) return null
  const branch = configuredBranch ?? info.defaultBranch
  if (!branch) return null

  const relPath = relative(info.repoRoot, realAbsFilePath).split(sep).join('/')
  const fragment = selection.isWholeFile ? '' : `#L${selection.startLine}-L${selection.endLine}`
  return `https://github.com/${info.github.owner}/${info.github.repo}/blob/${branch}/${relPath}${fragment}`
}
