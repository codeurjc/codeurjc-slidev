import type { Page } from './fixtures'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from './fixtures'

// Callout click steps (`{N}` suffix on inline markers and anchor
// declarations). Runs on its own worker-scoped Slidev instance
// (tests/fixtures.ts) since it drags a callout, which writes to slides.md.

const FIXTURE_SLIDES = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
---

# Steps

\`\`\`java
public class Steps {
  int a = 1; // [!mark] Always here
  int b = 2; // [!mark{1}] Step one
  int c = 3; // [!mark{2}] Step two
  int d = 4; // [!mark{1}] Also step one
}
\`\`\`

---

# Import steps

<<< @/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java[7-22] java
[!mark:2{1}] Anchor step one

---

# After

The next slide
`

const repoRoot = resolve(import.meta.dirname, '..')
const execFileAsync = promisify(execFile)

let slidesPath: string
let originalSlides: string

/** Comments of the callouts inside `scope` that are actually visible (not hidden by a click step). */
async function visibleCallouts(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((sel) => {
    return Array.from(document.querySelectorAll(`${sel} .code-callout`))
      .filter(el => getComputedStyle(el).visibility !== 'hidden')
      .map(el => el.textContent!.trim())
      .sort()
  }, scope)
}

async function openAt(page: Page, path: string, slide: number, callouts: number) {
  const deadline = Date.now() + 100000
  for (;;) {
    await page.goto(path)
    const ready = await page.locator(`.slidev-page-${slide} .code-callout`).nth(callouts - 1).waitFor({ state: 'attached', timeout: 8000 }).then(() => true, () => false)
    if (ready)
      break
    if (Date.now() > deadline)
      throw new Error('callout-click-steps fixture never appeared to compile on the dev server')
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(800)
}

test.describe('Callout click steps E2E', () => {
  test.describe.configure({ timeout: 150000 })

  test.beforeAll(async ({ workerDeck }) => {
    slidesPath = join(workerDeck.dir, 'slides.md')
    originalSlides = readFileSync(slidesPath, 'utf-8')
    await new Promise(r => setTimeout(r, 2000))
    writeFileSync(slidesPath, FIXTURE_SLIDES, 'utf-8')
  })

  test.afterAll(() => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
  })

  test('stepped callouts and highlights reveal on their click and stay', async ({ page }) => {
    await openAt(page, '/1?clicks=0', 1, 4)
    expect(await visibleCallouts(page, '.slidev-page-1')).toEqual(['Always here'])
    await expect(page.locator('.slidev-page-1 [data-highlight-click="2"]').first()).toHaveClass(/step-hidden/)

    await openAt(page, '/1?clicks=1', 1, 4)
    expect(await visibleCallouts(page, '.slidev-page-1')).toEqual(['Also step one', 'Always here', 'Step one'])

    await openAt(page, '/1?clicks=2', 1, 4)
    expect(await visibleCallouts(page, '.slidev-page-1')).toEqual(['Also step one', 'Always here', 'Step one', 'Step two'])
    await expect(page.locator('.slidev-page-1 [data-highlight-click="2"]').first()).not.toHaveClass(/step-hidden/)
  })

  test('callout steps count toward the slide clicks before advancing', async ({ page }) => {
    await openAt(page, '/1', 1, 4)
    for (const expected of ['clicks=1', 'clicks=2']) {
      await page.keyboard.press('ArrowRight')
      await expect(page).toHaveURL(new RegExp(`/1\\?.*${expected}`))
    }
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/\/2(\?|$)/)
  })

  test('revealing a step does not move callouts that are already visible', async ({ page }) => {
    const stepOne = (p: Page) => p.locator('.slidev-page-1 .code-callout', { hasText: 'Step one' }).first().boundingBox()
    await openAt(page, '/1?clicks=1', 1, 4)
    const before = await stepOne(page)
    await openAt(page, '/1?clicks=2', 1, 4)
    const after = await stepOne(page)
    expect(after).toEqual(before)
  })

  test('an anchor-declared step on a snippet import reveals on its click', async ({ page }) => {
    await openAt(page, '/2?clicks=0', 2, 1)
    expect(await visibleCallouts(page, '.slidev-page-2')).toEqual([])
    await openAt(page, '/2?clicks=1', 2, 1)
    expect(await visibleCallouts(page, '.slidev-page-2')).toEqual(['Anchor step one'])
  })

  test('editor mode shows every callout, and dragging one keeps its step', async ({ page }) => {
    await openAt(page, '/1?clicks=0', 1, 4)
    await page.locator('button:has-text("Show editor")').click()
    const layoutTab = page.locator('button:has-text("Switch to layout tab")')
    await layoutTab.waitFor({ state: 'attached', timeout: 30000 })
    await layoutTab.dispatchEvent('click')
    await page.waitForSelector('.layout-editor-panel', { state: 'visible', timeout: 30000 })

    await expect.poll(() => visibleCallouts(page, '.slidev-page-1')).toEqual(['Also step one', 'Always here', 'Step one', 'Step two'])

    const callout = page.locator('.slidev-page-1 .code-callout', { hasText: 'Step two' })
    const box = (await callout.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 15, { steps: 5 })
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 5 })
    await page.mouse.up()

    await expect.poll(() => readFileSync(slidesPath, 'utf-8'), { timeout: 15000 }).toMatch(/int c = 3; \/\/ \[!mark\{2\}@-?\d+,-?\d+\] Step two/)
  })

  test('print with clicks renders each step as its own page with the matching callouts', async ({ page }) => {
    // `/print` itself only exists when Slidev runs in export/build mode; the
    // dev server's browser exporter (`/export`) renders the same per-click
    // print pages `slidev export --with-clicks` captures, with its "with
    // clicks" option initialized from `print=clicks`.
    const deadline = Date.now() + 100000
    for (;;) {
      await page.goto('/export?print=clicks')
      const ready = await page.locator('.print-slide-container .code-callout').first().waitFor({ state: 'attached', timeout: 15000 }).then(() => true, () => false)
      if (ready)
        break
      if (Date.now() > deadline)
        throw new Error('print view never rendered')
    }
    await page.waitForTimeout(3000)

    const perPage = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.print-slide-container'))
        .filter(container => container.textContent?.includes('public class Steps'))
        .map(container => Array.from(container.querySelectorAll('.code-callout'))
          .filter(el => getComputedStyle(el).visibility !== 'hidden')
          .length)
    })
    expect(perPage).toEqual([1, 3, 4])
  })

  test('slidev export --with-clicks writes one page per callout step', async ({ workerDeck }) => {
    // A real CLI export (it boots its own server and drives Chromium through
    // the root `playwright-chromium` devDependency). The per-page callout
    // visibility itself is asserted by the print-with-clicks test above; this
    // pins that the exported artifact has a page for every step.
    test.setTimeout(300000)
    const outDir = mkdtempSync(join(tmpdir(), 'callout-steps-export-'))
    try {
      await execFileAsync(
        'npx',
        ['slidev', 'export', join(workerDeck.dir, 'slides.md'), '--with-clicks', '--format', 'png', '--output', outDir],
        { cwd: repoRoot, timeout: 280000 },
      )
      const files = readdirSync(outDir).filter(f => f.endsWith('.png')).sort()
      // slide 1: steps {1} and {2} -> 3 pages; slide 2: anchor step {1} -> 2 pages; slide 3: no clicks -> 1 page
      expect(files).toEqual(['001-01.png', '001-02.png', '001-03.png', '002-01.png', '002-02.png', '003-01.png'])
      const hashOf = (f: string) => createHash('sha1').update(readFileSync(join(outDir, f))).digest('hex')
      expect(new Set(['001-01.png', '001-02.png', '001-03.png'].map(hashOf)).size).toBe(3)
      expect(hashOf('002-01.png')).not.toBe(hashOf('002-02.png'))
    }
    finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
