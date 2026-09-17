import type { Page } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'

// Image references by src (composables/useImageRefs.ts): `geometry.images`
// entries and callout `image` anchors naming a picture by the src the author
// wrote, which survives other images being inserted; positional references
// migrating to src on the next editor write; `#N` for a repeated picture.
// Runs on its own worker-scoped Slidev instance.

const FIXTURE_SLIDES = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
---

# References

---
geometry:
  images:
    - { src: /images/logo.png, x: 600, y: 120, w: 300, h: 200 }
callouts:
  - at: { image: /images/logo.png, x: 0.5, y: 0.5 }
    text: Centro del logo
    box: { x: 120, y: 400 }
---

# Keyed

<img class="fx-urjc" src="/images/URJC.jpg" style="width: 120px">

![logo](/images/logo.png)

---
geometry:
  images:
    - { x: 100, y: 120, w: 300, h: 200 }
    - { x: 600, y: 120, w: 300, h: 200 }
callouts:
  - at: { image: 1, x: 0.5, y: 0.5 }
    text: Punto
    box: { x: 120, y: 400 }
---

# Migrate

<img class="fx-a" src="/images/URJC.jpg">

<img class="fx-b" src="/images/logo.png">

---
geometry:
  images:
    - { src: /images/logo.png#1, x: 100, y: 150, w: 300, h: 200 }
    - { src: /images/logo.png#2, x: 600, y: 150, w: 300, h: 200 }
---

# Repeated

<img class="fx-l1" src="/images/logo.png">

<img class="fx-l2" src="/images/logo.png">

---
geometry:
  images:
    - { src: /images/gone.png, x: 600, y: 120, w: 300, h: 200 }
---

# Gone

<img class="fx-g" src="/images/logo.png" style="width: 120px">
`

let slidesPath: string
let originalSlides: string

interface Box { x: number, y: number, w: number, h: number }

async function openSlide(page: Page, slide: number, readySelector: string) {
  const deadline = Date.now() + 100000
  for (;;) {
    await page.goto(`/${slide}`)
    const ready = await page.locator(`.slidev-page-${slide} ${readySelector}`).first().waitFor({ state: 'attached', timeout: 8000 }).then(() => true, () => false)
    if (ready)
      break
    if (Date.now() > deadline)
      throw new Error('slide-image-references fixture never appeared to compile on the dev server')
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(800)
}

async function openLayoutTab(page: Page) {
  await page.locator('button:has-text("Show editor")').click()
  const layoutTab = page.locator('button:has-text("Switch to layout tab")')
  await layoutTab.waitFor({ state: 'attached', timeout: 30000 })
  await layoutTab.dispatchEvent('click')
  await page.waitForSelector('.layout-editor-panel', { state: 'visible', timeout: 30000 })
}

/** An element's box in slide-canvas pixels. */
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

/** The frontmatter block of the slide whose heading is `heading`. */
function frontmatterOf(heading: string): string {
  const text = readFileSync(slidesPath, 'utf-8')
  const close = text.lastIndexOf('---', text.indexOf(`# ${heading}`))
  return text.slice(text.lastIndexOf('---', close - 1), close)
}

/** The first point of a connector's path, in slide-canvas pixels. */
function pathStart(d: string): { x: number, y: number } {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  return { x: numbers[0], y: numbers[1] }
}

function inside(point: { x: number, y: number }, box: Box): boolean {
  return point.x >= box.x - 1 && point.x <= box.x + box.w + 1 && point.y >= box.y - 1 && point.y <= box.y + box.h + 1
}

test.describe('Image references by src E2E', () => {
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

  test('a src entry and a src anchor apply to their picture, not by position', async ({ page }) => {
    await openSlide(page, 2, 'img[alt="logo"]')
    await expect(page.locator('.slidev-page-2 img[alt="logo"]')).toHaveAttribute('data-src', '/images/logo.png')
    const logo = await boxInSlide(page, 2, 'img[alt="logo"]')
    expect(Math.abs(logo.x - 600)).toBeLessThanOrEqual(1.5)
    expect(Math.abs(logo.y - 120)).toBeLessThanOrEqual(1.5)
    await expect(page.locator('.slidev-page-2 img.fx-urjc')).not.toHaveClass(/geometry-image/)
    const start = pathStart((await page.locator('.slidev-page-2 .code-callout-connector').getAttribute('d'))!)
    expect(inside(start, logo)).toBe(true)
  })

  test('a repeated picture is told apart by #N', async ({ page }) => {
    await openSlide(page, 4, 'img.fx-l2')
    const second = await boxInSlide(page, 4, 'img.fx-l2')
    expect(Math.abs(second.x - 600)).toBeLessThanOrEqual(1.5)
    const first = await boxInSlide(page, 4, 'img.fx-l1')
    expect(Math.abs(first.x - 100)).toBeLessThanOrEqual(1.5)
  })

  test('an unresolvable src warns and leaves the image in normal flow', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning')
        warnings.push(msg.text())
    })
    await openSlide(page, 5, 'img.fx-g')
    await expect(page.locator('.slidev-page-5 img.fx-g')).not.toHaveClass(/geometry-image/)
    expect(warnings.some(w => w.includes('no image with src "/images/gone.png"'))).toBe(true)
  })

  test('alt+clicking the second of two identical pictures writes a #2 anchor', async ({ page }) => {
    await openSlide(page, 4, 'img.fx-l2')
    await openLayoutTab(page)
    const pending = page.locator('.slidev-page-4 .callout-pending-input')
    const target = page.locator('.slidev-page-4 img.fx-l2')
    await expect(async () => {
      await target.evaluate((el) => {
        const r = el.getBoundingClientRect()
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, altKey: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }))
      })
      await expect(pending).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 60000 })
    await pending.fill('Segundo')
    await pending.press('Enter')
    await expect.poll(() => frontmatterOf('Repeated'), { timeout: 20000 }).toMatch(/image:\s*\/images\/logo\.png#2/)
  })

  test('editing positional entries migrates them to src references', async ({ page }) => {
    await openSlide(page, 3, 'img.fx-b')
    await openLayoutTab(page)

    // A geometry drag rewrites both image entries by src.
    const overlay = page.locator('.slidev-page-3 .geometry-image-overlay').nth(1)
    await overlay.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const x = r.x + r.width / 2
      const y = r.y + r.height / 2
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: x + 10, clientY: y }))
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: x + 20, clientY: y }))
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: x + 20, clientY: y }))
    })
    await expect.poll(() => frontmatterOf('Migrate'), { timeout: 20000 }).toMatch(/src:\s*\/images\/logo\.png/)
    expect(frontmatterOf('Migrate')).toMatch(/src:\s*\/images\/URJC\.jpg/)

    // Moving the callout's box rewrites its positional image anchor by src.
    const box = page.locator('.slidev-page-3 .code-callout').first()
    await box.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const x = r.x + r.width / 2
      const y = r.y + r.height / 2
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: x + 15, clientY: y }))
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: x + 15, clientY: y }))
    })
    await expect.poll(() => frontmatterOf('Migrate'), { timeout: 20000 }).toMatch(/image:\s*\/images\/logo\.png\b/)
  })

  // Runs last: it rewrites the deck.
  test('inserting an image before a src-keyed one moves neither its geometry nor its callout', async ({ page }) => {
    // Let earlier tests' debounced frontmatter saves land first: Slidev writes
    // them from its in-memory deck, which would drop an edit made meanwhile.
    await page.waitForTimeout(2500)
    writeFileSync(slidesPath, FIXTURE_SLIDES.replace('![logo](/images/logo.png)', '<img class="fx-inserted" src="/images/URJC.jpg" style="width: 80px">\n\n![logo](/images/logo.png)'))
    await openSlide(page, 2, 'img.fx-inserted')
    const logo = await boxInSlide(page, 2, 'img[alt="logo"]')
    expect(Math.abs(logo.x - 600)).toBeLessThanOrEqual(1.5)
    await expect(page.locator('.slidev-page-2 img.fx-inserted')).not.toHaveClass(/geometry-image/)
    const start = pathStart((await page.locator('.slidev-page-2 .code-callout-connector').getAttribute('d'))!)
    expect(inside(start, logo)).toBe(true)
  })
})
