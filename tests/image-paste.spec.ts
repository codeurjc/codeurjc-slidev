import { test, expect, type Page } from '@playwright/test'
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'fs'
import { resolve } from 'path'

const e2eDir = resolve(import.meta.dirname, '../e2e')
const slidesPath = resolve(e2eDir, 'slides.md')
const imagesDir = resolve(import.meta.dirname, '../public/images')

let originalSlides: string

// A minimal 1x1 transparent PNG, used as the pasted clipboard image.
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function removeGeneratedImages() {
  for (const file of readdirSync(imagesDir)) {
    if (file.startsWith('paste-')) rmSync(resolve(imagesDir, file))
  }
}

// Simulates a clipboard image paste via a synthetic ClipboardEvent + DataTransfer,
// dispatched on window (where the global paste listener lives) rather than going
// through the real OS clipboard, avoiding Playwright clipboard-permission setup.
async function pasteImage(page: Page) {
  await page.evaluate(async (base64) => {
    const res = await fetch(`data:image/png;base64,${base64}`)
    const blob = await res.blob()
    const file = new File([blob], 'pasted.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    window.dispatchEvent(evt)
  }, TINY_PNG_BASE64)
}

test.describe('Image Paste E2E', () => {
  test.beforeAll(() => {
    originalSlides = readFileSync(slidesPath, 'utf-8')
  })

  test.afterAll(async () => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
    // Give the dev server time to reparse the restored fixture and invalidate
    // its compiled slide module before deleting the pasted image files below.
    // Otherwise a subsequent spec file's fresh page load (same long-lived
    // webServer, no restart between files) can still hit a not-yet-invalidated
    // module that references an image we're about to remove.
    await new Promise(resolve => setTimeout(resolve, 1500))
    removeGeneratedImages()
  })

  test('pastes an image into the markdown when the side editor is open', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.slidev-page-1 .content')
    await page.waitForTimeout(1000)
    await page.locator('button:has-text("Show editor")').click()

    const textarea = page.locator('[data-editor="content"] textarea')
    await textarea.waitFor()
    await textarea.click()

    await pasteImage(page)

    await expect(async () => {
      const value = await textarea.inputValue()
      expect(value).toMatch(/!\[\]\(\/images\/paste-\d+\.png\)/)
    }).toPass({ timeout: 10000 })

    // The autosave pipeline is throttled, so wait for it to flush to disk.
    await expect(async () => {
      const content = readFileSync(slidesPath, 'utf-8')
      expect(content).toMatch(/!\[\]\(\/images\/paste-\d+\.png\)/)
    }).toPass({ timeout: 10000 })
  })

  test('pastes an image into the markdown when the side editor is closed', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.slidev-page-1 .content')
    await page.waitForTimeout(1000)

    // A fresh browser context defaults to the editor being closed; only close
    // it explicitly if a previous run in this context left it open.
    const hideBtn = page.locator('button:has-text("Hide editor")')
    if (await hideBtn.count()) await hideBtn.click()

    await pasteImage(page)

    await expect(async () => {
      const content = readFileSync(slidesPath, 'utf-8')
      expect(content).toMatch(/!\[\]\(\/images\/paste-\d+\.png\)/)
    }).toPass({ timeout: 10000 })
  })
})
