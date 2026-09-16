import type { Page } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'

// Slide callouts anchored to a mermaid diagram's node. Slidev renders mermaid
// asynchronously into a shadow root, which `{ text }` anchors have to reach
// into (and wait for). Runs on its own worker-scoped Slidev instance.

const FIXTURE_SLIDES = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
---

# Diagrams

---
callouts:
  - at: { text: Requisitos }
    text: Pruebas
---

# Diagram callout

\`\`\`mermaid
flowchart LR
  n1["Requisitos"]
  n2["Implementación"]
  n1 --> n2
\`\`\`

---
callouts:
  - at: { text: Cascada }
    text: En el texto
---

# Plain content first

Metodología: Cascada

\`\`\`mermaid
flowchart LR
  n1["Cascada"]
  n2["Ágil"]
  n1 --> n2
\`\`\`
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
      throw new Error('slide-callouts-diagrams fixture never appeared to compile on the dev server')
    await page.waitForTimeout(1000)
  }
  // Mermaid renders after mount; wait for its nodes inside the shadow root.
  await page.waitForFunction(n => Array.from(document.querySelectorAll(`.slidev-page-${n} .mermaid`))
    .some(el => (el.shadowRoot?.querySelectorAll('g.node').length ?? 0) > 0), slide, { timeout: 60000 })
  await page.waitForTimeout(800)
}

/** The first point of a connector's path, in slide-canvas pixels. */
function pathStart(d: string): { x: number, y: number } {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  return { x: numbers[0], y: numbers[1] }
}

/** A rendered element's box in slide-canvas pixels, found by `locate` in the page. */
async function canvasRect(page: Page, slide: number, locate: string) {
  return page.evaluate(([n, source]) => {
    const root = document.querySelector(`.slidev-page-${n} .slidev-layout`) as HTMLElement
    const rootRect = root.getBoundingClientRect()
    const scale = rootRect.width / root.offsetWidth
    // eslint-disable-next-line no-new-func
    const el = new Function('root', `return ${source}`)(root) as Element
    const r = el.getBoundingClientRect()
    return { x: (r.left - rootRect.left) / scale, y: (r.top - rootRect.top) / scale, w: r.width / scale, h: r.height / scale }
  }, [slide, locate] as const)
}

test.describe('Slide callouts on mermaid diagrams E2E', () => {
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

  test('a text anchor points at the mermaid node carrying that label, once it renders', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning')
        warnings.push(msg.text())
    })
    await openSlide(page, 2)

    await expect(page.locator('.slidev-page-2 .code-callout')).toHaveText('Pruebas')
    const connector = page.locator('.slidev-page-2 .code-callout-connector')
    await expect(connector).toHaveCount(1)
    const start = pathStart((await connector.getAttribute('d'))!)
    const node = await canvasRect(page, 2, `Array.from(root.querySelector('.mermaid').shadowRoot.querySelectorAll('g.node')).find(g => g.textContent.includes('Requisitos'))`)
    // The anchor is the node's centre.
    expect(Math.abs(start.x - (node.x + node.w / 2))).toBeLessThanOrEqual(3)
    expect(Math.abs(start.y - (node.y + node.h / 2))).toBeLessThanOrEqual(3)
    // And the callout box keeps clear of the node.
    const box = await canvasRect(page, 2, `root.querySelector('.code-callout')`)
    const overlaps = box.x < node.x + node.w && node.x < box.x + box.w && box.y < node.y + node.h && node.y < box.y + box.h
    expect(overlaps).toBe(false)

    expect(warnings.filter(w => w.includes('callout anchored to text "Requisitos"'))).toEqual([])
  })

  test('plain content wins over a diagram node with the same text', async ({ page }) => {
    await openSlide(page, 3)
    const start = pathStart((await page.locator('.slidev-page-3 .code-callout-connector').getAttribute('d'))!)
    const paragraph = await canvasRect(page, 3, `Array.from(root.querySelectorAll('.content-inner p')).find(p => p.textContent.includes('Cascada'))`)
    expect(Math.abs(start.y - (paragraph.y + paragraph.h / 2))).toBeLessThanOrEqual(3)
  })
})
