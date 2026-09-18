import type { Page } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from './fixtures'

// The controller channel (composables/useInspectProtocol.ts): an external
// controller -- here, this test process, standing in for the VS Code
// extension -- attaches to the dev server's event stream and POSTs commands.
// Inspection outlines every geometry entry over the real render (and implies
// editor mode); controlled mode turns drags into events instead of
// frontmatter writes. Runs on its own worker-scoped Slidev instance.

const FENCE = '```'
// The geometry sits on slide 2: slide 1's frontmatter is the deck's
// headmatter, and Slidev reloads the whole page when that changes, which
// would reset the page's controller state mid-test.
const DECK = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
---

# Cover

---
geometry:
  content: { x: 31, y: 98, w: 400, h: 424 }
  elements:
    - { id: flow, x: 500, y: 150, w: 400, h: 200 }
    - { id: missing, x: 500, y: 380, w: 200, h: 100 }
---

# Inspect me

${FENCE}mermaid {id: 'flow'}
graph LR
  A --> B
${FENCE}
`

let slidesPath: string
let originalSlides: string

interface Controller {
  events: Record<string, unknown>[]
  close: () => void
}

/** Attaches to the dev server's event stream, collecting every event it sends. */
async function attach(baseURL: string): Promise<Controller> {
  const abort = new AbortController()
  const res = await fetch(`${baseURL}/api/geometry-inspect/events`, { signal: abort.signal })
  const events: Record<string, unknown>[] = []
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done)
          return
        buffer += decoder.decode(value, { stream: true })
        let at = buffer.indexOf('\n\n')
        while (at >= 0) {
          const chunk = buffer.slice(0, at)
          buffer = buffer.slice(at + 2)
          const data = chunk.split('\n').find(l => l.startsWith('data: '))
          if (data)
            events.push(JSON.parse(data.slice(6)))
          at = buffer.indexOf('\n\n')
        }
      }
    }
    catch {
      // aborted
    }
  })()
  return { events, close: () => abort.abort() }
}

async function command(baseURL: string, body: unknown): Promise<void> {
  const res = await fetch(`${baseURL}/api/geometry-inspect`, { method: 'POST', body: JSON.stringify(body) })
  expect(res.status).toBe(200)
}

async function openDeck(page: Page): Promise<void> {
  const deadline = Date.now() + 100000
  for (;;) {
    await page.goto('/2')
    const ok = await page.locator('.slidev-page-2 #flow.geometry-element').waitFor({ state: 'attached', timeout: 8000 }).then(() => true, () => false)
    if (ok)
      break
    if (Date.now() > deadline)
      throw new Error('geometry-inspect fixture never compiled on the dev server')
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(1500)
}

/** The rendered box of `selector` on slide 2, in slide-canvas pixels. */
async function boxInSlide(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const layout = document.querySelector<HTMLElement>('.slidev-page-2 .slidev-layout')!
    const origin = layout.getBoundingClientRect()
    const scale = origin.width / layout.offsetWidth
    const r = document.querySelector(`.slidev-page-2 ${sel}`)!.getBoundingClientRect()
    return { x: Math.round((r.left - origin.left) / scale), y: Math.round((r.top - origin.top) / scale), w: Math.round(r.width / scale), h: Math.round(r.height / scale) }
  }, selector)
}

async function dragLeft(page: Page, selector: string, px: number): Promise<void> {
  const box = (await page.locator(selector).boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx - px / 2, cy, { steps: 5 })
  await page.mouse.move(cx - px, cy, { steps: 5 })
  await page.mouse.up()
}

const overlay = (entry: string) => `.slidev-page-2 .geometry-image-overlay[data-geometry-entry="${entry}"]`

test.describe('Geometry inspection E2E', () => {
  test.describe.configure({ timeout: 150000 })

  test.beforeAll(async ({ workerDeck }) => {
    slidesPath = join(workerDeck.dir, 'slides.md')
    originalSlides = readFileSync(slidesPath, 'utf-8')
    await new Promise(r => setTimeout(r, 2000))
    writeFileSync(slidesPath, DECK, 'utf-8')
  })

  test.afterAll(() => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
  })

  test('inspection outlines resolved and unresolved entries, highlights one, and leaves the slide unchanged', async ({ page, baseURL, workerDeck }) => {
    // Attach before any page is open: the stream must open without waiting
    // for a page to send something, and a page loading afterwards still
    // announces its deck (it asks the server to replay the state).
    const controller = await attach(baseURL!)
    try {
      await openDeck(page)
      const before = await boxInSlide(page, '#flow')
      await expect(page.locator(overlay('elements:0'))).toHaveCount(0)

      // The page answers which deck it shows.
      await expect.poll(() => controller.events.find(e => e.type === 'deck')).toBeTruthy()
      const deck = controller.events.find(e => e.type === 'deck')!
      expect(resolve(workerDeck.dir, deck.entry as string)).toBe(slidesPath)

      await command(baseURL!, { type: 'inspect', on: true })
      // Inspection implies editor mode: overlays (drag handles) appear.
      await expect(page.locator(overlay('elements:0'))).toHaveClass(/geometry-inspected/)
      await expect(page.locator(overlay('elements:0'))).not.toHaveClass(/geometry-unresolved/)
      await expect(page.locator(overlay('elements:0'))).toContainText('elements[0]')
      // An entry that matched nothing has an outline of its own and says so.
      await expect(page.locator(overlay('elements:1'))).toHaveClass(/geometry-unresolved/)
      await expect(page.locator(overlay('elements:1'))).toContainText('matches nothing')

      await command(baseURL!, { type: 'highlight', entry: { slideNo: 2, collection: 'elements', index: 0 } })
      await expect(page.locator(overlay('elements:0'))).toHaveClass(/geometry-highlighted/)
      await expect(page.locator('.slidev-page-2 .geometry-highlighted')).toHaveCount(1)

      // A stale entry highlights nothing, without failing.
      await command(baseURL!, { type: 'highlight', entry: { slideNo: 2, collection: 'elements', index: 9 } })
      await expect(page.locator('.slidev-page-2 .geometry-highlighted')).toHaveCount(0)

      await command(baseURL!, { type: 'inspect', on: false })
      await expect(page.locator(overlay('elements:0'))).toHaveCount(0)
      expect(await boxInSlide(page, '#flow')).toEqual(before)
    }
    finally {
      controller.close()
    }
  })

  test('a drag under controlled mode is emitted and not written; releasing control, or detaching, restores direct writes', async ({ page, baseURL }) => {
    await openDeck(page)
    const controller = await attach(baseURL!)
    try {
      await command(baseURL!, { type: 'control', on: true })
      await command(baseURL!, { type: 'inspect', on: true })
      await expect(page.locator(overlay('elements:0'))).toHaveCount(1)

      const unchanged = readFileSync(slidesPath, 'utf-8')
      await dragLeft(page, overlay('elements:0'), 60)
      await expect.poll(() => controller.events.find(e => e.type === 'drag'), { timeout: 15000 }).toBeTruthy()
      const drag = controller.events.find(e => e.type === 'drag') as { slideNo: number, key: unknown, from: { x: number }, to: { x: number, y: number } }
      expect(drag.slideNo).toBe(2)
      expect(drag.key).toEqual({ kind: 'id', name: 'flow' })
      expect(drag.from).toEqual({ x: 500, y: 150, w: 400, h: 200 })
      expect(drag.to.x).toBeLessThan(500)
      expect(drag.to.y).toBe(150)
      // The theme did not write: the controller is the only writer.
      await page.waitForTimeout(1500)
      expect(readFileSync(slidesPath, 'utf-8')).toBe(unchanged)
      // The element stays where it was dropped.
      expect((await boxInSlide(page, '.geometry-image-overlay[data-geometry-entry="elements:0"]')).x).toBe(drag.to.x)

      // Releasing control: the next drag is written by the theme itself.
      await command(baseURL!, { type: 'control', on: false })
      await dragLeft(page, overlay('elements:0'), 40)
      await expect.poll(() => readFileSync(slidesPath, 'utf-8'), { timeout: 15000 }).toMatch(/id: flow,?\s+x: [34]\d\d,?\s+y: 150/)

      // A controller that detaches while holding control hands it back. No
      // reload here: a fresh page starts uncontrolled anyway, so only the
      // page that was told `control: on` shows the release happened.
      await command(baseURL!, { type: 'control', on: true })
      await page.waitForTimeout(500)
      controller.close()
      await page.waitForTimeout(1500)
      // Released inspection too, so the overlays are gone until the Layout tab opens.
      await expect(page.locator(overlay('elements:0'))).toHaveCount(0)
      const written = readFileSync(slidesPath, 'utf-8')
      await page.locator('button:has-text("Show editor")').click()
      const layoutTab = page.locator('button:has-text("Switch to layout tab")')
      await layoutTab.waitFor({ state: 'attached', timeout: 30000 })
      await layoutTab.dispatchEvent('click')
      await dragLeft(page, '.slidev-page-2 .geometry-image-overlay:has-text("Element flow")', 40)
      await expect.poll(() => readFileSync(slidesPath, 'utf-8'), { timeout: 15000 }).not.toBe(written)
    }
    finally {
      controller.close()
    }
  })
})
