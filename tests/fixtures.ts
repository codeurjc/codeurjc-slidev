import type { Page } from '@playwright/test'
import type { ViteDevServer } from 'vite'
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test as base } from '@playwright/test'
import { createServer, parser, resolveOptions } from '@slidev/cli'

// Gives each Playwright worker its own Slidev dev server + its own copy of
// the e2e/ fixture directory, so worker-isolated spec files never race on
// e2e/slides.md or a shared port the way the rest of tests/ still does (see
// playwright.config.ts's `legacy` project). Each worker dir sits directly
// under the repo root at the same depth as e2e/ itself (NOT nested inside a
// shared `.e2e-workers/` parent) -- tests/code-snippet-import.spec.ts
// imports `@/../packages/...` on purpose to exercise the code-root-escape
// warning path, and Slidev's `@/` alias resolves relative to the entry's
// own dir, so one extra directory level of nesting silently breaks that
// import.
const repoRoot = resolve(import.meta.dirname, '..')
const e2eDir = resolve(repoRoot, 'e2e')

interface WorkerDeck {
  dir: string
  baseURL: string
}

function relink(target: string, dir: string, name: string) {
  const linkPath = join(dir, name)
  if (existsSync(linkPath))
    return
  symlinkSync(target, linkPath, 'dir')
}

export const test = base.extend<{}, { workerDeck: WorkerDeck }>({
  workerDeck: [async ({}, use, workerInfo) => {
    const dir = resolve(repoRoot, `.e2e-worker-${workerInfo.workerIndex}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    cpSync(join(e2eDir, 'slides.md'), join(dir, 'slides.md'))
    relink(resolve(repoRoot, 'code'), dir, 'code')
    relink(resolve(repoRoot, 'public'), dir, 'public')

    const options = await resolveOptions({ entry: join(dir, 'slides.md') }, 'dev')
    // createServer only reloads slide data on file change if given a
    // `loadData` hook (its internal `handleHotUpdate` no-ops without one --
    // see @slidev/cli's own dev-command wiring in its `cli.mjs`, which is
    // the only place this hook is otherwise documented). Theme/config never
    // change across a single worker's fixture swaps here, so this is a
    // trimmed version of that hook without the restart-on-theme/config/
    // feature-change branches.
    const server: ViteDevServer = await createServer(options, {
      server: { port: 0, strictPort: false, host: 'localhost' },
      logLevel: 'silent',
    }, {
      async loadData(loadedSource) {
        const loaded = await parser.load(options, options.entry, loadedSource, 'dev')
        return {
          ...loaded,
          themeMeta: options.data.themeMeta,
          config: parser.resolveConfig(loaded.headmatter, options.data.themeMeta, options.entry),
        }
      },
    })
    await server.listen()
    const address = server.httpServer!.address()
    const port = typeof address === 'object' && address ? address.port : 3030
    const baseURL = `http://localhost:${port}`

    await use({ dir, baseURL })

    await server.close()
    rmSync(dir, { recursive: true, force: true })
  }, { scope: 'worker' }],

  baseURL: async ({ workerDeck }, use) => {
    await use(workerDeck.baseURL)
  },
})

export { expect } from '@playwright/test'
export type { Page }
