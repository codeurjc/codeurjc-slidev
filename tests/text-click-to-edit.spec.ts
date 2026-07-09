import { test, expect, type Page } from '@playwright/test'

async function getTextareaSelection(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLTextAreaElement>('[data-editor="content"] textarea')
    if (!el) return null
    return {
      value: el.value,
      selected: el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0),
    }
  })
}

test.describe('Double-Click Text Edit E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.slidev-page-1 .content')
    await page.waitForTimeout(1000)
  })

  test('double-clicking a paragraph opens the editor on the Content tab with it selected', async ({ page }) => {
    await page.locator('.slidev-page-1 .content-inner p').first().dblclick()

    await expect(page.locator('[data-editor="content"] textarea')).toBeVisible()
    // The dblclick handler mounts the textarea before its async fetch +
    // resolveBlockRange resolves and calls setSelectionRange, so the
    // selection can still be empty for a moment after the textarea appears
    // -- poll rather than reading it once.
    await expect.poll(async () => (await getTextareaSelection(page))?.selected)
      .toContain('React permite que las peticiones')
  })

  test('double-clicking the title selects the raw markdown title line', async ({ page }) => {
    await page.locator('.slidev-page-1 h1').first().dblclick()

    await expect(page.locator('[data-editor="content"] textarea')).toBeVisible()
    await expect.poll(async () => (await getTextareaSelection(page))?.selected)
      .toBe('# Uso de API REST')
  })

  test('double-clicking during layout editing does not open or change the Content tab', async ({ page }) => {
    await page.locator('button:has-text("Show editor")').click()
    await page.locator('button:has-text("Switch to layout tab")').click()
    await page.waitForSelector('.layout-editor-panel', { timeout: 30000 })

    // Layout tab's content-overlay sits above the rendered paragraph and
    // intercepts the click, but the guard on editor.editing.value would
    // block it either way.
    await page.locator('.slidev-page-1 .content-overlay').dblclick()

    await expect(page.locator('.layout-editor-panel')).toBeVisible()
    await expect(page.locator('[data-editor="content"] textarea')).not.toBeVisible()
  })
})
