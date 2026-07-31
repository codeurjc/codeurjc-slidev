import type { GitRunner } from '../useSourceLink'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildGithubSourceLink,
  clearRepoLinkInfoCache,
  extractSymrefTarget,

  parseDefaultBranch,
  parseGitHubRemote,
} from '../useSourceLink'

describe('parseGitHubRemote', () => {
  it('parses an SSH remote', () => {
    expect(parseGitHubRemote('git@github.com:codeurjc/codeurjc-slidev.git')).toEqual({ owner: 'codeurjc', repo: 'codeurjc-slidev' })
  })

  it('parses an HTTPS remote with .git suffix', () => {
    expect(parseGitHubRemote('https://github.com/codeurjc/codeurjc-slidev.git')).toEqual({ owner: 'codeurjc', repo: 'codeurjc-slidev' })
  })

  it('parses an HTTPS remote without .git suffix', () => {
    expect(parseGitHubRemote('https://github.com/codeurjc/codeurjc-slidev')).toEqual({ owner: 'codeurjc', repo: 'codeurjc-slidev' })
  })

  it('returns null for a non-GitHub remote', () => {
    expect(parseGitHubRemote('https://gitlab.com/owner/repo.git')).toBeNull()
  })

  it('returns null for a missing remote', () => {
    expect(parseGitHubRemote(null)).toBeNull()
  })
})

describe('parseDefaultBranch', () => {
  it('strips a refs/remotes/origin/ prefix', () => {
    expect(parseDefaultBranch('refs/remotes/origin/main')).toBe('main')
  })

  it('strips a bare origin/ prefix', () => {
    expect(parseDefaultBranch('origin/master')).toBe('master')
  })

  it('strips a refs/heads/ prefix (from ls-remote --symref)', () => {
    expect(parseDefaultBranch('refs/heads/main')).toBe('main')
  })

  it('returns null when there is nothing to parse', () => {
    expect(parseDefaultBranch(null)).toBeNull()
  })
})

describe('extractSymrefTarget', () => {
  it('extracts the ref: target line from ls-remote --symref output', () => {
    const output = 'ref: refs/heads/main\tHEAD\nabc123\tHEAD'
    expect(extractSymrefTarget(output)).toBe('refs/heads/main')
  })

  it('returns null when there is no ref: line', () => {
    expect(extractSymrefTarget('abc123\tHEAD')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(extractSymrefTarget(null)).toBeNull()
  })
})

describe('buildGithubSourceLink', () => {
  let repoDir: string
  let filePath: string

  beforeEach(() => {
    clearRepoLinkInfoCache()
    repoDir = mkdtempSync(join(tmpdir(), 'source-link-test-'))
    mkdirSync(join(repoDir, '.git'))
    mkdirSync(join(repoDir, 'code', 'ejer8'), { recursive: true })
    filePath = join(repoDir, 'code', 'ejer8', 'File.java')
  })

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true })
  })

  function fakeGit(remote: string | null, symbolicRef: string | null, lsRemote: string | null = null): GitRunner {
    return (args) => {
      if (args[0] === 'remote')
        return remote
      if (args[0] === 'symbolic-ref')
        return symbolicRef
      if (args[0] === 'ls-remote')
        return lsRemote
      return null
    }
  }

  it('builds a line-range link using the auto-detected default branch', () => {
    const url = buildGithubSourceLink(
      filePath,
      { startLine: 9, endLine: 15, isWholeFile: false },
      undefined,
      fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', 'refs/remotes/origin/main'),
    )
    expect(url).toBe('https://github.com/codeurjc/codeurjc-slidev/blob/main/code/ejer8/File.java#L9-L15')
  })

  it('prefers a configured branch over the auto-detected default', () => {
    const url = buildGithubSourceLink(
      filePath,
      { startLine: 9, endLine: 15, isWholeFile: false },
      '2026-fall',
      fakeGit('https://github.com/codeurjc/codeurjc-slidev.git', 'refs/remotes/origin/main'),
    )
    expect(url).toContain('/blob/2026-fall/')
  })

  it('omits the line-range fragment for a whole-file selection', () => {
    const url = buildGithubSourceLink(
      filePath,
      { startLine: 1, endLine: 40, isWholeFile: true },
      undefined,
      fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', 'refs/remotes/origin/main'),
    )
    expect(url).toBe('https://github.com/codeurjc/codeurjc-slidev/blob/main/code/ejer8/File.java')
  })

  it('returns null when there is no origin remote', () => {
    const url = buildGithubSourceLink(
      filePath,
      { startLine: 1, endLine: 1, isWholeFile: false },
      undefined,
      fakeGit(null, null),
    )
    expect(url).toBeNull()
  })

  it('returns null for a non-GitHub remote', () => {
    const url = buildGithubSourceLink(
      filePath,
      { startLine: 1, endLine: 1, isWholeFile: false },
      undefined,
      fakeGit('https://gitlab.com/owner/repo.git', 'refs/remotes/origin/main'),
    )
    expect(url).toBeNull()
  })

  it('returns null when no branch is configured and none can be auto-detected', () => {
    const url = buildGithubSourceLink(
      filePath,
      { startLine: 1, endLine: 1, isWholeFile: false },
      undefined,
      fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', null),
    )
    expect(url).toBeNull()
  })

  it('falls back to asking the remote (ls-remote --symref) when the local origin/HEAD symref is unset', () => {
    // Mirrors a repo set up via `init` + `remote add` + `fetch`/`checkout
    // --track` rather than a real `git clone` -- refs/remotes/origin/HEAD is
    // only ever written by `clone` itself (or an explicit `remote set-head`),
    // so a repo assembled any other way has it missing even though the
    // remote it points at reports its default branch just fine.
    const url = buildGithubSourceLink(
      filePath,
      { startLine: 9, endLine: 15, isWholeFile: false },
      undefined,
      fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', null, 'ref: refs/heads/main\tHEAD\nabc123\tHEAD'),
    )
    expect(url).toBe('https://github.com/codeurjc/codeurjc-slidev/blob/main/code/ejer8/File.java#L9-L15')
  })

  it('prefers the local origin/HEAD symref over asking the remote when both are available', () => {
    const url = buildGithubSourceLink(
      filePath,
      { startLine: 1, endLine: 1, isWholeFile: false },
      undefined,
      fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', 'refs/remotes/origin/main', 'ref: refs/heads/some-other-branch\tHEAD'),
    )
    expect(url).toContain('/blob/main/')
  })

  it('returns null when neither the local symref nor the remote report a default branch', () => {
    const url = buildGithubSourceLink(
      filePath,
      { startLine: 1, endLine: 1, isWholeFile: false },
      undefined,
      fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', null, null),
    )
    expect(url).toBeNull()
  })

  it('returns null when the file has no enclosing git repo', () => {
    const url = buildGithubSourceLink(
      join(tmpdir(), 'definitely-not-a-repo', 'File.java'),
      { startLine: 1, endLine: 1, isWholeFile: false },
      undefined,
      fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', 'refs/remotes/origin/main'),
    )
    expect(url).toBeNull()
  })
})
