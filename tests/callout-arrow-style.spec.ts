import type { Locator } from '@playwright/test'
import type { Page } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'

// Callout connector styles (`calloutStyle` frontmatter): `arrow` by default,
// with anchor-ordered stacking, and `elbow` as today's look. Runs on its own
// worker-scoped Slidev instance (tests/fixtures.ts).

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

// A's comment is long enough for a tall box, and B is on the next line: greedy
// placement puts B's box on the shelf *above* A's (closer to B's line than the
// shelf below), so the boxes come out in the opposite order to their lines.
const LONG = 'A long explanation that wraps into many lines of callout text, so that its box is tall enough to reach well below the next highlighted line of this code block and push the next callout onto a shelf'
const CODE = `\`\`\`java
int a = 1; // [!mark] ${LONG}
int b = 2; // [!mark] B
int c = 3;
int d = 4;
int e = 5;
\`\`\``

const HEAD = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
---`

const STYLES_DECK = `${HEAD}

# Arrow code

${CODE}

---
calloutStyle: elbow
---

# Elbow code

${CODE}

---
geometry:
  images:
    - { src: "${PNG}", x: 100, y: 120, w: 300, h: 300 }
callouts:
  - at: { image: "${PNG}", x: 0.9, y: 0.8 }
    text: Lower anchor
  - at: { image: "${PNG}", x: 0.9, y: 0.2 }
    text: Upper anchor
  - at: { x: 700, y: 480 }
---

# Image callouts

<img src="${PNG}">

---
callouts:
  - at: { x: 480, y: 210 }
    text: Near
    box: { x: 492, y: 196 }
---

# Pinned close

Text
`

const DEFAULTS_DECK = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
defaults:
  calloutStyle: elbow
---

# Defaults elbow

\`\`\`java
int a = 1; // [!mark] Note
\`\`\`

---
calloutStyle: arrow
---

# Slide arrow

\`\`\`java
int a = 1; // [!mark] Note
\`\`\`
`

let slidesPath: string
let originalSlides: string

async function openSlide(page: Page, no: number, heading: string, callouts: number): Promise<void> {
  const deadline = Date.now() + 100000
  for (;;) {
    await page.goto(`/${no}`)
    const slide = page.locator(`.slidev-page-${no}`, { has: page.locator('h1', { hasText: heading }) })
    const ready = await slide.locator('.code-callout-connector').nth(callouts - 1).waitFor({ state: 'attached', timeout: 8000 }).then(() => true, () => false)
    if (ready)
      break
    if (Date.now() > deadline)
      throw new Error('callout-arrow-style fixture never compiled on the dev server')
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(1200)
}

interface Box { x: number, y: number, w: number, h: number }

/** A callout box's rect in slide-canvas pixels, by its text. */
async function boxOf(page: Page, no: number, text: string): Promise<Box> {
  return page.locator(`.slidev-page-${no} .code-callout`).filter({ hasText: new RegExp(`^\\s*${text}`) }).first().evaluate((el) => {
    const e = el as HTMLElement
    return { x: Number.parseFloat(e.style.left), y: Number.parseFloat(e.style.top), w: e.offsetWidth, h: e.offsetHeight }
  })
}

/**
 * Which marker (`anchor` or `box`) a connector's `marker-start`/`marker-end`
 * points at, or null. Resolved like the browser does (first element with that
 * id in the document), and only counted when that marker is in the connector's
 * own slide: a marker in another (hidden) slide doesn't render.
 */
async function markerOn(connector: Locator, attr: 'marker-start' | 'marker-end'): Promise<string | null> {
  return connector.evaluate((el, name) => {
    const id = /^url\(#(.+)\)$/.exec(el.getAttribute(name) ?? '')?.[1]
    const marker = id ? document.getElementById(id) : null
    if (!marker || marker.closest('[data-slidev-no]') !== el.closest('[data-slidev-no]'))
      return null
    return marker.getAttribute('data-marker')
  }, attr)
}

function points(d: string): { x: number, y: number }[] {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  return Array.from({ length: n.length / 2 }, (_, i) => ({ x: n[2 * i], y: n[2 * i + 1] }))
}

function onBorder(p: { x: number, y: number }, b: Box): boolean {
  const inX = p.x >= b.x - 1.5 && p.x <= b.x + b.w + 1.5
  const inY = p.y >= b.y - 1.5 && p.y <= b.y + b.h + 1.5
  const onVertical = Math.abs(p.x - b.x) <= 1.5 || Math.abs(p.x - b.x - b.w) <= 1.5
  const onHorizontal = Math.abs(p.y - b.y) <= 1.5 || Math.abs(p.y - b.y - b.h) <= 1.5
  return inX && inY && (onVertical || onHorizontal)
}

test.describe('Callout arrow style E2E', () => {
  test.describe.configure({ timeout: 150000 })

  test.beforeAll(async ({ workerDeck }) => {
    slidesPath = join(workerDeck.dir, 'slides.md')
    originalSlides = readFileSync(slidesPath, 'utf-8')
    await new Promise(r => setTimeout(r, 2000))
  })

  test.afterAll(() => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
  })

  test.describe('deck-wide defaults', () => {
    test.beforeAll(async () => {
      writeFileSync(slidesPath, DEFAULTS_DECK, 'utf-8')
      await new Promise(r => setTimeout(r, 2000))
    })

    test('headmatter defaults set elbow, and a slide\'s own calloutStyle overrides them', async ({ page }) => {
      await openSlide(page, 1, 'Defaults elbow', 1)
      expect(await markerOn(page.locator('.slidev-page-1 .code-callout-connector'), 'marker-start')).toBe('anchor')
      await openSlide(page, 2, 'Slide arrow', 1)
      expect(await markerOn(page.locator('.slidev-page-2 .code-callout-connector'), 'marker-end')).toBe('box')
    })
  })

  test.describe('styles', () => {
    test.beforeAll(async () => {
      writeFileSync(slidesPath, STYLES_DECK, 'utf-8')
      await new Promise(r => setTimeout(r, 2000))
    })

    test('by default a connector is a straight arrow ending on its box with the head there', async ({ page }) => {
      await openSlide(page, 1, 'Arrow code', 2)
      const connector = page.locator('.slidev-page-1 .code-callout-connector').last()
      const path = points((await connector.getAttribute('d'))!)
      expect(path).toHaveLength(2)
      // Placement leaves room for the head: the arrow is at least 30px long.
      expect(Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y)).toBeGreaterThanOrEqual(30)
      expect(await markerOn(connector, 'marker-end')).toBe('box')
      expect(await connector.getAttribute('marker-start')).toBeNull()
      const boxes = [await boxOf(page, 1, 'B\\s*$'), await boxOf(page, 1, 'A long explanation')]
      expect(boxes.some(b => onBorder(path[1], b))).toBe(true)
    })

    test('boxes follow their highlights\' order on an arrow slide', async ({ page }) => {
      await openSlide(page, 1, 'Arrow code', 2)
      const a = await boxOf(page, 1, 'A long explanation')
      const b = await boxOf(page, 1, 'B\\s*$')
      expect(b.y).toBeGreaterThanOrEqual(a.y + a.h)
    })

    test('an elbow slide keeps the L connector, its head at the code, and greedy placement', async ({ page }) => {
      await openSlide(page, 2, 'Elbow code', 2)
      const connector = page.locator('.slidev-page-2 .code-callout-connector').last()
      expect(points((await connector.getAttribute('d'))!)).toHaveLength(3)
      expect(await markerOn(connector, 'marker-start')).toBe('anchor')
      expect(await connector.getAttribute('marker-end')).toBeNull()
      // Greedy placement shelved B above A.
      const a = await boxOf(page, 2, 'A long explanation')
      const b = await boxOf(page, 2, 'B\\s*$')
      expect(b.y + b.h).toBeLessThanOrEqual(a.y)
    })

    test('slide callouts on one image follow their anchors, and a bare arrow keeps its head on the anchor', async ({ page }) => {
      await openSlide(page, 3, 'Image callouts', 3)
      const lower = await boxOf(page, 3, 'Lower anchor')
      const upper = await boxOf(page, 3, 'Upper anchor')
      expect(upper.y + upper.h).toBeLessThanOrEqual(lower.y + 1)
      const bare = page.locator('.slidev-page-3 .code-callout-connector').last()
      expect(await markerOn(bare, 'marker-start')).toBe('anchor')
      const start = points((await bare.getAttribute('d'))!)[0]
      expect(Math.abs(start.x - 700)).toBeLessThanOrEqual(2)
      expect(Math.abs(start.y - 480)).toBeLessThanOrEqual(2)
    })

    test('an arrow too short for its head is drawn as a plain line', async ({ page }) => {
      await openSlide(page, 4, 'Pinned close', 1)
      const connector = page.locator('.slidev-page-4 .code-callout-connector')
      const [start, end] = points((await connector.getAttribute('d'))!)
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThan(30)
      expect(await connector.getAttribute('marker-end')).toBeNull()
      expect(await connector.getAttribute('marker-start')).toBeNull()
    })
  })
})
