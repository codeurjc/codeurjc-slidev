import type { Page } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GROUND_TRUTH_DECK, GROUND_TRUTH_SEGMENTS, GROUND_TRUTH_TOTALS } from '../packages/vscode-codeurjc-slidev/src/__tests__/groundTruthDeck'
import { expect, test } from './fixtures'

// Ground truth for the VS Code extension's click model
// (packages/vscode-codeurjc-slidev/src/clickModel.ts): renders one slide per
// click source in real Slidev and checks each slide's click total and the
// click at which native fence ranges highlight against the expectations the
// model's own unit test (clickModel.groundTruth.spec.ts) asserts. Also covers
// the theme forwarding native ranges on marked fences.

let slidesPath: string
let originalSlides: string

async function openSlide(page: Page, no: number, clicks = 0): Promise<void> {
  const deadline = Date.now() + 100000
  for (;;) {
    await page.goto(`/${no}?clicks=${clicks}`)
    const ready = await page.locator(`.slidev-page-${no}`, { hasText: `GT ${no}` }).first().waitFor({ state: 'attached', timeout: 8000 }).then(() => true, () => false)
    if (ready)
      break
    if (Date.now() > deadline)
      throw new Error('click-model ground-truth deck never compiled on the dev server')
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(600)
}

async function slidevTotal(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).__slidev__.nav.clicksTotal as number)
}

/** Whether the `n`th (1-based) code line of the slide's last ranged code block is highlighted. */
async function lineHighlighted(page: Page, no: number, n: number): Promise<boolean> {
  const line = page.locator(`.slidev-page-${no} .slidev-code`).last().locator('.line').nth(n - 1)
  return (await line.getAttribute('class'))?.includes('highlighted') ?? false
}

test.describe('Click model ground truth E2E', () => {
  test.describe.configure({ timeout: 300000 })

  test.beforeAll(async ({ workerDeck }) => {
    slidesPath = join(workerDeck.dir, 'slides.md')
    originalSlides = readFileSync(slidesPath, 'utf-8')
    await new Promise(r => setTimeout(r, 2000))
    writeFileSync(slidesPath, GROUND_TRUTH_DECK, 'utf-8')
  })

  test.afterAll(() => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
  })

  test('each slide\'s click total matches the expectations', async ({ page }) => {
    const totals: number[] = []
    for (let no = 1; no <= GROUND_TRUTH_TOTALS.length; no++) {
      await openSlide(page, no)
      totals.push(await slidevTotal(page))
    }
    expect(totals).toEqual(GROUND_TRUTH_TOTALS)
  })

  test('native fence ranges highlight at the expected clicks', async ({ page }) => {
    for (const [no, line, click] of GROUND_TRUTH_SEGMENTS) {
      await openSlide(page, no, click - 1)
      expect(await lineHighlighted(page, no, line), `slide ${no} line ${line} before click ${click}`).toBe(false)
      await openSlide(page, no, click)
      expect(await lineHighlighted(page, no, line), `slide ${no} line ${line} at click ${click}`).toBe(true)
    }
  })

  test('a marked fence keeps its native ranges and its marker step', async ({ page }) => {
    const callout = page.locator('.slidev-page-11 .code-callout', { hasText: 'Two' })
    await openSlide(page, 11, 0)
    expect(await lineHighlighted(page, 11, 1)).toBe(true)
    expect(await lineHighlighted(page, 11, 3)).toBe(false)
    await expect(callout).toHaveClass(/step-hidden/)

    await openSlide(page, 11, 1)
    expect(await lineHighlighted(page, 11, 3)).toBe(true)
    await expect(callout).toHaveClass(/step-hidden/)

    await openSlide(page, 11, 2)
    await expect(callout).not.toHaveClass(/step-hidden/)
    expect(await slidevTotal(page)).toBe(2)
  })

  test('a stepped slide callout counts toward the clicks and appears at its step', async ({ page }) => {
    const callout = page.locator('.slidev-page-23 .code-callout', { hasText: 'Stepped callout' })
    await openSlide(page, 23, 1)
    await expect(callout).toHaveClass(/step-hidden/)
    expect(await slidevTotal(page)).toBe(2)

    await openSlide(page, 23, 0)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/\/23\?.*clicks=2/)
    await expect(callout).not.toHaveClass(/step-hidden/)
  })
})
