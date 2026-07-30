import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearRepoLinkInfoCache, type GitRunner, type SourceLinkSelection } from 'codeurjc-slidev-theme/composables/useSourceLink'
import { makeResolveSourceLink } from '../sourceLinkDiagnostics'

describe('makeResolveSourceLink', () => {
  let repoDir: string
  let filePath: string
  const selection: SourceLinkSelection = { startLine: 9, endLine: 15, isWholeFile: false }

  beforeEach(() => {
    clearRepoLinkInfoCache()
    repoDir = mkdtempSync(join(tmpdir(), 'source-link-diagnostics-test-'))
    mkdirSync(join(repoDir, '.git'))
    mkdirSync(join(repoDir, 'code'), { recursive: true })
    filePath = join(repoDir, 'code', 'File.java')
  })

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true })
  })

  function fakeGit(remote: string | null, symbolicRef: string | null, lsRemote: string | null = null): GitRunner {
    return (args) => {
      if (args[0] === 'remote') return remote
      if (args[0] === 'symbolic-ref') return symbolicRef
      if (args[0] === 'ls-remote') return lsRemote
      return null
    }
  }

  it('resolves "ok" with the real URL when a GitHub remote and default branch both resolve', () => {
    const resolve = makeResolveSourceLink(fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', 'refs/remotes/origin/main'))
    expect(resolve(filePath, selection, null)).toEqual({
      status: 'ok',
      url: 'https://github.com/codeurjc/codeurjc-slidev/blob/main/code/File.java#L9-L15',
    })
  })

  it('resolves "ok" with a configured branch overriding the auto-detected default', () => {
    const resolve = makeResolveSourceLink(fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', 'refs/remotes/origin/main'))
    expect(resolve(filePath, selection, 'develop')).toEqual({
      status: 'ok',
      url: 'https://github.com/codeurjc/codeurjc-slidev/blob/develop/code/File.java#L9-L15',
    })
  })

  it('resolves "ok" with a whole-file selection suppressing the line fragment', () => {
    const resolve = makeResolveSourceLink(fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', 'refs/remotes/origin/main'))
    expect(resolve(filePath, { startLine: 1, endLine: 1, isWholeFile: true }, null)).toEqual({
      status: 'ok',
      url: 'https://github.com/codeurjc/codeurjc-slidev/blob/main/code/File.java',
    })
  })

  it('resolves "ok" when no default branch resolves but a branch is configured', () => {
    const resolve = makeResolveSourceLink(fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', null, null))
    expect(resolve(filePath, selection, 'develop')).toEqual({
      status: 'ok',
      url: 'https://github.com/codeurjc/codeurjc-slidev/blob/develop/code/File.java#L9-L15',
    })
  })

  it('resolves "no-branch" (with no url) when a GitHub remote resolves but no default branch does, and none is configured', () => {
    const resolve = makeResolveSourceLink(fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', null, null))
    expect(resolve(filePath, selection, null)).toEqual({ status: 'no-branch', url: null })
  })

  it('resolves "no-remote" (with no url) for a non-GitHub remote', () => {
    const resolve = makeResolveSourceLink(fakeGit('https://gitlab.com/owner/repo.git', 'refs/remotes/origin/main'))
    expect(resolve(filePath, selection, null)).toEqual({ status: 'no-remote', url: null })
  })

  it('resolves "no-remote" (with no url) when there is no remote at all', () => {
    const resolve = makeResolveSourceLink(fakeGit(null, null))
    expect(resolve(filePath, selection, null)).toEqual({ status: 'no-remote', url: null })
  })

  it('resolves "no-repo" (with no url) for a file outside any git repository', () => {
    const resolve = makeResolveSourceLink(fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', 'refs/remotes/origin/main'))
    expect(resolve(join(tmpdir(), 'not-a-repo', 'File.java'), selection, null)).toEqual({ status: 'no-repo', url: null })
  })
})
