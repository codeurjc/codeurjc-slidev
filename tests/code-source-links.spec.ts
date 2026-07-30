import { test, expect } from './fixtures'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Runs against this repo's own real git checkout (a genuine GitHub `origin`
// remote), so the auto-detected links exercised here are real end-to-end
// integration coverage, not a stubbed git runner (see
// composables/__tests__/useSourceLink.spec.ts for that unit-level coverage).
// `codeSourceLinkBranch: main` is pinned in the fixture's own frontmatter so
// the expected URL doesn't depend on whether this checkout happens to have
// `refs/remotes/origin/HEAD` set locally (a shallow/CI clone often doesn't).
let slidesPath: string
let originalSlides: string

const FIXTURE_SLIDES = `---
theme: codeurjc-slidev-theme
layout: default
colorSchema: light
aspectRatio: 16/9
codeSourceLinkBranch: main
---

# Source links

<<< @/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java[7-22] java

<<< @/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java[7-9] java notitle

\`\`\`java
public class Manual {
// [!source https://example.com/manual/Manual.java]
  int x = 1;
}
\`\`\`

---
layout: default
---

## Overrides

<<< @/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java[7-9] java
[!source https://example.com/override/File.java]

<<< @/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java[7-9] java
[!source none]

<<< @/code/ejer8/src/main/java/es/codeurjc/test/gestor/GestorNotas.java[7-9] java
[!source bottom]
`

async function waitForFixture(page: import('@playwright/test').Page, slide: number, wrapperCount: number) {
  const deadline = Date.now() + 100000
  for (;;) {
    const ready = await page.locator(`.slidev-page-${slide} .slidev-code-wrapper, .slidev-page-${slide} pre`).count()
      .then(c => c >= wrapperCount).catch(() => false)
    if (ready) return
    if (Date.now() > deadline) throw new Error('code-source-links fixture never appeared to compile on the dev server')
    await page.reload().catch(() => {})
    await page.waitForTimeout(1000)
  }
}

test.describe('Code Source Links E2E', () => {
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

  test('titled import shows a clickable source-link icon beside the title, deep-linked to its line range', async ({ page }) => {
    await page.goto('/1')
    await page.waitForSelector('.slidev-page-1 .content')
    await waitForFixture(page, 1, 2)

    const wrapper = page.locator('.slidev-page-1 .slidev-code-wrapper:visible').first()
    await expect(wrapper.locator('.slidev-code-block-title')).toHaveText('GestorNotas.java')
    const icon = wrapper.locator('.slidev-source-link-icon')
    await expect(icon).toHaveCount(1)
    await expect(icon).toHaveAttribute('href', /github\.com\/codeurjc\/codeurjc-slidev\/blob\/main\/code\/ejer8\/.*GestorNotas\.java#L7-L22$/)
  })

  test('notitle import\'s source link renders in the bottom row instead', async ({ page }) => {
    await page.goto('/1')
    await page.waitForSelector('.slidev-page-1 .content')
    await waitForFixture(page, 1, 2)

    const wrapper = page.locator('.slidev-page-1 .slidev-code-wrapper:visible').nth(1)
    await expect(wrapper.locator('.slidev-code-block-title')).toHaveCount(0)
    await expect(wrapper.locator('.slidev-source-link-icon')).toHaveCount(0)

    const bottomRow = page.locator('.slidev-page-1 .source-link-bottom-row')
    await expect(bottomRow.locator('.source-link-bottom-icon')).toHaveCount(2)
    await expect(bottomRow.locator('.source-link-bottom-icon').nth(0)).toHaveAttribute(
      'href',
      /github\.com\/codeurjc\/codeurjc-slidev\/blob\/main\/code\/ejer8\/.*GestorNotas\.java#L7-L9$/,
    )
  })

  test('a manual fence\'s inline // [!source url] marker is stripped and renders in the bottom row', async ({ page }) => {
    await page.goto('/1')
    await page.waitForSelector('.slidev-page-1 .content')
    await waitForFixture(page, 1, 2)

    const codeBlocks = page.locator('.slidev-page-1 pre:visible')
    const manualCode = await codeBlocks.last().innerText()
    expect(manualCode).not.toContain('[!source')
    expect(manualCode).toContain('public class Manual')

    const bottomRow = page.locator('.slidev-page-1 .source-link-bottom-row')
    await expect(bottomRow.locator('.source-link-bottom-icon')).toHaveCount(2)
    await expect(bottomRow.locator('.source-link-bottom-icon').nth(1)).toHaveAttribute('href', 'https://example.com/manual/Manual.java')
  })

  test('[!source url] overrides the auto-detected link', async ({ page }) => {
    await page.goto('/2')
    await page.waitForSelector('.slidev-page-2 .content')
    await waitForFixture(page, 2, 3)

    const wrapper = page.locator('.slidev-page-2 .slidev-code-wrapper:visible').nth(0)
    await expect(wrapper.locator('.slidev-source-link-icon')).toHaveAttribute('href', 'https://example.com/override/File.java')
  })

  test('[!source none] suppresses the link entirely', async ({ page }) => {
    await page.goto('/2')
    await page.waitForSelector('.slidev-page-2 .content')
    await waitForFixture(page, 2, 3)

    const wrapper = page.locator('.slidev-page-2 .slidev-code-wrapper:visible').nth(1)
    await expect(wrapper.locator('.slidev-code-block-title')).toHaveText('GestorNotas.java')
    await expect(wrapper.locator('.slidev-source-link-icon')).toHaveCount(0)
    await expect(page.locator('.slidev-page-2 .source-link-bottom-row .source-link-bottom-icon')).toHaveCount(1)
  })

  test('[!source bottom] forces bottom placement despite a visible title', async ({ page }) => {
    await page.goto('/2')
    await page.waitForSelector('.slidev-page-2 .content')
    await waitForFixture(page, 2, 3)

    const wrapper = page.locator('.slidev-page-2 .slidev-code-wrapper:visible').nth(2)
    await expect(wrapper.locator('.slidev-code-block-title')).toHaveText('GestorNotas.java')
    await expect(wrapper.locator('.slidev-source-link-icon')).toHaveCount(0)

    const bottomRow = page.locator('.slidev-page-2 .source-link-bottom-row')
    await expect(bottomRow.locator('.source-link-bottom-icon')).toHaveCount(1)
    await expect(bottomRow.locator('.source-link-bottom-icon').first()).toHaveAttribute(
      'href',
      /github\.com\/codeurjc\/codeurjc-slidev\/blob\/main\/code\/ejer8\/.*GestorNotas\.java#L7-L9$/,
    )
  })
})
