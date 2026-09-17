import type { Page } from './fixtures'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'

// Per-slide `geometry` frontmatter (see composables/useSlideGeometry.ts).
// Runs on its own worker-scoped Slidev instance (tests/fixtures.ts), so the
// frontmatter writes exercised by the drag test never race another spec file.

// A 1x1 transparent PNG: images only need a box to measure, and the element
// box (not the object-fit content box) is what `geometry.images` positions.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

const FIXTURE_SLIDES = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
---

# Layout default

Content at the layout's own position

---
geometry:
  content: { x: 31, y: 98, w: 500, h: 424 }
---

# Narrow content

Content narrowed by frontmatter

---
geometry:
  images:
    - { x: 100, y: 120, w: 300, h: 200 }
    - { x: 520, y: 140, w: 200, h: 200 }
---

# Two images

<img class="fx-a" src="${PNG}"> <img class="fx-b" src="${PNG}">

---
geometry:
  images:
    - { x: 600, y: 100, w: 250, h: 250 }
---

# Three images, one entry

<img class="fx-c1" src="${PNG}"> <img class="fx-c2" src="${PNG}"> <img class="fx-c3" src="${PNG}">

---
geometry:
  images:
    - { x: 100, y: 120, w: 300, h: 200 }
---

# Draggable image

<img class="fx-drag" src="${PNG}">

---

# No geometry

<img class="fx-flow-a" src="${PNG}"> <img class="fx-flow-b" src="${PNG}">
`

let slidesPath: string
let deckDir: string
let originalSlides: string

interface Box { x: number, y: number, w: number, h: number }

/** An element's box in slide-canvas pixels, relative to its slide's layout root (undoing the viewport scale). */
async function boxInSlide(page: Page, slide: number, selector: string): Promise<Box> {
  return page.evaluate(([slideNo, sel]) => {
    const root = document.querySelector(`.slidev-page-${slideNo} .slidev-layout.default`) as HTMLElement
    const el = document.querySelector(`.slidev-page-${slideNo} ${sel}`) as HTMLElement
    const rr = root.getBoundingClientRect()
    const scale = rr.width / root.offsetWidth
    const r = el.getBoundingClientRect()
    return { x: (r.left - rr.left) / scale, y: (r.top - rr.top) / scale, w: r.width / scale, h: r.height / scale }
  }, [slide, selector] as const)
}

function expectBox(actual: Box, expected: Partial<Box>) {
  for (const key of Object.keys(expected) as (keyof Box)[])
    expect(Math.abs(actual[key] - expected[key]!), `${key}: ${actual[key]} vs ${expected[key]}`).toBeLessThanOrEqual(1.5)
}

async function openSlide(page: Page, slide: number, readySelector: string) {
  const deadline = Date.now() + 100000
  for (;;) {
    await page.goto(`/${slide}`)
    // The page only renders the slide after the client app boots, so give it
    // a few seconds per attempt rather than checking right after navigation.
    const target = page.locator(`.slidev-page-${slide} ${readySelector}`).first()
    const ready = await target.waitFor({ state: 'attached', timeout: 8000 }).then(() => true, () => false)
    if (ready)
      break
    if (Date.now() > deadline)
      throw new Error('slide-geometry fixture never appeared to compile on the dev server')
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(800)
}

async function openLayoutTab(page: Page) {
  await page.locator('button:has-text("Show editor")').click()
  // Dispatched rather than a pointer click: while the side editor is still
  // settling its width, its header's "Dock to bottom" button can overlap the
  // tab buttons, and a real click would be intercepted.
  const layoutTab = page.locator('button:has-text("Switch to layout tab")')
  await layoutTab.waitFor({ state: 'attached', timeout: 30000 })
  await layoutTab.dispatchEvent('click')
  await page.waitForSelector('.layout-editor-panel', { state: 'visible', timeout: 30000 })
}

test.describe('Slide geometry frontmatter E2E', () => {
  test.describe.configure({ timeout: 150000 })

  test.beforeAll(async ({ workerDeck }) => {
    deckDir = workerDeck.dir
    slidesPath = join(deckDir, 'slides.md')
    originalSlides = readFileSync(slidesPath, 'utf-8')
    await new Promise(r => setTimeout(r, 2000))
    writeFileSync(slidesPath, FIXTURE_SLIDES, 'utf-8')
  })

  test.afterAll(() => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
  })

  test('content geometry applies to its own slide only', async ({ page }) => {
    await openSlide(page, 2, '.content')
    expectBox(await boxInSlide(page, 2, '.content'), { x: 31, y: 98, w: 500 })

    await openSlide(page, 1, '.content')
    // the layout's own saved defaults (see layouts/default.vue's root style)
    expectBox(await boxInSlide(page, 1, '.content'), { x: 31, y: 98, w: 901 })
  })

  test('two entries position two images', async ({ page }) => {
    await openSlide(page, 3, 'img.fx-b')
    await expect(page.locator('.slidev-page-3 img.geometry-image')).toHaveCount(2)
    expectBox(await boxInSlide(page, 3, 'img.fx-a'), { x: 100, y: 120, w: 300, h: 200 })
    expectBox(await boxInSlide(page, 3, 'img.fx-b'), { x: 520, y: 140, w: 200, h: 200 })
  })

  test('one entry positions only the first of three images', async ({ page }) => {
    await openSlide(page, 4, 'img.fx-c3')
    expectBox(await boxInSlide(page, 4, 'img.fx-c1'), { x: 600, y: 100, w: 250, h: 250 })
    for (const cls of ['fx-c2', 'fx-c3']) {
      const img = page.locator(`.slidev-page-4 img.${cls}`)
      await expect(img).not.toHaveClass(/geometry-image/)
      expect(await img.evaluate(el => getComputedStyle(el).position)).toBe('static')
    }
  })

  test('images on a slide without geometry stay in normal flow', async ({ page }) => {
    await openSlide(page, 6, 'img.fx-flow-b')
    for (const cls of ['fx-flow-a', 'fx-flow-b']) {
      const img = page.locator(`.slidev-page-6 img.${cls}`)
      await expect(img).not.toHaveClass(/geometry-image/)
      expect(await img.evaluate(el => getComputedStyle(el).position)).toBe('static')
    }
  })

  test('editor readout matches the declared rect and the rendered box', async ({ page }) => {
    await openSlide(page, 5, 'img.fx-drag')
    await openLayoutTab(page)
    await page.locator('.lep-el').filter({ hasText: 'Image 1 (this slide)' }).click()
    const inputs = page.locator('.lep-props input')
    await expect(inputs.nth(0)).toHaveValue('100')
    await expect(inputs.nth(1)).toHaveValue('120')
    await expect(inputs.nth(2)).toHaveValue('300')
    await expect(inputs.nth(3)).toHaveValue('200')
    expectBox(await boxInSlide(page, 5, '.geometry-image-overlay'), { x: 100, y: 120, w: 300, h: 200 })
    expectBox(await boxInSlide(page, 5, 'img.fx-drag'), { x: 100, y: 120, w: 300, h: 200 })
  })

  test('dragging a positioned image writes its frontmatter, never a layout file', async ({ page }) => {
    await openSlide(page, 5, 'img.fx-drag')
    await openLayoutTab(page)

    const overlay = page.locator('.slidev-page-5 .geometry-image-overlay')
    const box = (await overlay.boundingBox())!
    const scale = await page.evaluate(() => {
      const root = document.querySelector('.slidev-page-5 .slidev-layout.default') as HTMLElement
      return root.getBoundingClientRect().width / root.offsetWidth
    })
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 25 * scale, box.y + box.height / 2, { steps: 5 })
    await page.mouse.move(box.x + box.width / 2 + 50 * scale, box.y + box.height / 2, { steps: 5 })
    await page.mouse.up()

    let lastSeen = ''
    try {
      await expect(async () => {
        lastSeen = readFileSync(slidesPath, 'utf-8')
        // The dragged slide's frontmatter is the last `geometry:` block before
        // its heading, in whatever YAML style Slidev re-serialized it with.
        const headingAt = lastSeen.indexOf('# Draggable image')
        expect(headingAt).toBeGreaterThan(-1)
        const frontmatter = lastSeen.slice(lastSeen.lastIndexOf('geometry:', headingAt), headingAt)
        const x = Number(/\bx:\s*(\d+)/.exec(frontmatter)?.[1])
        expect(x).toBeGreaterThanOrEqual(148)
        expect(x).toBeLessThanOrEqual(152)
      }).toPass({ timeout: 15000 })
    }
    catch (error) {
      console.error(`slides.md at failure:\n${lastSeen}`)
      throw error
    }

    const layoutsDir = join(deckDir, 'layouts')
    expect(existsSync(layoutsDir) ? readdirSync(layoutsDir) : []).toEqual([])
  })
})
