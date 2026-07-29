import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Follows the same temporary-fixture-swap convention as
// tests/code-snippet-import.spec.ts: this suite needs its own multi-slide
// deck to exercise title/subtitle carry-over across several slides, so it
// replaces e2e/slides.md for its run and restores the original in afterAll.
const slidesPath = resolve(import.meta.dirname, '../e2e/slides.md')

let originalSlides: string

const FIXTURE_SLIDES = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
---

# Ejercicios

Slide 1: own title, no subtitle

---

Slide 2: no leading heading, carries the title

---

## Parte 2

Slide 3: carries the title, sets its own subtitle

---
layout: cover
---

# Cover slide

Slide 4: non-default layout, must not break the chain

---

Slide 5: carries title and subtitle, skipping over slide 4

---

#

Slide 6: empty title resets the title chain from here on

---

Slide 7: title still absent (reset), subtitle still carried

---
resetTitle: true
---

# Casos de uso

Slide 8: frontmatter flag resets both chains, then sets its own new title

---

Slide 9: carries the new title, no subtitle
`

test.describe('Slide Title Carryover E2E', () => {
  test.describe.configure({ timeout: 150000 })

  test.beforeAll(async ({ browser }) => {
    originalSlides = readFileSync(slidesPath, 'utf-8')
    await new Promise(r => setTimeout(r, 2000))
    writeFileSync(slidesPath, FIXTURE_SLIDES, 'utf-8')

    // Wait for the dev server to finish recompiling the new fixture before
    // any test navigates. Each Playwright test gets a fresh page/context, so
    // a per-test `page.goto` doesn't itself wait for HMR/full-reparse to
    // catch up -- it happily renders whatever was already compiled
    // (potentially a previous spec file's fixture). It's not enough to poll
    // slide 1 either: `@slidev/parser`'s `parse()` populates `data.slides`
    // slide-by-slide asynchronously, so slide 1 can already reflect the new
    // fixture while slide 2 is still stale (observed empirically). Polling
    // the *last* slide instead only succeeds once the whole reparse -- and
    // therefore every earlier slide too -- has completed.
    const warmupPage = await browser.newPage()
    const deadline = Date.now() + 100000
    for (;;) {
      await warmupPage.goto('/9')
      const text = await warmupPage.locator('.slidev-page-9 h1').innerText().catch(() => null)
      if (text === 'Casos de uso') break
      if (Date.now() > deadline) throw new Error('slide-title-carryover fixture never appeared to compile')
      await warmupPage.waitForTimeout(500)
    }
    await warmupPage.close()
  })

  test.afterAll(() => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
  })

  async function gotoSlide(page: import('@playwright/test').Page, no: number) {
    await page.goto(`/${no}`)
    await page.waitForSelector(`.slidev-page-${no} .content`, { timeout: 100000 })
  }

  test('slide 1 renders its own title and no subtitle', async ({ page }) => {
    await gotoSlide(page, 1)
    await expect(page.locator('.slidev-page-1 h1')).toHaveText('Ejercicios')
    await expect(page.locator('.slidev-page-1 h2')).toHaveCount(0)
  })

  test('slide 2 carries the title forward with no subtitle', async ({ page }) => {
    await gotoSlide(page, 2)
    await expect(page.locator('.slidev-page-2 h1')).toHaveText('Ejercicios')
    await expect(page.locator('.slidev-page-2 h2')).toHaveCount(0)
  })

  test('slide 3 carries the title but sets its own subtitle', async ({ page }) => {
    await gotoSlide(page, 3)
    await expect(page.locator('.slidev-page-3 h1')).toHaveText('Ejercicios')
    await expect(page.locator('.slidev-page-3 h2')).toHaveText('Parte 2')
  })

  test('slide 5 carries title and subtitle across the intervening non-default-layout slide 4', async ({ page }) => {
    await gotoSlide(page, 5)
    await expect(page.locator('.slidev-page-5 h1')).toHaveText('Ejercicios')
    await expect(page.locator('.slidev-page-5 h2')).toHaveText('Parte 2')
  })

  test('slide 6 (empty title) renders no title text but keeps the carried subtitle', async ({ page }) => {
    await gotoSlide(page, 6)
    // The empty `#` marker is kept verbatim (per design), so an <h1> tag
    // exists but is empty -- visually indistinguishable from no title.
    await expect(page.locator('.slidev-page-6 h1')).toHaveText('')
    await expect(page.locator('.slidev-page-6 h2')).toHaveText('Parte 2')
  })

  test('slide 7 still has no title after the reset, subtitle still carried', async ({ page }) => {
    await gotoSlide(page, 7)
    await expect(page.locator('.slidev-page-7 h1')).toHaveCount(0)
    await expect(page.locator('.slidev-page-7 h2')).toHaveText('Parte 2')
  })

  test('slide 8 (resetTitle flag) sets its own new title and has no subtitle', async ({ page }) => {
    await gotoSlide(page, 8)
    await expect(page.locator('.slidev-page-8 h1')).toHaveText('Casos de uso')
    await expect(page.locator('.slidev-page-8 h2')).toHaveCount(0)
  })

  test('slide 9 carries the new title and still has no subtitle', async ({ page }) => {
    await gotoSlide(page, 9)
    await expect(page.locator('.slidev-page-9 h1')).toHaveText('Casos de uso')
    await expect(page.locator('.slidev-page-9 h2')).toHaveCount(0)
  })

  test('the overview page reflects carried titles, not blank entries', async ({ page }) => {
    await page.goto('/overview')
    // Each slide's nav entry is a `.relative` wrapper (the buttons inside
    // are also `.relative`, so scope by the wrapper's distinguishing inline
    // style rather than the bare class) containing the slide-number button
    // and, only when `route.meta.slide.title` is set, a title tooltip div.
    const entries = page.locator('nav .relative[style*="direction: ltr"]')
    await expect(entries).toHaveCount(9, { timeout: 100000 })
    // Slide 2 (index 1) carries "Ejercicios"; slide 9 (index 8) carries "Casos de uso".
    await expect(entries.nth(1).locator('.pointer-events-none')).toHaveText('Ejercicios')
    await expect(entries.nth(8).locator('.pointer-events-none')).toHaveText('Casos de uso')
    // Slide 6 (index 5) has no carried title: the tooltip div isn't rendered at all.
    await expect(entries.nth(5).locator('.pointer-events-none')).toHaveCount(0)
  })
})
