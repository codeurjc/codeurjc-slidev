import type { Page } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

// Paste presets write the slide's own `geometry` frontmatter (see
// global-top.vue): no layout file, no layout change, no reload.

const e2eDir = resolve(import.meta.dirname, '../e2e')
const slidesPath = resolve(e2eDir, 'slides.md')
const layoutsDir = resolve(e2eDir, 'layouts')
const imagesDir = resolve(import.meta.dirname, '../public/images')

const CANVAS = { w: 980, h: 551.25 }

let originalSlides: string
let originalLayouts: string[]

// A minimal 1x1 transparent PNG, used as the pasted clipboard image.
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

// Presets run on slide 2: slide 1's frontmatter is the deck's headmatter, and
// Slidev reloads the page when that changes.
const HEADMATTER = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
---

# Intro

`

const DECK = `${HEADMATTER}---

# Paste target

Some text
`

const DECK_WITH_GEOMETRY = `${HEADMATTER}---
geometry:
  images:
    - { src: /images/logo.png, x: 600, y: 100, w: 200, h: 120 }
---

# Slide with geometry

Some text

![](/images/logo.png)
`

interface Rect { x: number, y: number, w: number, h: number }
interface GeometryImage extends Rect { src?: string }
interface SlideJson {
  frontmatter: {
    layout?: string
    geometry?: { content?: Rect, images?: GeometryImage[] }
  }
}

function removeGeneratedImages() {
  for (const file of readdirSync(imagesDir)) {
    if (file.startsWith('paste-'))
      rmSync(resolve(imagesDir, file))
  }
}

function layoutFiles(): string[] {
  return existsSync(layoutsDir) ? readdirSync(layoutsDir).sort() : []
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

async function slideJson(page: Page): Promise<SlideJson> {
  return page.evaluate(() => fetch('/__slidev/slides/2.json').then(r => r.json()))
}

async function pastedSrcs(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll('.slidev-page-2 .content-inner img'))
    .map(img => img.getAttribute('data-src') ?? '')
    .filter(src => src.startsWith('/images/paste-')))
}

// An element's box in slide-canvas pixels.
async function boxInSlide(page: Page, selector: string): Promise<Rect> {
  return page.evaluate((sel) => {
    const layout = document.querySelector<HTMLElement>('.slidev-page-2 .slidev-layout')!
    const origin = layout.getBoundingClientRect()
    const scale = origin.width / layout.offsetWidth
    const r = document.querySelector(sel)!.getBoundingClientRect()
    return { x: (r.left - origin.left) / scale, y: (r.top - origin.top) / scale, w: r.width / scale, h: r.height / scale }
  }, selector)
}

async function openDeck(page: Page, deck = DECK) {
  writeFileSync(slidesPath, deck, 'utf-8')
  await new Promise(r => setTimeout(r, 1500))
  await page.goto('/2')
  await page.waitForSelector('.slidev-page-2 .content')
  await page.waitForTimeout(1000)
}

async function pasteAndWaitForPopover(page: Page, filename: string) {
  const before = (await pastedSrcs(page)).length
  await pasteImage(page, filename)
  await expect(page.locator('.image-position-popover')).toBeVisible({ timeout: 10000 })
  await expect.poll(async () => (await pastedSrcs(page)).length, { timeout: 10000 }).toBe(before + 1)
  return (await pastedSrcs(page))[before]
}

test.describe('Image Position E2E', () => {
  test.beforeAll(() => {
    originalSlides = readFileSync(slidesPath, 'utf-8')
    originalLayouts = layoutFiles()
  })

  test.afterEach(async () => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
    // Give the dev server time to reparse the restored fixture before deleting
    // the pasted files it referenced (same settle delay as the image-paste suite).
    await new Promise(r => setTimeout(r, 1500))
    removeGeneratedImages()
  })

  test('"Right" writes geometry without a layout file, a layout change or a reload', async ({ page }) => {
    await openDeck(page)
    await page.evaluate(() => {
      (window as any).__noReload = true
    })

    const src = await pasteAndWaitForPopover(page, 'right.png')
    await page.locator('.image-position-popover button', { hasText: 'Right' }).click()

    await expect.poll(async () => (await slideJson(page)).frontmatter.geometry?.images?.length, { timeout: 10000 }).toBe(1)
    const { frontmatter } = await slideJson(page)
    expect(frontmatter.layout ?? 'default').toBe('default')
    expect(frontmatter.geometry!.images![0].src).toBe(src)
    expect(frontmatter.geometry!.content!.w).toBeLessThan(876)

    const file = readFileSync(slidesPath, 'utf-8')
    expect(file).toContain('geometry:')
    expect(file).toContain(`src: ${src}`)
    expect(file).toMatch(/^layout: default$/m)
    expect(layoutFiles()).toEqual(originalLayouts)

    await expect(page.locator(`.slidev-page-2 img[data-src="${src}"]`)).toHaveClass(/geometry-image/)
    expect(await page.evaluate(() => (window as any).__noReload)).toBe(true)
    // The popover stays open, so the other preset can be tried.
    await expect(page.locator('.image-position-popover')).toBeVisible()
  })

  test('"Below" in the same popover replaces the entry and keeps the image on the slide', async ({ page }) => {
    await openDeck(page)
    const src = await pasteAndWaitForPopover(page, 'below.png')
    const popover = page.locator('.image-position-popover')

    await popover.locator('button', { hasText: 'Right' }).click()
    await expect.poll(async () => (await slideJson(page)).frontmatter.geometry?.content?.w ?? 876, { timeout: 10000 }).toBeLessThan(876)

    await popover.locator('button', { hasText: 'Below' }).click()
    await expect.poll(async () => (await slideJson(page)).frontmatter.geometry?.content?.w, { timeout: 10000 }).toBe(876)

    const images = (await slideJson(page)).frontmatter.geometry!.images!
    expect(images).toHaveLength(1)
    expect(images[0].src).toBe(src)

    await expect(page.locator(`.slidev-page-2 img[data-src="${src}"]`)).toHaveClass(/geometry-image/)
    await expect(async () => {
      const box = await boxInSlide(page, `.slidev-page-2 img[data-src="${src}"]`)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThan(0)
      expect(box.x + box.w).toBeLessThanOrEqual(CANVAS.w + 1)
      expect(box.y + box.h).toBeLessThanOrEqual(CANVAS.h + 1)
    }).toPass({ timeout: 5000 })

    // Dismissing closes the popover.
    await popover.locator('button.dismiss').click()
    await expect(popover).toBeHidden()
  })

  test('pasting onto a slide that already has geometry adds an entry', async ({ page }) => {
    await openDeck(page, DECK_WITH_GEOMETRY)
    await expect(page.locator('.slidev-page-2 img[data-src="/images/logo.png"]')).toHaveClass(/geometry-image/)

    const src = await pasteAndWaitForPopover(page, 'extra.png')
    await page.locator('.image-position-popover button', { hasText: 'Below' }).click()

    await expect.poll(async () => (await slideJson(page)).frontmatter.geometry?.images?.length, { timeout: 10000 }).toBe(2)
    const images = (await slideJson(page)).frontmatter.geometry!.images!
    expect(images[0]).toEqual({ src: '/images/logo.png', x: 600, y: 100, w: 200, h: 120 })
    expect(images[1].src).toBe(src)
  })

  test('two pasted images each get their own entry', async ({ page }) => {
    await openDeck(page)
    const popover = page.locator('.image-position-popover')

    const first = await pasteAndWaitForPopover(page, 'first.png')
    await popover.locator('button', { hasText: 'Right' }).click()
    await expect.poll(async () => (await slideJson(page)).frontmatter.geometry?.images?.length, { timeout: 10000 }).toBe(1)
    await popover.locator('button.dismiss').click()

    const second = await pasteAndWaitForPopover(page, 'second.png')
    await popover.locator('button', { hasText: 'Below' }).click()
    await expect.poll(async () => (await slideJson(page)).frontmatter.geometry?.images?.length, { timeout: 10000 }).toBe(2)

    const srcs = (await slideJson(page)).frontmatter.geometry!.images!.map(image => image.src)
    expect(srcs).toEqual([first, second])
    for (const src of [first, second])
      await expect(page.locator(`.slidev-page-2 img[data-src="${src}"]`)).toHaveClass(/geometry-image/)
  })

  test('a preset chosen with the side editor open survives its autosave', async ({ page }) => {
    await openDeck(page)
    await page.locator('button:has-text("Show editor")').click()
    const textarea = page.locator('[data-editor="content"] textarea')
    await textarea.waitFor()
    await textarea.click()

    const src = await pasteAndWaitForPopover(page, 'editor.png')
    await page.locator('.image-position-popover button', { hasText: 'Right' }).click()
    await expect.poll(async () => (await slideJson(page)).frontmatter.geometry?.images?.length, { timeout: 10000 }).toBe(1)

    // Past the side editor's throttled autosave.
    await page.waitForTimeout(2500)
    const { frontmatter } = await slideJson(page)
    expect(frontmatter.geometry?.images?.[0].src).toBe(src)
    expect(readFileSync(slidesPath, 'utf-8')).toContain(`src: ${src}`)
    await expect(textarea).toHaveValue(new RegExp(`src: ${src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))

    // Editing the textarea afterwards saves the new frontmatter, not the old one.
    await textarea.focus()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' More text')
    await expect.poll(() => readFileSync(slidesPath, 'utf-8'), { timeout: 10000 }).toContain('More text')
    expect(readFileSync(slidesPath, 'utf-8')).toContain(`src: ${src}`)
    expect((await slideJson(page)).frontmatter.geometry?.images?.[0].src).toBe(src)

    await page.locator('button:has-text("Hide editor")').click()
  })
})
