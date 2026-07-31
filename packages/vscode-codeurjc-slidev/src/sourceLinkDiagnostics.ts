// Resolves a `<<<` import's source link, reusing the theme's own git-resolution
// logic verbatim (`resolveRepoLinkInfoCached`, `buildGithubSourceLink`).
// Answers two related questions about the same file with one git round-trip:
// whether a link resolves at all (only the "found a repo and a GitHub remote,
// but couldn't resolve a branch" case is worth a diagnostic -- no repo, or a
// repo with a non-GitHub/no remote, are both intentional/expected "no link"
// states the theme already degrades silently for, see design.md) and, when it
// does resolve, the actual URL (for hovers and the "Open source" CodeLens).

import type { GitRunner, SourceLinkSelection } from 'codeurjc-slidev-theme/composables/useSourceLink'
import { buildGithubSourceLink, resolveRepoLinkInfoCached } from 'codeurjc-slidev-theme/composables/useSourceLink'

export type SourceLinkStatus = 'ok' | 'no-repo' | 'no-remote' | 'no-branch'

export interface ResolvedSourceLink {
  status: SourceLinkStatus
  /** The resolved URL when `status` is `'ok'`, else null. */
  url: string | null
}

export type ResolveSourceLink = (absFilePath: string, selection: SourceLinkSelection, configuredBranch: string | null) => ResolvedSourceLink

/** Builds a `ResolveSourceLink` backed by real git access (or an injected `GitRunner` for tests). */
export function makeResolveSourceLink(git?: GitRunner): ResolveSourceLink {
  return (absFilePath, selection, configuredBranch) => {
    const info = resolveRepoLinkInfoCached(absFilePath, git)
    if (!info)
      return { status: 'no-repo', url: null }
    if (!info.github)
      return { status: 'no-remote', url: null }
    if (!(configuredBranch ?? info.defaultBranch))
      return { status: 'no-branch', url: null }
    // Re-resolves via `resolveRepoLinkInfoCached` internally, but that's a
    // process-lifetime cache hit per repo root, not a second real git call.
    return { status: 'ok', url: buildGithubSourceLink(absFilePath, selection, configuredBranch, git) }
  }
}
