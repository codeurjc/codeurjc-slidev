import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Follows the same temporary-fixture-swap convention as
// tests/code-highlight-callouts.spec.ts: this suite needs its own slide
// content (a real `<<<` import against e2e/code, a symlink to the repo's
// own code/ directory), so it replaces e2e/slides.md for its run and
// restores the original in afterAll. Both the in-root and out-of-root
// imports live on the single slide (rather than a second slide) since
// navigating to a second route immediately after a fixture swap proved
// unreliable once other suites' fixture swaps had already run against the
// same long-lived dev server in the full e2e run -- slide 1 alone avoids
// that route/HMR interaction entirely.
const slidesPath = resolve(import.meta.dirname, '../e2e/slides.md')

let originalSlides: string

const FIXTURE_SLIDES = `---
layout: default
colorSchema: light
aspectRatio: 16/9
---

# Snippet import

<<< @/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java[7-22] java
[!mark:"public GestorNotas(DBAlumno alumnos)"] Injects the DB dependency
[!mark:"float suma = 0.0f;".."return suma / notas.size();"] Sums up the notes

<<< @/vite.config.ts ts notitle
`

async function waitForFixture(page: import('@playwright/test').Page) {
  const deadline = Date.now() + 100000
  for (;;) {
    const ready = await page.locator('.slidev-page-1 pre').count().then(c => c >= 2).catch(() => false)
    if (ready) return
    if (Date.now() > deadline) throw new Error('code-snippet-import fixture never appeared to compile on the dev server')
    await page.reload().catch(() => {})
    await page.waitForTimeout(1000)
  }
}

test.describe('Code Snippet Import E2E', () => {
  test.describe.configure({ timeout: 150000 })

  test.beforeAll(async () => {
    originalSlides = readFileSync(slidesPath, 'utf-8')
    await new Promise(r => setTimeout(r, 2000))
    writeFileSync(slidesPath, FIXTURE_SLIDES, 'utf-8')
  })

  test.afterAll(() => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/1')
    await page.waitForSelector('.slidev-page-1 .content')
    await waitForFixture(page)
  })

  test('renders the sliced file contents with highlights and callouts, no leaked syntax', async ({ page }) => {
    const codeText = await page.locator('.slidev-page-1 pre:visible').first().innerText()
    expect(codeText).not.toContain('<<<')
    expect(codeText).not.toContain('[!mark')
    expect(codeText).toContain('public GestorNotas(DBAlumno alumnos)')
    // Sliced to lines 7-22: the package/import lines above are not shown
    expect(codeText).not.toContain('package es.codeurjc.test.gestor;')

    const callouts = page.locator('.slidev-page-1 .code-callout:visible')
    await expect(callouts).toHaveCount(2)
    await expect(page.locator('.slidev-page-1 .code-callout:visible', { hasText: 'Injects the DB dependency' })).toBeVisible()
    await expect(page.locator('.slidev-page-1 .code-callout:visible', { hasText: 'Sums up the notes' })).toBeVisible()
  })

  test('the referenced file on disk is never modified', async () => {
    const before = readFileSync(resolve(import.meta.dirname, '../code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java'), 'utf-8')
    expect(before).not.toContain('[!mark')
    expect(before).not.toContain('SLIDEV_ANCHOR')
  })

  test('an import outside the code root still renders (warning is server-side, not a failure)', async ({ page }) => {
    // The code-root guard only warns (see composables/__tests__/useSnippetImport.spec.ts's
    // isWithinCodeRoot coverage for the actual logic); it must never block rendering.
    const codeText = await page.locator('.slidev-page-1 pre:visible').nth(1).innerText()
    expect(codeText.length).toBeGreaterThan(0)
    expect(codeText).not.toContain('<<<')
  })

  test('shows a title bar with the imported file\'s basename', async ({ page }) => {
    const wrapper = page.locator('.slidev-page-1 .slidev-code-wrapper:visible').first()
    await expect(wrapper.locator('.slidev-code-block-title')).toHaveText('GestorNotas.java')
  })

  test('notitle suppresses the title bar', async ({ page }) => {
    const wrapper = page.locator('.slidev-page-1 .slidev-code-wrapper:visible').nth(1)
    await expect(wrapper.locator('.slidev-code-block-title')).toHaveCount(0)
  })

  test('dragging a callout on an anchor-produced highlight persists its position', async ({ page }) => {
    await page.locator('button:has-text("Show editor")').click()
    await page.locator('button:has-text("Switch to layout tab")').click()
    await page.waitForTimeout(300)

    const callout = page.locator('.slidev-page-1 .code-callout:visible', { hasText: 'Injects the DB dependency' })
    const box = await callout.boundingBox()
    expect(box).toBeTruthy()
    if (!box) return

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 10 })
    await page.mouse.up()

    await page.waitForTimeout(500)
    const updated = readFileSync(slidesPath, 'utf-8')
    expect(updated).toMatch(/\[!mark:"public GestorNotas\(DBAlumno alumnos\)"@-?\d+,-?\d+\]/)
  })
})
