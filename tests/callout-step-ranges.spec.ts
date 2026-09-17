import type { Page } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'

// Click-step ranges (`{N-M}`, `{N-}`, `{-M}`) on code-highlight markers and
// slide callouts (composables/stepRange.ts). Runs on its own worker-scoped
// Slidev instance (tests/fixtures.ts), since it drags a callout.

const FIXTURE_SLIDES = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
---

# Walk

\`\`\`java
public class Walk {
  int a = 1; // [!mark{-0}] First
  int b = 2; // [!mark{1-1}] Second
  int c = 3; // [!mark{2}] Third
}
\`\`\`

---

# Range

\`\`\`java
int x = 1; // [!mark{1-2}] Ranged
\`\`\`

---
callouts:
  - at: {x: 200, y: 200}
    text: Early
    step: -1
  - at: {x: 600, y: 300}
    text: Late
    step: 2-
---

# Slide callouts

Text

---

# Drag

\`\`\`java
int y = 2; // [!mark{2-3}] Drag me
\`\`\`
`

let slidesPath: string
let originalSlides: string

/** Comments of the callouts on slide `no` that are visible (not hidden by a step). */
async function visibleCallouts(page: Page, no: number): Promise<string[]> {
  return page.evaluate(sel => Array.from(document.querySelectorAll(`${sel} .code-callout`))
    .filter(el => getComputedStyle(el).visibility !== 'hidden')
    .map(el => el.textContent!.trim())
    .sort(), `.slidev-page-${no}`)
}

async function openAt(page: Page, no: number, clicks: number, readyText: string): Promise<void> {
  const deadline = Date.now() + 100000
  for (;;) {
    await page.goto(`/${no}?clicks=${clicks}`)
    const ready = await page.locator(`.slidev-page-${no} .code-callout`, { hasText: readyText }).first().waitFor({ state: 'attached', timeout: 8000 }).then(() => true, () => false)
    if (ready)
      break
    if (Date.now() > deadline)
      throw new Error('callout-step-ranges fixture never compiled on the dev server')
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(800)
}

async function slidevTotal(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).__slidev__.nav.clicksTotal as number)
}

test.describe('Callout step ranges E2E', () => {
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

  test('a walk-through shows one highlight per click', async ({ page }) => {
    const expected = [['First'], ['Second'], ['Third']]
    for (const [click, callouts] of expected.entries()) {
      await openAt(page, 1, click, 'Third')
      expect(await visibleCallouts(page, 1), `click ${click}`).toEqual(callouts)
    }
    expect(await slidevTotal(page)).toBe(2)
    const hidden = await page.locator('.slidev-page-1 [data-highlight-click="-0"]').first().getAttribute('class')
    expect(hidden).toContain('step-hidden')
  })

  test('walk-through callouts sit beside their own lines instead of stacking', async ({ page }) => {
    await openAt(page, 1, 0, 'Third')
    for (const [range, text] of [['-0', 'First'], ['1-1', 'Second'], ['2', 'Third']]) {
      const line = (await page.locator(`.slidev-page-1 [data-highlight-click="${range}"]`).first().boundingBox())!
      const box = (await page.locator('.slidev-page-1 .code-callout', { hasText: text }).boundingBox())!
      expect(Math.abs(box.y - line.y), `${text} callout next to its line`).toBeLessThan(line.height)
    }
  })

  test('a bounded range disappears after its end and counts that click', async ({ page }) => {
    for (const [click, callouts] of [[0, []], [1, ['Ranged']], [2, ['Ranged']], [3, []]] as const) {
      await openAt(page, 2, click, 'Ranged')
      expect(await visibleCallouts(page, 2), `click ${click}`).toEqual(callouts)
    }
    expect(await slidevTotal(page)).toBe(3)
  })

  test('slide callouts accept step ranges', async ({ page }) => {
    for (const [click, callouts] of [[0, ['Early']], [1, ['Early']], [2, ['Late']]] as const) {
      await openAt(page, 3, click, 'Late')
      expect(await visibleCallouts(page, 3), `click ${click}`).toEqual(callouts)
    }
    expect(await slidevTotal(page)).toBe(2)
  })

  test('dragging a ranged callout keeps its range', async ({ page }) => {
    await openAt(page, 4, 0, 'Drag me')
    await page.locator('button:has-text("Show editor")').click()
    const layoutTab = page.locator('button:has-text("Switch to layout tab")')
    await layoutTab.waitFor({ state: 'attached', timeout: 30000 })
    await layoutTab.dispatchEvent('click')
    await page.waitForSelector('.layout-editor-panel', { state: 'visible', timeout: 30000 })

    const callout = page.locator('.slidev-page-4 .code-callout', { hasText: 'Drag me' })
    await expect.poll(() => visibleCallouts(page, 4)).toEqual(['Drag me'])
    const box = (await callout.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 15, { steps: 5 })
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 5 })
    await page.mouse.up()

    await expect.poll(() => readFileSync(slidesPath, 'utf-8'), { timeout: 15000 }).toMatch(/int y = 2; \/\/ \[!mark\{2-3\}@-?\d+,-?\d+\] Drag me/)
  })

  test('print with clicks shows the walk-through one highlight per page', async ({ page }) => {
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

    const perPage = await page.evaluate(() => Array.from(document.querySelectorAll('.print-slide-container'))
      .filter(container => container.textContent?.includes('public class Walk'))
      .map(container => Array.from(container.querySelectorAll('.code-callout'))
        .filter(el => getComputedStyle(el).visibility !== 'hidden')
        .map(el => el.textContent!.trim())))
    expect(perPage).toEqual([['First'], ['Second'], ['Third']])
  })
})
