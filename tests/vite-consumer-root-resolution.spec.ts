import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { resolve, join } from 'path'
import type { ViteDevServer } from 'vite'

// Proves the fix for the "consumer-root vs. package-root" path-resolution
// bug: `vite.config.ts`'s save-layout / save-code-highlight-position
// middlewares must write into the *consuming* project's `layouts/`/
// `slides.md`, not wherever `vite.config.ts` itself physically lives (e.g.
// inside node_modules once this ships as an installable theme). Simulates
// that split directly with Vite's own `createServer`, pointing `root` at a
// throwaway directory while loading this repo's real `vite.config.ts`.

const repoRoot = resolve(import.meta.dirname, '..')
const themePkgRoot = resolve(repoRoot, 'packages/codeurjc-slidev-theme')

test.describe('vite.config.ts consumer-root path resolution', () => {
  let consumerRoot: string
  let server: ViteDevServer
  let baseUrl: string

  test.beforeAll(async () => {
    // Deliberately does NOT seed a local `layouts/default.vue` -- exercises
    // the package-to-consumer fallback (a freshly scaffolded consumer has no
    // layout files of its own yet) as well as the root-resolution fix.
    consumerRoot = mkdtempSync(join(tmpdir(), 'codeurjc-slidev-consumer-root-'))
    writeFileSync(
      join(consumerRoot, 'slides.md'),
      '---\nlayout: cover\n---\n\n# Consumer slide\n\n```java\npublic void foo() {} // [!mark@10,20] a comment\n```\n',
    )

    const { createServer } = await import('vite')
    server = await createServer({
      configFile: join(themePkgRoot, 'vite.config.ts'),
      root: consumerRoot,
      server: { port: 0, strictPort: false },
      logLevel: 'silent',
    })
    await server.listen()
    const address = server.httpServer!.address()
    const port = typeof address === 'object' && address ? address.port : 5173
    baseUrl = `http://localhost:${port}`
  })

  test.afterAll(async () => {
    await server?.close()
    rmSync(consumerRoot, { recursive: true, force: true })
  })

  test('save-layout (saveAs) writes into the consumer root, not the package root', async () => {
    const packageLayoutsBefore = readdirSync(join(themePkgRoot, 'layouts'))

    const res = await fetch(`${baseUrl}/api/save-layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentLayout: 'default',
        positions: { title: { x: 10, y: 20, w: 100, h: 30 } },
        hidden: {},
        aspectLocked: {},
        saveAs: true,
        layoutName: 'consumer-root-test',
      }),
    })
    expect(res.status).toBe(200)
    const { layoutName } = await res.json()

    expect(existsSync(join(consumerRoot, 'layouts', `${layoutName}.vue`))).toBe(true)

    const packageLayoutsAfter = readdirSync(join(themePkgRoot, 'layouts'))
    expect(packageLayoutsAfter).toEqual(packageLayoutsBefore)
  })

  test('save-layout (overwrite) falls back to the package template and writes a consumer-local override', async () => {
    // No `layouts/default.vue` in the consumer at all -- this is the
    // freshly-scaffolded-repo case.
    expect(existsSync(join(consumerRoot, 'layouts', 'default.vue'))).toBe(false)

    const res = await fetch(`${baseUrl}/api/save-layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentLayout: 'default',
        positions: { title: { x: 5, y: 5, w: 50, h: 20 } },
        hidden: {},
        aspectLocked: {},
        saveAs: false,
      }),
    })
    expect(res.status).toBe(200)

    expect(existsSync(join(consumerRoot, 'layouts', 'default.vue'))).toBe(true)
    const written = readFileSync(join(consumerRoot, 'layouts', 'default.vue'), 'utf-8')
    expect(written).toContain('--ed-title-y: 5px')
  })

  test('save-code-highlight-position writes into the consumer root, not the package root', async () => {
    const rootSlidesBefore = readFileSync(join(repoRoot, 'slides.md'), 'utf-8')
    const sourceLine = 'public void foo() {} // [!mark@10,20] a comment'

    const res = await fetch(`${baseUrl}/api/save-code-highlight-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceLine, x: 42, y: 99 }),
    })
    expect(res.status).toBe(200)

    const consumerSlides = readFileSync(join(consumerRoot, 'slides.md'), 'utf-8')
    expect(consumerSlides).toContain('[!mark@42,99]')

    const rootSlidesAfter = readFileSync(join(repoRoot, 'slides.md'), 'utf-8')
    expect(rootSlidesAfter).toBe(rootSlidesBefore)
  })
})
