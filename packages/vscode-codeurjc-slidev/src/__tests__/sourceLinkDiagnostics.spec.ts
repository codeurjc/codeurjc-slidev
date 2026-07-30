import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearRepoLinkInfoCache, type GitRunner } from 'codeurjc-slidev-theme/composables/useSourceLink'
import { makeClassifySourceLink } from '../sourceLinkDiagnostics'

describe('makeClassifySourceLink', () => {
  let repoDir: string
  let filePath: string

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

  it('returns "ok" when a GitHub remote and default branch both resolve', () => {
    const classify = makeClassifySourceLink(fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', 'refs/remotes/origin/main'))
    expect(classify(filePath, null)).toBe('ok')
  })

  it('returns "ok" when no default branch resolves but a branch is configured', () => {
    const classify = makeClassifySourceLink(fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', null, null))
    expect(classify(filePath, 'develop')).toBe('ok')
  })

  it('returns "no-branch" when a GitHub remote resolves but no default branch does, and none is configured', () => {
    const classify = makeClassifySourceLink(fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', null, null))
    expect(classify(filePath, null)).toBe('no-branch')
  })

  it('returns "no-remote" for a non-GitHub remote', () => {
    const classify = makeClassifySourceLink(fakeGit('https://gitlab.com/owner/repo.git', 'refs/remotes/origin/main'))
    expect(classify(filePath, null)).toBe('no-remote')
  })

  it('returns "no-remote" when there is no remote at all', () => {
    const classify = makeClassifySourceLink(fakeGit(null, null))
    expect(classify(filePath, null)).toBe('no-remote')
  })

  it('returns "no-repo" for a file outside any git repository', () => {
    const classify = makeClassifySourceLink(fakeGit('git@github.com:codeurjc/codeurjc-slidev.git', 'refs/remotes/origin/main'))
    expect(classify(join(tmpdir(), 'not-a-repo', 'File.java'), null)).toBe('no-repo')
  })
})
