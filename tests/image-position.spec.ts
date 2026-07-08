import { test, expect, type Page } from '@playwright/test'
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { resolve } from 'path'

const e2eDir = resolve(import.meta.dirname, '../e2e')
const slidesPath = resolve(e2eDir, 'slides.md')
const layoutsDir = resolve(e2eDir, 'layouts')
const defaultLayoutPath = resolve(layoutsDir, 'default.vue')
const imagesDir = resolve(import.meta.dirname, '../public/images')

let originalSlides: string
let originalDefaultLayout: string

// A minimal 1x1 transparent PNG, used as the pasted clipboard image.
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function removeGeneratedImages() {
  for (const file of readdirSync(imagesDir)) {
    if (file.startsWith('paste-')) rmSync(resolve(imagesDir, file))
  }
}

function removeForkedLayouts() {
  for (const file of readdirSync(layoutsDir)) {
    if (file.startsWith('layout-')) rmSync(resolve(layoutsDir, file))
  }
}

function forkedLayoutFiles(): string[] {
  return readdirSync(layoutsDir).filter(f => f.startsWith('layout-'))
}

async function pasteImage(page: Page, filename = 'pasted.png') {
  await page.evaluate(async ([base64, name]) => {
    const res = await fetch(`data:image/png;base64,${base64}`)
    const blob = await res.blob()
    const file = new File([blob], name, { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    window.dispatchEvent(evt)
  }, [TINY_PNG_BASE64, filename])
}

test.describe('Image Position E2E', () => {
  test.beforeAll(() => {
    originalSlides = readFileSync(slidesPath, 'utf-8')
    originalDefaultLayout = readFileSync(defaultLayoutPath, 'utf-8')
  })

  test.afterEach(async () => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
    writeFileSync(defaultLayoutPath, originalDefaultLayout, 'utf-8')
    // Give the dev server time to reparse the restored fixtures before
    // deleting generated files, matching the settle delay used by the
    // image-paste suite (avoids a stale compiled module referencing a file
    // the next test/spec file has already removed).
    await new Promise(r => setTimeout(r, 1500))
    removeForkedLayouts()
    removeGeneratedImages()
  })

  test('choosing "Right" positions the image, shrinks content, and forks a new layout without touching the shared one', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.slidev-page-1 .content')
    await page.waitForTimeout(1000)

    await pasteImage(page)

    const popover = page.locator('.image-position-popover')
    await expect(popover).toBeVisible({ timeout: 10000 })

    await popover.locator('button', { hasText: 'Right' }).click()

    await expect(async () => {
      expect(forkedLayoutFiles().length).toBe(1)
    }).toPass({ timeout: 10000 })

    const forked = forkedLayoutFiles()[0]
    const forkedContent = readFileSync(resolve(layoutsDir, forked), 'utf-8')
    expect(forkedContent).toMatch(/--ed-image-w:\s*\d+px/)

    // The shared default layout file itself must be untouched.
    const defaultContentAfter = readFileSync(defaultLayoutPath, 'utf-8')
    expect(defaultContentAfter).toBe(originalDefaultLayout)

    await expect(async () => {
      const slides = readFileSync(slidesPath, 'utf-8')
      expect(slides).toMatch(new RegExp(`layout: ${forked.replace('.vue', '')}`))
    }).toPass({ timeout: 10000 })
  })

  test('choosing "Below" on a second paste reuses the fork made by an earlier "Right" choice', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.slidev-page-1 .content')
    await page.waitForTimeout(1000)

    await pasteImage(page, 'first.png')
    const firstPopover = page.locator('.image-position-popover')
    await expect(firstPopover).toBeVisible({ timeout: 10000 })
    await firstPopover.locator('button', { hasText: 'Right' }).click()

    await expect(async () => {
      expect(forkedLayoutFiles().length).toBe(1)
    }).toPass({ timeout: 10000 })
    const forkedAfterFirst = forkedLayoutFiles()[0]
    const contentAfterRight = readFileSync(resolve(layoutsDir, forkedAfterFirst), 'utf-8')
    const widthAfterRight = Number(contentAfterRight.match(/--ed-content-w:\s*(\d+)px/)?.[1])
    expect(widthAfterRight).toBeLessThan(876)

    // The first fork's frontmatter update triggers a full page reload (see
    // design.md). Pasting again before the reloaded page has fully remounted
    // (and global-top.vue's paste listener re-attached) would silently drop
    // the paste, so retry it a few times rather than relying on one fixed
    // wait -- this mirrors a real, if narrow, risk for actual users too:
    // pasting again immediately after a reload-triggering preset choice.
    await page.waitForSelector('.slidev-page-1 .content', { timeout: 10000 })
    await page.waitForTimeout(1000)

    const secondPopover = page.locator('.image-position-popover')
    for (let attempt = 0; attempt < 5; attempt++) {
      await pasteImage(page, 'second.png')
      try {
        await expect(secondPopover).toBeVisible({ timeout: 3000 })
        break
      } catch {
        if (attempt === 4) throw new Error('second paste never produced a popover after retries')
      }
    }
    await expect(secondPopover).toBeVisible({ timeout: 10000 })
    await secondPopover.locator('button', { hasText: 'Below' }).click()

    await expect(async () => {
      // Still exactly one fork -- the second preset choice updated it in
      // place rather than creating another.
      expect(forkedLayoutFiles().length).toBe(1)
      expect(forkedLayoutFiles()[0]).toBe(forkedAfterFirst)
      const contentAfterBelow = readFileSync(resolve(layoutsDir, forkedAfterFirst), 'utf-8')
      const widthAfterBelow = Number(contentAfterBelow.match(/--ed-content-w:\s*(\d+)px/)?.[1])
      expect(widthAfterBelow).toBe(876)
    }).toPass({ timeout: 10000 })
  })

  test('pasting a second image only tracks the last one', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.slidev-page-1 .content')
    await page.waitForTimeout(1000)

    await pasteImage(page, 'first.png')
    const firstPopover = page.locator('.image-position-popover')
    await expect(firstPopover).toBeVisible({ timeout: 10000 })
    await firstPopover.locator('button.dismiss').click()

    await pasteImage(page, 'second.png')
    const secondPopover = page.locator('.image-position-popover')
    await expect(secondPopover).toBeVisible({ timeout: 10000 })

    const state = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('.content-inner img'))
      return {
        count: imgs.length,
        trackedIndex: imgs.findIndex(img => img.classList.contains('tracked-image')),
      }
    })
    expect(state.count).toBe(2)
    expect(state.trackedIndex).toBe(1)
  })
})
