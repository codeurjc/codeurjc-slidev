// Classifies why a `<<<` import's source link might not resolve, reusing the
// theme's own git-resolution logic verbatim (`resolveRepoLinkInfoCached`).
// Only the "found a repo and a GitHub remote, but couldn't resolve a branch"
// case is worth a diagnostic -- no repo, or a repo with a non-GitHub/no
// remote, are both intentional/expected "no link" states the theme already
// degrades silently for (see design.md).

import { resolveRepoLinkInfoCached, type GitRunner } from 'codeurjc-slidev-theme/composables/useSourceLink'

export type SourceLinkStatus = 'ok' | 'no-repo' | 'no-remote' | 'no-branch'

export type ClassifySourceLink = (absFilePath: string, configuredBranch: string | null) => SourceLinkStatus

/** Builds a `ClassifySourceLink` backed by real git access (or an injected `GitRunner` for tests). */
export function makeClassifySourceLink(git?: GitRunner): ClassifySourceLink {
  return (absFilePath, configuredBranch) => {
    const info = resolveRepoLinkInfoCached(absFilePath, git)
    if (!info) return 'no-repo'
    if (!info.github) return 'no-remote'
    if (!(configuredBranch ?? info.defaultBranch)) return 'no-branch'
    return 'ok'
  }
}
