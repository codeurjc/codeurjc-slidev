import type { Page } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'

// Keyed `geometry.elements` (composables/useSlideGeometry.ts): code blocks,
// mermaid diagrams, tables and images positioned by a stable key. Runs on its
// own worker-scoped Slidev instance (tests/fixtures.ts), since it drags an
// element overlay.

const GESTOR = '@/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java'
const DB = '@/code/ejer8/src/main/java/es/codeurjc/test/alumno/DBAlumno.java'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const FENCE = '```'

const DECK = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
geometry:
  elements:
    - { code: "${GESTOR}", x: 31, y: 98, w: 440, h: 420 }
    - { code: "${DB}", x: 500, y: 98, w: 440, h: 420 }
---

# Two imports

<<< ${GESTOR}[7-12] java
[!mark:2] The constructor

<<< ${DB} java

---
geometry:
  elements:
    - { code: app.ts, x: 600, y: 120, w: 60, h: 400 }
    - { code: small.ts, x: 600, y: 350, w: 330, h: 180 }
    - { id: flow, x: 31, y: 300, w: 400, h: 200 }
    - { id: prices, x: 31, y: 98, w: 300, h: 150, fit: none }
---

# Kinds

${FENCE}ts [app.ts]
const aVeryLongLineOfCodeThatIsMuchWiderThanItsBox = 'so it has to be scaled down'
${FENCE}

${FENCE}ts [small.ts]
x()
${FENCE}

${FENCE}mermaid {id: 'flow'}
graph LR
  A --> B
${FENCE}

<div id="prices">

| Product | Price |
| --- | --- |
| Tea | 1 |

</div>

---
geometry:
  elements:
    - { code: dup.ts, x: 600, y: 120, w: 300, h: 200 }
    - { id: notes, x: 600, y: 350, w: 300, h: 100 }
    - { image: "${PNG}", x: 700, y: 400, w: 100, h: 100 }
---

# Warnings

${FENCE}ts [dup.ts]
one()
${FENCE}

${FENCE}ts [dup.ts]
two()
${FENCE}

<div id="notes">

- a list

</div>

<img src="${PNG}">

${FENCE}mermaid
graph LR
  C --> D
${FENCE}
`

let slidesPath: string
let originalSlides: string
const warnings: string[] = []

interface Box { x: number, y: number, w: number, h: number }

async function openSlide(page: Page, no: number, heading: string, ready: string): Promise<void> {
  const deadline = Date.now() + 100000
  for (;;) {
    await page.goto(`/${no}`)
    const slide = page.locator(`.slidev-page-${no}`, { has: page.locator('h1', { hasText: heading }) })
    const ok = await slide.locator(ready).first().waitFor({ state: 'attached', timeout: 8000 }).then(() => true, () => false)
    if (ok)
      break
    if (Date.now() > deadline)
      throw new Error('geometry-elements fixture never compiled on the dev server')
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(1500)
}

/** An element's rendered box in slide-canvas pixels. */
async function boxInSlide(page: Page, no: number, selector: string): Promise<Box> {
  return page.evaluate(([n, sel]) => {
    const layout = document.querySelector<HTMLElement>(`.slidev-page-${n} .slidev-layout`)!
    const origin = layout.getBoundingClientRect()
    const scale = origin.width / layout.offsetWidth
    const r = document.querySelector(`.slidev-page-${n} ${sel}`)!.getBoundingClientRect()
    return { x: (r.left - origin.left) / scale, y: (r.top - origin.top) / scale, w: r.width / scale, h: r.height / scale }
  }, [no, selector] as const)
}

function inside(inner: Box, outer: Box, tolerance = 1.5): boolean {
  return inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance
    && inner.x + inner.w <= outer.x + outer.w + tolerance && inner.y + inner.h <= outer.y + outer.h + tolerance
}

test.describe('Geometry elements E2E', () => {
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

  test.beforeEach(async ({ page }) => {
    page.on('console', (m) => {
      if (m.type() === 'warning')
        warnings.push(m.text())
    })
  })

  test('two imports are positioned side by side by their paths, and their callout follows', async ({ page }) => {
    await openSlide(page, 1, 'Two imports', '.geometry-element')
    const left = await boxInSlide(page, 1, `[data-import-path="${GESTOR}"]`)
    const right = await boxInSlide(page, 1, `[data-import-path="${DB}"]`)
    expect(inside(left, { x: 31, y: 98, w: 440, h: 420 })).toBe(true)
    expect(inside(right, { x: 500, y: 98, w: 440, h: 420 })).toBe(true)
    expect(left.x + left.w).toBeLessThanOrEqual(right.x)
    // The code callout still points at its highlight inside the positioned block.
    const connector = page.locator('.slidev-page-1 .code-callout-connector')
    await expect(connector).toHaveCount(1)
    const start = (await connector.getAttribute('d'))!.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    const highlight = await boxInSlide(page, 1, '[data-highlight-id]')
    expect(start[1]).toBeGreaterThanOrEqual(highlight.y - 1)
    expect(start[1]).toBeLessThanOrEqual(highlight.y + highlight.h + 1)
  })

  test('a fence by title scales down to fit, a small one keeps its size, and a mermaid and a table are positioned by id', async ({ page }) => {
    await openSlide(page, 2, 'Kinds', '.geometry-element')
    const scaled = await boxInSlide(page, 2, '[data-title="app.ts"]')
    expect(inside(scaled, { x: 600, y: 120, w: 60, h: 400 })).toBe(true)
    expect(await page.locator('.slidev-page-2 [data-title="app.ts"]').evaluate(el => (el as HTMLElement).style.transform)).toMatch(/scale\(0\.\d+\)/)

    const small = page.locator('.slidev-page-2 [data-title="small.ts"]')
    expect(await small.evaluate(el => (el as HTMLElement).style.transform)).toBe('')
    expect(inside(await boxInSlide(page, 2, '[data-title="small.ts"]'), { x: 600, y: 350, w: 330, h: 180 })).toBe(true)

    await expect(page.locator('.slidev-page-2 #flow')).toHaveClass(/geometry-element/)
    const flow = await boxInSlide(page, 2, '#flow')
    expect(inside(flow, { x: 31, y: 300, w: 400, h: 200 })).toBe(true)

    // fit: none: natural size at the box's top-left corner.
    const table = await boxInSlide(page, 2, '#prices table')
    expect(Math.abs(table.x - 31)).toBeLessThanOrEqual(1.5)
    expect(Math.abs(table.y - 98)).toBeLessThanOrEqual(1.5)
  })

  test('a repeated title and a wrong-kind id stay in flow with warnings, and an image entry positions the image', async ({ page }) => {
    await openSlide(page, 3, 'Warnings', 'img.geometry-image')
    await expect(page.locator('.slidev-page-3 .geometry-element')).toHaveCount(0)
    expect(warnings.some(w => w.includes('code "dup.ts") matches 2 elements'))).toBe(true)
    expect(warnings.some(w => w.includes('id "notes") is not a code block'))).toBe(true)
    expect(inside(await boxInSlide(page, 3, 'img.geometry-image'), { x: 700, y: 400, w: 100, h: 100 })).toBe(true)
  })

  test('the Layout tab shows element overlays, a drag writes the entry, and unkeyed content gets a hint', async ({ page }) => {
    await openSlide(page, 2, 'Kinds', '.geometry-element')
    await page.locator('button:has-text("Show editor")').click()
    const layoutTab = page.locator('button:has-text("Switch to layout tab")')
    await layoutTab.waitFor({ state: 'attached', timeout: 30000 })
    await layoutTab.dispatchEvent('click')
    await page.waitForSelector('.layout-editor-panel', { state: 'visible', timeout: 30000 })
    await expect(page.getByTestId('unkeyed-hint')).toHaveCount(0)
    // The diagram starts aspect-locked like an image; code and tables don't.
    await expect.poll(async () => ((await page.locator('.slidev-page-2 [data-aspect-locked]').first().getAttribute('data-aspect-locked')) ?? '').split(','))
      .toEqual(expect.arrayContaining(['geometry:2:element:2']))
    const locked = ((await page.locator('.slidev-page-2 [data-aspect-locked]').first().getAttribute('data-aspect-locked')) ?? '').split(',')
    expect(locked).not.toContain('geometry:2:element:0')
    expect(locked).not.toContain('geometry:2:element:3')

    const overlay = page.locator('.slidev-page-2 .geometry-image-overlay', { hasText: 'Code small.ts' })
    await expect(overlay).toHaveCount(1)
    const box = (await overlay.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 20, box.y + box.height / 2, { steps: 5 })
    await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2, { steps: 5 })
    await page.mouse.up()
    await expect.poll(() => readFileSync(slidesPath, 'utf-8'), { timeout: 15000 }).toMatch(/code: small\.ts,?\s+x: 5\d\d,?\s+y: 350,?\s+w: 330,?\s+h: 180/)
    // The other entries, including their keys and fit, are kept (Slidev re-serializes the list in block style).
    expect(readFileSync(slidesPath, 'utf-8')).toMatch(/id: prices,?\s+x: 31,?\s+y: 98,?\s+w: 300,?\s+h: 150,?\s+fit: none/)

    await page.locator('.slidev-page-2 .content').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {})
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('unkeyed-hint')).toHaveText('2 code blocks and 1 mermaid diagram need an id to be positioned', { timeout: 15000 })
  })
})
