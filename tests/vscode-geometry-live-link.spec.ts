import type { Server } from 'node:http'
import type { Page } from './fixtures'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { expect, test } from './fixtures'

// "Inspect Geometry in Preview" end to end: this file is the browser half.
// It owns a real Slidev dev server (the worker's) and a real Chromium page on
// the deck, launches the extension in a real VS Code, and gives the suite
// running inside it (packages/vscode-codeurjc-slidev/test-extension/suite/
// liveLink.test.cjs) the two things only a browser can do -- read the
// preview's state and drag an element in it -- over a small HTTP hook.
//
// Needs a display and a downloaded VS Code, so it runs only when asked for:
// `pnpm test:e2e:vscode` (under `xvfb-run -a` on a headless machine).

const extensionDir = resolve(import.meta.dirname, '..', 'packages', 'vscode-codeurjc-slidev')
const enabled = process.env.CODEURJC_VSCODE_E2E === '1'

// The geometry sits on slide 2 for the same reason as in geometry-inspect:
// slide 1's frontmatter is the deck's headmatter, and Slidev reloads the page
// when that changes.
const DECK = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
---

# Cover

---
geometry:
  content: { x: 31, y: 98, w: 400, h: 424 }
  elements:
    - { id: flow, x: 500, y: 150, w: 400, h: 200 }
    - { id: missing, x: 500, y: 380, w: 200, h: 100 }
---

# Inspect me

\`\`\`mermaid {id: 'flow'}
graph LR
  A --> B
\`\`\`
`

const overlay = '.slidev-page-2 .geometry-image-overlay[data-geometry-entry="elements:0"]'

async function openDeck(page: Page): Promise<void> {
  const deadline = Date.now() + 100000
  for (;;) {
    await page.goto('/2')
    const ok = await page.locator('.slidev-page-2 #flow.geometry-element').waitFor({ state: 'attached', timeout: 8000 }).then(() => true, () => false)
    if (ok)
      break
    if (Date.now() > deadline)
      throw new Error('the live-link fixture never compiled on the dev server')
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(1500)
}

async function dragLeft(page: Page, selector: string, px: number): Promise<void> {
  const box = (await page.locator(selector).boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx - px / 2, cy, { steps: 5 })
  await page.mouse.move(cx - px, cy, { steps: 5 })
  await page.mouse.up()
}

/** What the extension's suite can ask about the preview. */
async function previewState(page: Page) {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    const layout = document.querySelector<HTMLElement>('.slidev-page-2 .slidev-layout')
    if (!el || !layout)
      return { inspected: false, highlighted: 0, x: null }
    const origin = layout.getBoundingClientRect()
    const scale = origin.width / layout.offsetWidth
    return {
      inspected: el.classList.contains('geometry-inspected'),
      highlighted: document.querySelectorAll('.slidev-page-2 .geometry-highlighted').length,
      x: Math.round((el.getBoundingClientRect().left - origin.left) / scale),
    }
  }, overlay)
}

function serveHook(page: Page): Promise<{ server: Server, url: string }> {
  return new Promise((resolveServer) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        let body: unknown = { ok: true }
        if (url.pathname === '/state')
          body = await previewState(page)
        else if (url.pathname === '/reload')
          await openDeck(page)
        else if (url.pathname === '/drag')
          await dragLeft(page, overlay, -Number(url.searchParams.get('dx')))
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
      }
      catch (err) {
        res.statusCode = 500
        res.end(String(err))
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolveServer({ server, url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}` })
    })
  })
}

function runVscode(env: NodeJS.ProcessEnv): Promise<{ code: number | null, output: string }> {
  return new Promise((resolveRun) => {
    const child = spawn('node', ['./test-extension/runTest.mjs'], { cwd: extensionDir, env: { ...process.env, ...env } })
    let output = ''
    child.stdout.on('data', d => output += d)
    child.stderr.on('data', d => output += d)
    child.on('close', code => resolveRun({ code, output }))
  })
}

test.describe('VS Code geometry live link E2E', () => {
  test.describe.configure({ timeout: 300000 })
  test.skip(!enabled, 'set CODEURJC_VSCODE_E2E=1 (pnpm test:e2e:vscode); needs a display and a VS Code download')

  let slidesPath: string
  let originalSlides: string

  test.beforeAll(async ({ workerDeck }) => {
    slidesPath = join(workerDeck.dir, 'slides.md')
    originalSlides = readFileSync(slidesPath, 'utf-8')
    await new Promise(r => setTimeout(r, 2000))
    writeFileSync(slidesPath, DECK, 'utf-8')
    // The extension host runs the built bundle, not the sources.
    execFileSync('node', ['esbuild.js'], { cwd: extensionDir, stdio: 'ignore' })
  })

  test.afterAll(() => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
  })

  test('the extension inspects, highlights and applies drags made in a real preview', async ({ page, baseURL, workerDeck }) => {
    await openDeck(page)
    const hook = await serveHook(page)
    try {
      const { code, output } = await runVscode({
        CODEURJC_EXT_SUITE: 'liveLinkIndex.cjs',
        CODEURJC_EXT_WORKSPACE: workerDeck.dir,
        CODEURJC_TEST_CONTROL: hook.url,
        CODEURJC_TEST_SLIDEV_URL: baseURL!,
      })
      if (code !== 0)
        console.error(output)
      expect(code, 'the extension-host suite failed (its output is above)').toBe(0)
    }
    finally {
      hook.server.close()
    }
  })
})
