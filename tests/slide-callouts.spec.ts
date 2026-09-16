import type { Page } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'

// Per-slide `callouts` frontmatter (see composables/useSlideCallouts.ts).
// Runs on its own worker-scoped Slidev instance (tests/fixtures.ts) so the
// fixture deck never races another spec file.

// A 1x1 transparent PNG. Its 1:1 ratio inside a 300x200 box is what makes the
// letterboxing assertion below meaningful: `object-fit: contain` renders it
// 200x200, centred, so the picture starts 50px right of the box's own edge.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

const FIXTURE_SLIDES = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
---

# No callouts

A slide that declares none

---
geometry:
  images:
    - { x: 100, y: 120, w: 300, h: 200 }
callouts:
  - at: { image: 0, x: 0, y: 0 }
    text: Esquina de la imagen
    box: { x: 600, y: 300 }
---

# Image callout

<img class="fx-img" src="${PNG}">

---
callouts:
  - at: { x: 480, y: 210 }
---

# Bare arrow

An arrow with nothing to say

---
callouts:
  - at: { x: 290, y: 250 }
    text: Etiqueta
    box: { x: 280, y: 240 }
---

# Label

A box drawn over its own anchor

---
callouts:
  - at: { text: "No existe en esta diapositiva" }
    text: Nunca aparece
---

# Missing anchor

Nothing to point at

---
geometry:
  images:
    - { x: 120, y: 140, w: 300, h: 200 }
---

# Authoring

<img class="fx-new" src="${PNG}">
`

let slidesPath: string
let originalSlides: string

async function openSlide(page: Page, slide: number) {
  const deadline = Date.now() + 100000
  for (;;) {
    await page.goto(`/${slide}`)
    const ready = await page.locator(`.slidev-page-${slide} .content`).first().waitFor({ state: 'attached', timeout: 8000 }).then(() => true, () => false)
    if (ready)
      break
    if (Date.now() > deadline)
      throw new Error('slide-callouts fixture never appeared to compile on the dev server')
    await page.waitForTimeout(1000)
  }
  // Placement runs after mount (and again after fonts settle), so give the
  // callout pass a moment before measuring.
  await page.waitForTimeout(800)
}

async function openLayoutTab(page: Page) {
  await page.locator('button:has-text("Show editor")').click()
  // Dispatched rather than clicked: while the side editor settles its width,
  // its header can overlap the tab buttons and intercept a real click.
  const layoutTab = page.locator('button:has-text("Switch to layout tab")')
  await layoutTab.waitFor({ state: 'attached', timeout: 30000 })
  await layoutTab.dispatchEvent('click')
  await page.waitForSelector('.layout-editor-panel', { state: 'visible', timeout: 30000 })
}

/**
 * The authoring slide's own frontmatter block. Scoped to that slide because an
 * earlier fixture slide also has an `image: 0` anchor, and read style-agnostic
 * because Slidev re-serializes a patched block in its own (block) YAML style.
 */
function authoringFrontmatter(): string {
  const text = readFileSync(slidesPath, 'utf-8')
  const close = text.lastIndexOf('---', text.indexOf('# Authoring'))
  return text.slice(text.lastIndexOf('---', close - 1), close)
}

/** The authoring callout's image-anchor x fraction, if it has one. */
function authoringAnchorX(): string | undefined {
  return /image:\s*0,?\s+x:\s*([\d.]+)/.exec(authoringFrontmatter())?.[1]
}

/** The first point of a connector's path, in slide-canvas pixels. */
function pathStart(d: string): { x: number, y: number } {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  return { x: numbers[0], y: numbers[1] }
}

test.describe('Slide callouts E2E', () => {
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

  test('a slide with no callouts renders none', async ({ page }) => {
    await openSlide(page, 1)
    await expect(page.locator('.slidev-page-1 .code-callout')).toHaveCount(0)
    await expect(page.locator('.slidev-page-1 .code-callout-connector')).toHaveCount(0)
  })

  test('a callout with text renders a box and a connector carrying the arrowhead', async ({ page }) => {
    await openSlide(page, 2)
    const box = page.locator('.slidev-page-2 .code-callout')
    await expect(box).toHaveCount(1)
    await expect(box).toHaveText('Esquina de la imagen')
    const connector = page.locator('.slidev-page-2 .code-callout-connector')
    await expect(connector).toHaveCount(1)
    expect(await connector.getAttribute('marker-start')).toBe('url(#callout-arrowhead)')
  })

  test('an image anchor resolves against the picture, not its geometry box', async ({ page }) => {
    await openSlide(page, 2)
    const d = await page.locator('.slidev-page-2 .code-callout-connector').getAttribute('d')
    // The 1:1 picture is letterboxed inside its 300x200 box at (100, 120), so
    // it renders 200x200 starting at x = 150. Fraction (0, 0) is that corner,
    // not the box's own (100, 120).
    const start = pathStart(d!)
    expect(Math.abs(start.x - 150)).toBeLessThanOrEqual(2)
    expect(Math.abs(start.y - 120)).toBeLessThanOrEqual(2)
  })

  test('a callout with no text renders an arrow and no box', async ({ page }) => {
    await openSlide(page, 3)
    await expect(page.locator('.slidev-page-3 .code-callout')).toHaveCount(0)
    const connector = page.locator('.slidev-page-3 .code-callout-connector')
    await expect(connector).toHaveCount(1)
    const start = pathStart((await connector.getAttribute('d'))!)
    expect(Math.abs(start.x - 480)).toBeLessThanOrEqual(2)
    expect(Math.abs(start.y - 210)).toBeLessThanOrEqual(2)
  })

  test('a box over its own anchor renders a label with no connector', async ({ page }) => {
    await openSlide(page, 4)
    await expect(page.locator('.slidev-page-4 .code-callout')).toHaveText('Etiqueta')
    await expect(page.locator('.slidev-page-4 .code-callout-connector')).toHaveCount(0)
  })

  test('an anchor that resolves to nothing renders nothing', async ({ page }) => {
    await openSlide(page, 5)
    await expect(page.locator('.slidev-page-5 .code-callout')).toHaveCount(0)
    await expect(page.locator('.slidev-page-5 .code-callout-connector')).toHaveCount(0)
  })

  // Runs last: it writes this slide's frontmatter, which afterAll restores.
  test('creates, moves and deletes a callout by pointing at the slide', async ({ page }) => {
    await openSlide(page, 6)
    await openLayoutTab(page)

    // Arm the tool and click the image. The click has to be by coordinate: in
    // editor mode the geometry image overlay covers the picture, so Playwright
    // refuses a locator click as intercepted -- the layout itself hit-tests
    // through the overlays. Opening the side editor also reflows and scrolls
    // the deck, so each attempt re-reads the box and the whole step retries
    // until the pending input actually appears (an unconsumed click leaves the
    // tool armed, so retrying is safe).
    const target = page.locator('.slidev-page-6 img.fx-new')
    const armed = page.locator('.slidev-page-6 .slidev-layout.default.callout-tool-armed')
    const pending = page.locator('.slidev-page-6 .callout-pending-input')
    await target.scrollIntoViewIfNeeded()

    await expect(async () => {
      if (await armed.count() === 0)
        await page.locator('button:has-text("+ Callout")').click()
      // Dispatched on the element itself, with client coordinates taken from
      // its own rect: the deck is scaled and transformed, so a viewport-level
      // mouse click can miss the layout root entirely, and Playwright refuses
      // a locator click because the geometry overlay covers the picture. This
      // is still the real path -- the layout reads clientX/clientY and
      // hit-tests through the overlays.
      await target.evaluate((el) => {
        const r = el.getBoundingClientRect()
        el.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
        }))
      })
      await expect(pending).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 60000 })

    // Driven through the locator rather than raw keystrokes, so the text can't
    // be lost if focus hasn't settled on the input yet.
    await pending.fill('Nueva nota')
    await pending.press('Enter')

    // Clicking an image anchors by fraction of that image, not by pixel.
    await expect.poll(authoringFrontmatter, { timeout: 20000 }).toContain('text: Nueva nota')
    const before = authoringAnchorX()
    expect(before).toBeDefined()

    // Drag the arrow's tip: the anchor keeps its kind and its fractions move.
    const handleLocator = page.locator('.slidev-page-6 .callout-anchor-handle').first()
    await expect(handleLocator).toBeVisible({ timeout: 20000 })
    // Synthetic for the same reason as the placing click: the slide can sit
    // outside the viewport, where real pointer events never reach it. The
    // editor tracks a drag from the mousedown's clientX/Y via window events.
    await handleLocator.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const x = r.x + r.width / 2
      const y = r.y + r.height / 2
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: x - 20, clientY: y }))
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: x - 40, clientY: y }))
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: x - 40, clientY: y }))
    })
    await expect.poll(authoringAnchorX, { timeout: 20000 }).not.toBe(before)

    // Select it, then delete it: the entry leaves the frontmatter.
    // Selecting is a zero-distance drag, which (like any callout drag) pins the
    // box where it was auto-placed; wait for that write so the delete below
    // can't race it.
    const box = page.locator('.slidev-page-6 .code-callout').first()
    await box.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const init = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }
      el.dispatchEvent(new MouseEvent('mousedown', init))
      window.dispatchEvent(new MouseEvent('mouseup', init))
    })
    await expect.poll(authoringFrontmatter, { timeout: 20000 }).toMatch(/box:/)
    // Dispatched straight onto the button: the slide can be outside the
    // viewport, where a real click never reaches it.
    const deleteButton = box.locator('.delete-btn')
    await expect(deleteButton).toBeAttached({ timeout: 10000 })
    await deleteButton.dispatchEvent('mousedown')
    await expect.poll(authoringFrontmatter, { timeout: 20000 }).not.toContain('Nueva nota')
  })

  test('alt+click opens a callout without arming the tool, and Escape discards it unwritten', async ({ page }) => {
    await openSlide(page, 6)
    await openLayoutTab(page)
    const before = authoringFrontmatter()

    const target = page.locator('.slidev-page-6 img.fx-new')
    const pending = page.locator('.slidev-page-6 .callout-pending-input')
    await expect(async () => {
      await target.evaluate((el) => {
        const r = el.getBoundingClientRect()
        el.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          altKey: true,
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
        }))
      })
      await expect(pending).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 60000 })

    // A pending callout is only written on commit, so cancelling leaves the
    // slide's frontmatter exactly as it was.
    await pending.press('Escape')
    await expect(pending).toHaveCount(0)
    await page.waitForTimeout(1000)
    expect(authoringFrontmatter()).toBe(before)
  })
})
