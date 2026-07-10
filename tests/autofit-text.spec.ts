import { test, expect, type Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { AUTOFIT_MAX_PT } from '../composables/useAutoFitText'

// 1pt = 4/3px at 96dpi (the ratio getComputedStyle reports fonts in).
const CEILING_PX = AUTOFIT_MAX_PT * 4 / 3

// This suite needs a multi-slide deck (to navigate to fixture slides by
// index and exercise v-click), but tests/layout-editor.spec.ts assumes the
// shared e2e/slides.md fixture has exactly one slide. Rather than permanently
// growing that shared fixture (which broke unrelated layout-editor drag/
// resize/save assertions -- multi-slide decks change how Slidev mounts
// prev/current/next slide instances), this suite temporarily replaces
// e2e/slides.md for its own run and restores the original content in
// afterAll, following the same backup/restore convention layout-editor.spec.ts
// uses. playwright.config.ts runs with workers: 1 so no other spec file's
// tests can run concurrently against the temporarily-swapped file.
const slidesPath = resolve(import.meta.dirname, '../e2e/slides.md')

let originalSlides: string

// Fixture slides appended at fixed indices:
//   2 = "Autofit fits"    — short content, should stay at the 32pt (42.67px) default/ceiling
//   3 = "Autofit shrinks" — overflows at 32pt, should shrink to an intermediate size
//   4 = "Autofit floor"   — overflows even at 9pt (12px), should stop at the floor and remain visible
//   5 = "Autofit vclick"  — v-click reveal drives live shrink/grow across steps
//   6 = "Autofit wraps"   — a long unbroken token should wrap rather than shrink the font
const FIXTURE_SLIDES = `
---
layout: default
---

# Autofit fits

- Short bullet one
- Short bullet two
- Short bullet three

---
layout: default
---

# Autofit shrinks

${Array.from({ length: 13 }, (_, i) => `- Reveal item number ${i + 1}`).join('\n')}

---
layout: default
---

# Autofit floor

${Array.from({ length: 60 }, (_, i) => `- Overflow item number ${i + 1}`).join('\n')}

---
layout: default
---

# Autofit vclick

<v-click>

${Array.from({ length: 20 }, (_, i) => `- Reveal item number ${i + 1}`).join('\n')}

</v-click>

---
layout: default
---

# Autofit wraps

Averyveryveryveryverylongunbrokentokenwithoutanyspacesatallthatmustwraptothenextlineinsidethecontentboxratherthanoverflowingitshorizontally and then a few trailing regular words to keep the paragraph going a little further.
`

// Slidev keeps hidden clones of every slide's content in the DOM (e.g. for
// the slide-overview thumbnails), so `.content` always matches more than one
// element. Every selector below is scoped with Playwright's `:visible`
// pseudo-class to target only the actually-displayed slide.
const BOX_HEIGHT_PX = 400 // default.vue's static --ed-content-h default

async function contentFontSizePx(page: Page): Promise<number> {
  const value = await page.locator('.content:visible').evaluate((el) => getComputedStyle(el).fontSize)
  return parseFloat(value)
}

async function contentInnerHeightPx(page: Page): Promise<number> {
  // offsetHeight, not getBoundingClientRect: Slidev scales the whole slide
  // via a CSS transform for responsive display, and BOX_HEIGHT_PX is a
  // pre-transform logical value -- getBoundingClientRect would return the
  // post-transform (viewport) size and scale the comparison incorrectly
  // depending on the current viewport/window size.
  return page.locator('.content-inner:visible').evaluate((el) => (el as HTMLElement).offsetHeight)
}

async function contentBoxVars(page: Page): Promise<{ x: string; y: string; w: string; h: string }> {
  return page.locator('.slidev-layout.default:visible').evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      x: style.getPropertyValue('--ed-content-x').trim(),
      y: style.getPropertyValue('--ed-content-y').trim(),
      w: style.getPropertyValue('--ed-content-w').trim(),
      h: style.getPropertyValue('--ed-content-h').trim(),
    }
  })
}

test.describe('Content text auto-fit', () => {
  test.beforeAll(() => {
    originalSlides = readFileSync(slidesPath, 'utf-8')
    writeFileSync(slidesPath, originalSlides + FIXTURE_SLIDES, 'utf-8')
  })

  test.afterAll(() => {
    writeFileSync(slidesPath, originalSlides, 'utf-8')
  })

  test('content that fits at 32pt renders at 32pt (42.67px)', async ({ page }) => {
    await page.goto('/2')
    await page.waitForSelector('.content:visible')
    await expect.poll(() => contentFontSizePx(page)).toBeCloseTo(CEILING_PX, 1)
  })

  test('content that overflows at 32pt shrinks to a smaller size that fits', async ({ page }) => {
    await page.goto('/3')
    await page.waitForSelector('.content:visible')

    await expect.poll(() => contentFontSizePx(page)).toBeLessThan(CEILING_PX)
    const size = await contentFontSizePx(page)
    expect(size).toBeGreaterThan(12)

    const innerHeight = await contentInnerHeightPx(page)
    expect(innerHeight).toBeLessThanOrEqual(BOX_HEIGHT_PX + 1) // +1px rounding tolerance
  })

  test('content too large even at 9pt (12px) stops shrinking and overflows visibly', async ({ page }) => {
    await page.goto('/4')
    await page.waitForSelector('.content:visible')

    await expect.poll(() => contentFontSizePx(page)).toBe(12)

    const innerHeight = await contentInnerHeightPx(page)
    expect(innerHeight).toBeGreaterThan(BOX_HEIGHT_PX)

    // Not clipped: .content has no overflow:hidden, so the overflowing
    // content's bottom edge extends past the configured box height.
    const overflowStyle = await page.locator('.content:visible').evaluate((el) => getComputedStyle(el).overflow)
    expect(overflowStyle).not.toBe('hidden')
  })

  test('advancing a v-click step that adds overflowing content shrinks the font size live', async ({ page }) => {
    await page.goto('/5')
    await page.waitForSelector('.content:visible')

    // Before any click: only the title is visible, comfortably fits.
    await expect.poll(() => contentFontSizePx(page)).toBeCloseTo(CEILING_PX, 1)

    // Advance the click — reveals enough content to overflow at 32pt.
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => contentFontSizePx(page)).toBeLessThan(CEILING_PX)
  })

  test('reversing a v-click step grows the font size back up, not exceeding 32pt', async ({ page }) => {
    await page.goto('/5')
    await page.waitForSelector('.content:visible')

    await page.keyboard.press('ArrowRight')
    await expect.poll(() => contentFontSizePx(page)).toBeLessThan(CEILING_PX)

    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => contentFontSizePx(page)).toBeCloseTo(CEILING_PX, 1)
  })

  test('a long unwrapped token wraps instead of shrinking the font', async ({ page }) => {
    await page.goto('/6')
    await page.waitForSelector('.content:visible')

    // Short vertical content overall (one wrapped paragraph) — should stay
    // at (or, given the line-height needed for readable wrapped lines,
    // fractionally under) the ceiling rather than shrinking substantially.
    await expect.poll(() => contentFontSizePx(page)).toBeGreaterThanOrEqual(CEILING_PX - 1)
    await expect.poll(() => contentFontSizePx(page)).toBeLessThanOrEqual(CEILING_PX + 0.01)

    // The long token should not overflow the box's width.
    const [contentBox, tokenBox] = await Promise.all([
      page.locator('.content:visible').boundingBox(),
      page.locator('.content-inner:visible p').boundingBox(),
    ])
    expect(contentBox).not.toBeNull()
    expect(tokenBox).not.toBeNull()
    if (contentBox && tokenBox) {
      expect(tokenBox.width).toBeLessThanOrEqual(contentBox.width + 1)
    }
  })

  test('box geometry is unchanged by shrinking or growing', async ({ page }) => {
    const fitsVars = await (async () => {
      await page.goto('/2')
      await page.waitForSelector('.content:visible')
      return contentBoxVars(page)
    })()

    const floorVars = await (async () => {
      await page.goto('/4')
      await page.waitForSelector('.content:visible')
      await expect.poll(() => contentFontSizePx(page)).toBe(12)
      return contentBoxVars(page)
    })()

    expect(floorVars).toEqual(fitsVars)
  })
})
