import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Follows the same temporary-fixture-swap convention as
// tests/autofit-text.spec.ts: this suite needs its own code block content,
// so it replaces e2e/slides.md for its run and restores the original in
// afterAll. playwright.config.ts's workers: 1 keeps other suites from
// running concurrently against the swapped file.
const slidesPath = resolve(import.meta.dirname, '../e2e/slides.md')

let originalSlides: string

const FIXTURE_SLIDES = `---
layout: default
colorSchema: light
aspectRatio: 16/9
---

# Highlights

\`\`\`java
public class GestorNotas {
  public GestorNotas(DBAlumno alumnos) { // [!mark:ctor-dep] Injects the DB dependency
    this.alumnos = alumnos;
  }

  public float calculaNotaMedia(long idAlumno) { // [!mark:fetch(calculaNotaMedia)] Entry point
    List<Float> notas = alumnos.getNotasAlumno(idAlumno); // [!mark:loop:start] Loops over notes
    float suma = 0.0f;
    for (float nota : notas) {
      suma += nota;
    }
    return suma / notas.size(); // [!mark:loop:end]
  }
}
\`\`\`
`

// tests/autofit-text.spec.ts (which runs immediately before this file
// alphabetically) also swaps e2e/slides.md and restores it in its own
// afterAll; that restore and this fixture's write can land close enough
// together that the dev server's file watcher debounces/coalesces them and
// serves stale content for an unpredictable while (observed anywhere from
// ~0 to ~60s across runs). Rather than guess a fixed settle delay, actively
// reload-and-recheck until the fixture's own content shows up, with a
// generous total budget.
async function waitForFixture(page: import('@playwright/test').Page) {
  const deadline = Date.now() + 100000
  for (;;) {
    const ready = await page.locator('.slidev-page-1 [data-highlight-id]').count().then(c => c > 0).catch(() => false)
    if (ready) return
    if (Date.now() > deadline) throw new Error('code-highlight fixture never appeared to compile on the dev server')
    await page.reload().catch(() => {})
    await page.waitForTimeout(1000)
  }
}

test.describe('Code Highlight Callouts E2E', () => {
  test.describe.configure({ timeout: 150000 })

  test.beforeAll(async () => {
    originalSlides = readFileSync(slidesPath, 'utf-8')
    // A short buffer before this suite's own write reduces the chance of
    // colliding with tests/autofit-text.spec.ts's afterAll restore of the
    // same file (see waitForFixture's comment) -- the two rapid writes to
    // the same path are what make the dev server's recompile unpredictably
    // slow in the first place.
    await new Promise(r => setTimeout(r, 2000))
    writeFileSync(slidesPath, FIXTURE_SLIDES, 'utf-8')
  })

  test.afterAll(() => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.slidev-page-1 .content')
    await page.waitForTimeout(500)
    await waitForFixture(page)
  })

  test('marked fragments render with the highlight style and no marker text leaks through', async ({ page }) => {
    const marks = page.locator('.slidev-page-1 [data-highlight-id]:visible')
    await expect(marks.first()).toBeVisible()
    const codeText = await page.locator('.slidev-page-1 pre:visible').first().innerText()
    expect(codeText).not.toContain('[!mark:')
  })

  test('each highlight with a comment renders a connected callout', async ({ page }) => {
    const callouts = page.locator('.slidev-page-1 .code-callout:visible')
    await expect(callouts).toHaveCount(3)
    await expect(page.locator('.slidev-page-1 .code-callout:visible', { hasText: 'Injects the DB dependency' })).toBeVisible()
    await expect(page.locator('.slidev-page-1 .code-callout:visible', { hasText: 'Loops over notes' })).toBeVisible()
    const connectors = page.locator('.slidev-page-1 .code-callout-connector:visible')
    await expect(connectors).toHaveCount(3)
  })

  test('a multi-line range highlight wraps every line in its range with the same id', async ({ page }) => {
    const rangeSpans = page.locator('.slidev-page-1 [data-highlight-id="loop"]:visible')
    expect(await rangeSpans.count()).toBeGreaterThanOrEqual(4)
  })

  test('callouts do not overlap the code text or each other', async ({ page }) => {
    // The obstacle used for placement is the actual code lines' bounding
    // box, not the <pre> element's own (wider) container box -- a <pre>
    // stretches to its container's full width regardless of how long the
    // code actually is, and callouts are allowed to sit in that leftover
    // space as long as they don't cover real code text. So this checks
    // against the union of the `.line` rects, not `pre`'s own box.
    const lineBoxes = await page.locator('.slidev-page-1 pre:visible .line').evaluateAll(
      els => els.map((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }),
    )
    const codeTextBox = lineBoxes.reduce((acc, r) => {
      if (!acc) return r
      const right = Math.max(acc.x + acc.width, r.x + r.width)
      const bottom = Math.max(acc.y + acc.height, r.y + r.height)
      const x = Math.min(acc.x, r.x)
      const y = Math.min(acc.y, r.y)
      return { x, y, width: right - x, height: bottom - y }
    }, null as { x: number, y: number, width: number, height: number } | null)

    const callouts = page.locator('.slidev-page-1 .code-callout:visible')
    const count = await callouts.count()
    const boxes = []
    for (let i = 0; i < count; i++) {
      boxes.push(await callouts.nth(i).boundingBox())
    }
    function overlaps(a: { x: number, y: number, width: number, height: number }, b: { x: number, y: number, width: number, height: number }) {
      return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    }
    for (const box of boxes) {
      expect(box).toBeTruthy()
      if (box && codeTextBox) expect(overlaps(box, codeTextBox)).toBe(false)
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxes[i] && boxes[j]) expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false)
      }
    }
  })

  test('dragging a callout in editor mode persists its position to slides.md', async ({ page }) => {
    await page.locator('button:has-text("Show editor")').click()
    // Dragging only takes effect while the layout tab is active (that's what
    // flips editor.editing to true) -- see _override/SideEditor.vue.
    await page.locator('button:has-text("Switch to layout tab")').click()
    await page.waitForTimeout(300)

    const callout = page.locator('.slidev-page-1 .code-callout:visible', { hasText: 'Injects the DB dependency' })
    const box = await callout.boundingBox()
    expect(box).toBeTruthy()
    if (!box) return

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 10 })
    await page.mouse.up()

    // Give the drag's fetch() a moment to land before reading the file back.
    await page.waitForTimeout(500)
    const updated = readFileSync(slidesPath, 'utf-8')
    expect(updated).toMatch(/\[!mark:ctor-dep@-?\d+,-?\d+\]/)
  })
})
