import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'fs'
import { resolve } from 'path'

const e2eDir = resolve(import.meta.dirname, '../e2e')
const e2eLayoutsDir = resolve(e2eDir, 'layouts')
const rootLayoutsDir = resolve(import.meta.dirname, '..', 'layouts')
const slidesPath = resolve(e2eDir, 'slides.md')
const rootSlidesPath = resolve(import.meta.dirname, '..', 'slides.md')
const defaultLayoutPath = resolve(e2eLayoutsDir, 'default.vue')

let originalSlides: string
let originalRootSlides: string
let originalLayout: string

function removeGeneratedLayouts(dir: string) {
  for (const file of readdirSync(dir)) {
    if (file.startsWith('test-layout-') && file.endsWith('.vue')) {
      rmSync(resolve(dir, file))
    }
  }
}

test.describe('Layout Editor E2E', () => {
  test.beforeAll(() => {
    originalSlides = readFileSync(slidesPath, 'utf-8')
    originalRootSlides = readFileSync(rootSlidesPath, 'utf-8')
    originalLayout = readFileSync(defaultLayoutPath, 'utf-8')
  })

  test.afterAll(() => {
    writeFileSync(rootSlidesPath, originalRootSlides, 'utf-8')
    writeFileSync(slidesPath, originalSlides, 'utf-8')
    writeFileSync(defaultLayoutPath, originalLayout, 'utf-8')
    removeGeneratedLayouts(e2eLayoutsDir)
    removeGeneratedLayouts(rootLayoutsDir)
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the slide content to be visible
    await page.waitForSelector('.slidev-page-1 .content');
    // Wait a bit for the JS to initialize
    await page.waitForTimeout(2000);
    // Open the editor by clicking the "Show editor" button in the nav controls
    await page.locator('button:has-text("Show editor")').click();
    // Switch to layout tab
    await page.locator('button:has-text("Switch to layout tab")').click();
    // Wait for layout panel content to be visible
    await page.waitForSelector('.layout-editor-panel', { timeout: 30000 });
  });

  test('can toggle layout tab and see elements', async ({ page }) => {
    // Check if layout tab content is visible
    await expect(page.locator('.layout-editor-panel')).toBeVisible();
    // Check if elements are listed
    const elements = page.locator('.lep-el');
    await expect(elements.first()).toBeVisible();
  });

  test('selecting an element shows its active box', async ({ page }) => {
    type El = { name: string; selector: string; btnLabel: string };
    const els: El[] = [
      { name: 'red-bar', selector: '.slidev-page-1 .red-bar', btnLabel: 'Red Bar' },
      { name: 'logo',     selector: '.slidev-page-1 .logo',     btnLabel: 'Logo' },
      { name: 'title',    selector: '.slidev-page-1 .title-overlay', btnLabel: 'Title' },
      { name: 'content',  selector: '.slidev-page-1 .content',  btnLabel: 'Content' },
    ];

    for (const el of els) {
      // Click the element button in the layout panel
      const btn = page.locator('.lep-el').filter({ hasText: el.btnLabel });
      await btn.click();

      // Wait for the button to become active (editor.selected was set)
      await expect(btn).toHaveClass(/active/);

      // The element in the slide should now also have the el-active class
      await expect(page.locator(el.selector)).toHaveClass(/el-active/);
    }
  });

  async function getSlideScale(page: any): Promise<number> {
    const container = page.locator('.slidev-page-1 .slidev-layout.default');
    const rect = await container.boundingBox();
    const scrollWidth = await container.evaluate((el: Element) => el.scrollWidth);
    return rect.width / scrollWidth;
  }

  async function dragElement(page: any, selector: string, ddx: number, ddy: number) {
    const el = page.locator(selector);
    const box = await el.boundingBox();
    if (!box) throw new Error(`Element ${selector} not found`);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + ddx, cy + ddy, { steps: 10 });
    await page.mouse.up();
  }

  test('can drag logo and see position update in properties', async ({ page }) => {
    const scale = await getSlideScale(page);

    // Select the logo element
    const logoBtn = page.locator('.lep-el').filter({ hasText: 'Logo' });
    await logoBtn.click();
    await expect(logoBtn).toHaveClass(/active/);

    // Read initial X and Y positions
    const xInput = page.locator('.lep-props label').filter({ hasText: 'X:' }).locator('input');
    const yInput = page.locator('.lep-props label').filter({ hasText: 'Y:' }).locator('input');
    const initialX = parseInt(await xInput.inputValue(), 10);
    const initialY = parseInt(await yInput.inputValue(), 10);

    // Drag the logo right and down (use smaller dx so X doesn't clamp to 0)
    const vpDx = 10;
    const vpDy = 50;
    await dragElement(page, '.slidev-page-1 .logo', vpDx, vpDy);

    // Expected CSS-pixel deltas = viewport delta / scale
    const cssDx = Math.round(vpDx / scale);
    const cssDy = Math.round(vpDy / scale);

    // Logo uses `right:` positioning (invertX: true):
    //   dragging right (positive dx) decreases the X value
    const newX = parseInt(await xInput.inputValue(), 10);
    const newY = parseInt(await yInput.inputValue(), 10);
    expect(newX).toBe(initialX - cssDx);
    expect(newY).toBe(initialY + cssDy);
  });

  test('can drag title and verify it follows the cursor accurately', async ({ page }) => {
    const scale = await getSlideScale(page);

    // Select the title element
    const titleBtn = page.locator('.lep-el').filter({ hasText: 'Title' });
    await titleBtn.click();
    await expect(titleBtn).toHaveClass(/active/);

    const titleOverlay = page.locator('.slidev-page-1 .title-overlay');

    // Read initial X and Y positions
    const xInput = page.locator('.lep-props label').filter({ hasText: 'X:' }).locator('input');
    const yInput = page.locator('.lep-props label').filter({ hasText: 'Y:' }).locator('input');
    const initialX = parseInt(await xInput.inputValue(), 10);
    const initialY = parseInt(await yInput.inputValue(), 10);

    // Drag the title overlay right and down
    const vpDx = 100;
    const vpDy = 80;
    await dragElement(page, '.slidev-page-1 .title-overlay', vpDx, vpDy);

    // Expected CSS-pixel deltas = viewport delta / scale
    const cssDx = Math.round(vpDx / scale);
    const cssDy = Math.round(vpDy / scale);

    // Title uses `left:` positioning (normal):
    //   dragging right increases X, dragging down increases Y
    const newX = parseInt(await xInput.inputValue(), 10);
    const newY = parseInt(await yInput.inputValue(), 10);
    expect(newX).toBe(initialX + cssDx);
    expect(newY).toBe(initialY + cssDy);
  });

  test('undo becomes enabled after dragging and resets positions', async ({ page }) => {
    const undoBtn = page.locator('.lep-btn').filter({ hasText: 'Undo' });

    // Undo should be disabled initially
    await expect(undoBtn).toBeDisabled();

    // Select the title and drag it
    const titleBtn = page.locator('.lep-el').filter({ hasText: 'Title' });
    await titleBtn.click();

    const titleOverlay = page.locator('.slidev-page-1 .title-overlay');
    const box = await titleOverlay.boundingBox();
    if (!box) throw new Error('title-overlay not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 50, { steps: 10 });
    await page.mouse.up();

    // Undo should now be enabled
    await expect(undoBtn).toBeEnabled();

    // Click undo
    await undoBtn.click();

    // Undo should be disabled again (no more history)
    await expect(undoBtn).toBeDisabled();
  });

  test('resizing title changes its rendered box width', async ({ page }) => {
    const scale = await getSlideScale(page);

    // Select the title element
    await page.locator('.lep-el').filter({ hasText: 'Title' }).click();

    // Read initial W from properties
    const wInput = page.locator('.lep-props label').filter({ hasText: 'W:' }).locator('input');
    const initialW = parseInt(await wInput.inputValue(), 10);

    // Drag the resize handle on the title overlay (bottom-right corner)
    // The resize handle is at bottom:-6px; right:-6px, so its center is at the parent's bottom-right edge
    const vpDw = 60;
    const vpDh = 40;
    const titleOverlay = page.locator('.slidev-page-1 .title-overlay');
    let box = await titleOverlay.boundingBox();
    if (!box) throw new Error('title-overlay not found');
    const handleCX = box.x + box.width;
    const handleCY = box.y + box.height;
    await page.mouse.move(handleCX, handleCY);
    await page.mouse.down();
    await page.mouse.move(handleCX + vpDw, handleCY + vpDh, { steps: 10 });
    await page.mouse.up();

    // The W in properties should have increased (use parseFloat, the input shows float values)
    const newW = parseFloat(await wInput.inputValue());
    expect(newW).toBeGreaterThan(initialW);

    // The rendered width of the title-overlay should reflect the new CSS width
    const box2 = await titleOverlay.boundingBox();
    if (box2) {
      const renderedW = Math.round(box2.width);
      const expectedApprox = Math.round(400 * scale);
      // After resizing 60px right, the rendered width should be larger than the initial
      expect(renderedW).toBeGreaterThan(expectedApprox);
    }
  });

  test('can save a new layout', async ({ page }) => {
    // Check "Save as new layout"
    const saveAsCheckbox = page.locator('input[type="checkbox"]');
    await expect(saveAsCheckbox).toBeChecked();

    // Enter a name
    const layoutName = `test-layout-e2e`;
    await page.locator('.lep-name-row input').fill(layoutName);

    // Click Save
    await page.locator('.lep-btn.lep-btn-primary').click();

    // Wait for the save to complete and page to navigate to the new layout
    await page.waitForTimeout(3000);

    // Verify the layout file was created with CSS variable overrides in style attribute
    let savedPath = resolve(rootLayoutsDir, `${layoutName}.vue`);
    if (!existsSync(savedPath)) {
      savedPath = resolve(e2eLayoutsDir, `${layoutName}.vue`);
    }
    expect(existsSync(savedPath)).toBe(true);
    const savedContent = readFileSync(savedPath, 'utf-8');
    expect(savedContent).toContain('style="');
    expect(savedContent).toContain('--ed-title-y:');
    expect(savedContent).toContain('--ed-title-x:');
    expect(savedContent).toContain('--ed-content-y:');
    expect(savedContent).toContain('--ed-content-x:');
  });

  test('save persists dragged content position in file', async ({ page }) => {
    // Select the content element
    const contentBtn = page.locator('.lep-el').filter({ hasText: 'Content' });
    await contentBtn.click();

    // Read initial Y from properties
    const yInput = page.locator('.lep-props label').filter({ hasText: 'Y:' }).locator('input');
    const initialY = parseInt(await yInput.inputValue(), 10);

    // Drag the content overlay down
    const vpDy = 100;
    const overlay = page.locator('.slidev-page-1 .content-overlay');
    const box = await overlay.boundingBox();
    if (!box) throw new Error('content-overlay not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + vpDy, { steps: 10 });
    await page.mouse.up();

    const newY = parseInt(await yInput.inputValue(), 10);
    expect(newY).toBeGreaterThan(initialY);

    // Uncheck "Save as new layout" to overwrite the currently active layout
    const saveAsCheckbox = page.locator('input[type="checkbox"]');
    await saveAsCheckbox.click();

    // Capture which layout the overwrite actually targets (may not be "default"
    // if a prior test switched the slide to a different saved layout)
    const requestPromise = page.waitForRequest(req => req.url().includes('/api/save-layout'));

    // Click Save
    await page.locator('.lep-btn.lep-btn-primary').click();
    await expect(page.locator('.lep-btn.lep-btn-primary')).toHaveText('Done');

    const request = await requestPromise;
    const currentLayout = JSON.parse(request.postData() || '{}').currentLayout || 'default';

    // Verify the currently active layout file contains the new content Y
    let savedPath = resolve(rootLayoutsDir, `${currentLayout}.vue`);
    if (!existsSync(savedPath)) {
      savedPath = resolve(e2eLayoutsDir, `${currentLayout}.vue`);
    }
    const savedContent = readFileSync(savedPath, 'utf-8');
    expect(savedContent).toContain(`--ed-content-y: ${newY}px;`);
  });

  test('resizing the logo with aspect lock on preserves aspect ratio', async ({ page }) => {
    const logoBtn = page.locator('.lep-el').filter({ hasText: 'Logo' });
    await logoBtn.click();

    // Elements are unlocked by default -- lock it explicitly for this test
    const lockBtn = logoBtn.locator('.lep-lock-btn');
    await expect(lockBtn).toHaveText('🔓');
    await lockBtn.click();
    await expect(lockBtn).toHaveText('🔒');

    const wInput = page.locator('.lep-props label').filter({ hasText: 'W:' }).locator('input');
    const hInput = page.locator('.lep-props label').filter({ hasText: 'H:' }).locator('input');
    const initialW = parseFloat(await wInput.inputValue());
    const initialH = parseFloat(await hInput.inputValue());
    const initialRatio = initialW / initialH;

    const logoEl = page.locator('.slidev-page-1 .logo');
    const box = await logoEl.boundingBox();
    if (!box) throw new Error('.logo not found');
    // The resize handle sits at the bottom-left (sw) corner, since the logo is right-anchored
    const handleCX = box.x;
    const handleCY = box.y + box.height;
    await page.mouse.move(handleCX, handleCY);
    await page.mouse.down();
    // Move left to grow the box (growing extends away from the fixed right edge)
    await page.mouse.move(handleCX - 40, handleCY + 20, { steps: 10 });
    await page.mouse.up();

    const newW = parseFloat(await wInput.inputValue());
    const newH = parseFloat(await hInput.inputValue());
    expect(newW).toBeGreaterThan(initialW);
    expect(newH).toBeGreaterThan(initialH);
    expect(newW / newH).toBeCloseTo(initialRatio, 1);

    // The rendered <img> should reflect the new size (no longer hardcoded to 48px)
    const img = page.locator('.slidev-page-1 .logo img');
    const imgBox = await img.boundingBox();
    expect(imgBox!.width).toBeGreaterThan(0);
  });

  test('editing W with aspect lock on recomputes H to preserve ratio', async ({ page }) => {
    const titleRow = page.locator('.lep-el').filter({ hasText: 'Title' });
    await titleRow.click();

    // Elements are unlocked by default -- lock it explicitly for this test
    const lockBtn = titleRow.locator('.lep-lock-btn');
    await expect(lockBtn).toHaveText('🔓');
    await lockBtn.click();
    await expect(lockBtn).toHaveText('🔒');

    const wInput = page.locator('.lep-props label').filter({ hasText: 'W:' }).locator('input');
    const hInput = page.locator('.lep-props label').filter({ hasText: 'H:' }).locator('input');

    const initialW = parseFloat(await wInput.inputValue());
    const initialH = parseFloat(await hInput.inputValue());
    const ratio = initialW / initialH;

    await wInput.fill(String(initialW * 2));
    await page.waitForTimeout(100);

    const newH = parseFloat(await hInput.inputValue());
    expect(newH).toBeCloseTo((initialW * 2) / ratio, 0);
  });

  test('locking an element persists across save/reload and constrains resize to be proportional', async ({ page }) => {
    const logoRow = page.locator('.lep-el').filter({ hasText: 'Logo' });
    await logoRow.click();

    // Elements are unlocked by default -- lock aspect ratio for the logo
    const lockBtn = logoRow.locator('.lep-lock-btn');
    await expect(lockBtn).toHaveText('🔓');
    await lockBtn.click();
    await expect(lockBtn).toHaveText('🔒');

    const wInput = page.locator('.lep-props label').filter({ hasText: 'W:' }).locator('input');
    const hInput = page.locator('.lep-props label').filter({ hasText: 'H:' }).locator('input');
    const initialW = parseFloat(await wInput.inputValue());
    const initialH = parseFloat(await hInput.inputValue());
    const initialRatio = initialW / initialH;

    const logoEl = page.locator('.slidev-page-1 .logo');
    const box = await logoEl.boundingBox();
    if (!box) throw new Error('.logo not found');
    const handleCX = box.x;
    const handleCY = box.y + box.height;
    await page.mouse.move(handleCX, handleCY);
    await page.mouse.down();
    // Locked: both dimensions change together, preserving the ratio
    await page.mouse.move(handleCX - 40, handleCY + 20, { steps: 10 });
    await page.mouse.up();

    const newW = parseFloat(await wInput.inputValue());
    const newH = parseFloat(await hInput.inputValue());
    expect(newW).toBeGreaterThan(initialW);
    expect(newW / newH).toBeCloseTo(initialRatio, 1);

    // Save as new layout (triggers auto-reload)
    const layoutName = `test-layout-${Date.now()}`;
    await page.locator('.lep-name-row input').fill(layoutName);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }),
      page.locator('.lep-btn.lep-btn-primary').click(),
    ]);
    await page.waitForTimeout(2000);

    let savedPath = resolve(rootLayoutsDir, `${layoutName}.vue`);
    if (!existsSync(savedPath)) {
      savedPath = resolve(e2eLayoutsDir, `${layoutName}.vue`);
    }
    const savedContent = readFileSync(savedPath, 'utf-8');
    expect(savedContent).toContain('data-aspect-locked="logo"');
    expect(savedContent).toContain(`--ed-logo-w: ${Math.round(newW)}px`);

    // Reopen the editor after reload and verify the lock state was restored
    if (!(await page.locator('button:has-text("Hide editor")').isVisible().catch(() => false))) {
      await page.locator('button:has-text("Show editor")').click();
    }
    await page.locator('button:has-text("Switch to layout tab")').click();
    await page.waitForSelector('.layout-editor-panel', { timeout: 10000 });

    const reopenedLogoRow = page.locator('.lep-el').filter({ hasText: 'Logo' });
    await expect(reopenedLogoRow.locator('.lep-lock-btn')).toHaveText('🔒');
  });

  test('resizing the red bar changes both width and height', async ({ page }) => {
    // Elements are unlocked by default, which is exactly what this test
    // needs: the bar's default ratio (980x10) is extreme, so a locked width
    // shrink would shrink height down to a couple of px, causing the corner
    // delete button and resize handle to overlap.
    const redBarRow = page.locator('.lep-el').filter({ hasText: 'Red Bar' });
    await redBarRow.click();

    const wInput = page.locator('.lep-props label').filter({ hasText: 'W:' }).locator('input');
    const hInput = page.locator('.lep-props label').filter({ hasText: 'H:' }).locator('input');

    // Shrink the bar's width only, so its resize handle isn't sitting under
    // the SideEditor panel's own resize divider at the slide's right edge
    await wInput.fill('500');
    await page.waitForTimeout(100);
    const initialW = parseFloat(await wInput.inputValue());
    const initialH = parseFloat(await hInput.inputValue());

    const redBarEl = page.locator('.slidev-page-1 .red-bar');
    const box = await redBarEl.boundingBox();
    if (!box) throw new Error('.red-bar not found');
    const handleCX = box.x + box.width;
    const handleCY = box.y + box.height;
    await page.mouse.move(handleCX, handleCY);
    await page.mouse.down();
    await page.mouse.move(handleCX + 100, handleCY + 5, { steps: 10 });
    await page.mouse.up();

    const newW = parseFloat(await wInput.inputValue());
    const newH = parseFloat(await hInput.inputValue());
    // Unlike the old hardcoded `width: 100%` bar, both dimensions can now change
    expect(newW).toBeGreaterThan(initialW);
    expect(newH).toBeGreaterThan(initialH);

    const saveAsCheckbox = page.locator('input[type="checkbox"]');
    if (!(await saveAsCheckbox.isChecked())) await saveAsCheckbox.click();
    const layoutName = `test-layout-${Date.now()}`;
    await page.locator('.lep-name-row input').fill(layoutName);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }),
      page.locator('.lep-btn.lep-btn-primary').click(),
    ]);
    await page.waitForTimeout(2000);

    let savedPath = resolve(rootLayoutsDir, `${layoutName}.vue`);
    if (!existsSync(savedPath)) {
      savedPath = resolve(e2eLayoutsDir, `${layoutName}.vue`);
    }
    const savedContent = readFileSync(savedPath, 'utf-8');
    expect(savedContent).toContain(`--ed-red-w: ${Math.round(newW)}px`);
    expect(savedContent).toContain(`--ed-red-h: ${Math.round(newH)}px`);
  });

  test('can delete an element and restore it with Undo while editing', async ({ page }) => {
    // Select the logo element
    const logoBtn = page.locator('.lep-el').filter({ hasText: 'Logo' });
    await logoBtn.click();

    // The logo should be visible
    await expect(page.locator('.slidev-page-1 .logo')).toBeVisible();

    // Click the delete button (X) on the logo element
    const deleteBtn = page.locator('.slidev-page-1 .logo .delete-btn');
    await deleteBtn.click();

    // The logo should no longer be visible, and there is no restore-bar UI
    await expect(page.locator('.slidev-page-1 .logo')).not.toBeVisible();
    await expect(page.locator('.restore-bar')).toHaveCount(0);

    // It should also disappear from the Elements list in the panel
    await expect(page.locator('.lep-el').filter({ hasText: 'Logo' })).toHaveCount(0);

    // Undo brings it back, in the slide and in the Elements list
    const undoBtn = page.locator('.lep-btn').filter({ hasText: 'Undo' });
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await expect(page.locator('.slidev-page-1 .logo')).toBeVisible();
    await expect(page.locator('.lep-el').filter({ hasText: 'Logo' })).toBeVisible();
  });

  test('deleting and saving strips the element from the layout file permanently', async ({ page }) => {
    // Select the logo element
    const logoBtn = page.locator('.lep-el').filter({ hasText: 'Logo' });
    await logoBtn.click();

    // Delete the logo
    const deleteBtn = page.locator('.slidev-page-1 .logo .delete-btn');
    await deleteBtn.click();
    await expect(page.locator('.slidev-page-1 .logo')).not.toBeVisible();

    // Save as overwrite to the currently active layout
    const saveAsCheckbox = page.locator('input[type="checkbox"]');
    await saveAsCheckbox.click();
    const requestPromise = page.waitForRequest(req => req.url().includes('/api/save-layout'));
    await page.locator('.lep-btn.lep-btn-primary').click();
    await expect(page.locator('.lep-btn.lep-btn-primary')).toHaveText('Done');
    const request = await requestPromise;
    const currentLayout = JSON.parse(request.postData() || '{}').currentLayout || 'default';

    // The saved file should no longer contain the logo's markup at all
    let savedPath = resolve(rootLayoutsDir, `${currentLayout}.vue`);
    if (!existsSync(savedPath)) {
      savedPath = resolve(e2eLayoutsDir, `${currentLayout}.vue`);
    }
    const savedContent = readFileSync(savedPath, 'utf-8');
    expect(savedContent).toContain('data-hidden="logo"');
    expect(savedContent).not.toContain('class="logo"');
    expect(savedContent).not.toContain('ed:logo:start');

    // Reload the page: the logo is gone for good, with no way to restore it
    await page.reload();
    await page.waitForSelector('.slidev-page-1 .content', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const hideBtn = page.locator('button').filter({ hasText: 'Hide editor' });
    if (await hideBtn.isVisible()) {
      await hideBtn.click();
    }

    await page.locator('button:has-text("Show editor")').click();
    await page.locator('button:has-text("Switch to layout tab")').click();
    await page.waitForSelector('.layout-editor-panel', { timeout: 30000 });

    await expect(page.locator('.slidev-page-1 .logo')).toHaveCount(0);
    await expect(page.locator('.restore-bar')).toHaveCount(0);
  });

  test('auto-reloads and renders new layout after saving', async ({ page }) => {
    // Move the title to a known position
    const titleBtn = page.locator('.lep-el').filter({ hasText: 'Title' });
    await titleBtn.click();

    const yInput = page.locator('.lep-props label').filter({ hasText: 'Y:' }).locator('input');
    const initialY = parseInt(await yInput.inputValue(), 10);
    const expectedY = initialY + 50;
    await yInput.fill(String(expectedY));
    await page.keyboard.press('Tab');

    // Save as new layout (triggers auto-reload)
    const layoutName = `test-layout-${Date.now()}`;
    await page.locator('.lep-name-row input').fill(layoutName);

    // Click Save and wait for the auto-reload navigation to complete
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }),
      page.locator('.lep-btn.lep-btn-primary').click(),
    ]);

    // Wait for content to initialize
    await page.waitForTimeout(3000);

    // The editor state persists across reload. Open to layout tab.
    if (await page.locator('button:has-text("Hide editor")').isVisible().catch(() => false)) {
      // Editor already open — ensure layout tab is active
      const layoutTab = page.locator('button:has-text("Switch to layout tab")');
      const layoutPanel = page.locator('.layout-editor-panel');
      if (!(await layoutPanel.isVisible().catch(() => false))) {
        await layoutTab.click();
      }
    } else {
      // Editor closed — open and switch to layout tab
      await page.locator('button:has-text("Show editor")').click();
      await page.locator('button:has-text("Switch to layout tab")').click();
    }
    await page.waitForSelector('.layout-editor-panel', { timeout: 10000 });

    // Check the saved layout file has the expected Y position
    let savedPath = resolve(rootLayoutsDir, `${layoutName}.vue`);
    if (!existsSync(savedPath)) {
      savedPath = resolve(e2eLayoutsDir, `${layoutName}.vue`);
    }
    expect(existsSync(savedPath)).toBe(true);
    const savedContent = readFileSync(savedPath, 'utf-8');
    expect(savedContent).toContain(`--ed-title-y: ${expectedY}px`);

    // Check the page's root style and data-styles (which layout is actually being used?)
    const rootDebug = await page.evaluate(() => {
      const el = document.querySelector('.slidev-layout');
      return {
        classList: [...(el?.classList || [])].join(','),
        style: el?.getAttribute('style') || 'no-style',
        dataStyles: el?.getAttribute('data-styles') || 'no-data-styles',
      };
    });
    console.error('DEBUG root layout:', rootDebug);

    // Select title and verify Y position was restored from the saved style attribute
    await page.locator('.lep-el').filter({ hasText: 'Title' }).click();
    const restoredY = parseInt(await yInput.inputValue(), 10);
    console.error('DEBUG Y:', { expectedY, restoredY, initialY });
    // The position should match what we saved (allowing a small rounding difference)
    expect(Math.abs(restoredY - expectedY)).toBeLessThanOrEqual(2);
  });

  test('overwrite save on a non-default layout modifies that layout file, not default.vue', async ({ page }) => {
    // First, save as a new layout so the slide is no longer using "default"
    const layoutName = `test-layout-${Date.now()}`;
    await page.locator('.lep-name-row input').fill(layoutName);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }),
      page.locator('.lep-btn.lep-btn-primary').click(),
    ]);
    await page.waitForTimeout(2000);

    let newLayoutPath = resolve(rootLayoutsDir, `${layoutName}.vue`);
    if (!existsSync(newLayoutPath)) {
      newLayoutPath = resolve(e2eLayoutsDir, `${layoutName}.vue`);
    }
    const beforeOverwrite = readFileSync(defaultLayoutPath, 'utf-8');

    // Reopen the editor on the new layout and make another change
    if (!(await page.locator('button:has-text("Hide editor")').isVisible().catch(() => false))) {
      await page.locator('button:has-text("Show editor")').click();
    }
    await page.locator('button:has-text("Switch to layout tab")').click();
    await page.waitForSelector('.layout-editor-panel', { timeout: 10000 });

    const contentBtn = page.locator('.lep-el').filter({ hasText: 'Content' });
    await contentBtn.click();
    const yInput = page.locator('.lep-props label').filter({ hasText: 'Y:' }).locator('input');
    const overwriteY = parseInt(await yInput.inputValue(), 10) + 33;
    await yInput.fill(String(overwriteY));
    await page.keyboard.press('Tab');

    // Uncheck "Save as new layout" -> overwrite whatever layout is currently active
    const saveAsCheckbox = page.locator('input[type="checkbox"]');
    await saveAsCheckbox.click();
    const requestPromise = page.waitForRequest(req => req.url().includes('/api/save-layout'));
    await page.locator('.lep-btn.lep-btn-primary').click();
    await expect(page.locator('.lep-btn.lep-btn-primary')).toHaveText('Done');
    const request = await requestPromise;
    const currentLayout = JSON.parse(request.postData() || '{}').currentLayout;

    // Regression guard: the overwrite must target the layout the slide actually uses
    expect(currentLayout).toBe(layoutName);

    // default.vue must be untouched by this overwrite
    const afterOverwrite = readFileSync(defaultLayoutPath, 'utf-8');
    expect(afterOverwrite).toBe(beforeOverwrite);

    // The active layout file must contain the new value
    const newLayoutContent = readFileSync(newLayoutPath, 'utf-8');
    expect(newLayoutContent).toContain(`--ed-content-y: ${overwriteY}px`);
  });

  test('resized width/height survive save, reload, and reopening the layout editor', async ({ page }) => {
    // Select the title and resize it
    await page.locator('.lep-el').filter({ hasText: 'Title' }).click();
    const wInput = page.locator('.lep-props label').filter({ hasText: 'W:' }).locator('input');
    const hInput = page.locator('.lep-props label').filter({ hasText: 'H:' }).locator('input');

    const titleOverlay = page.locator('.slidev-page-1 .title-overlay');
    const box = await titleOverlay.boundingBox();
    if (!box) throw new Error('title-overlay not found');
    const handleCX = box.x + box.width;
    const handleCY = box.y + box.height;
    // A delta chosen so the raw (unrounded) scaled offset is a non-integer
    await page.mouse.move(handleCX, handleCY);
    await page.mouse.down();
    await page.mouse.move(handleCX + 83, handleCY + 37, { steps: 11 });
    await page.mouse.up();

    const savedW = await wInput.inputValue();
    const savedH = await hInput.inputValue();

    // Regression guard: resize must round to integers so the saved CSS px value
    // can later be parsed back out by the `(-?\d+)px` restore regex
    expect(Number.isInteger(parseFloat(savedW))).toBe(true);
    expect(Number.isInteger(parseFloat(savedH))).toBe(true);

    // Save as new layout (triggers auto-reload)
    const layoutName = `test-layout-${Date.now()}`;
    await page.locator('.lep-name-row input').fill(layoutName);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }),
      page.locator('.lep-btn.lep-btn-primary').click(),
    ]);
    await page.waitForTimeout(2000);

    // Reopen the editor and layout tab after reload
    if (!(await page.locator('button:has-text("Hide editor")').isVisible().catch(() => false))) {
      await page.locator('button:has-text("Show editor")').click();
    }
    await page.locator('button:has-text("Switch to layout tab")').click();
    await page.waitForSelector('.layout-editor-panel', { timeout: 10000 });

    // Verify the size was actually persisted to disk
    let savedPath = resolve(rootLayoutsDir, `${layoutName}.vue`);
    if (!existsSync(savedPath)) {
      savedPath = resolve(e2eLayoutsDir, `${layoutName}.vue`);
    }
    const savedContent = readFileSync(savedPath, 'utf-8');
    expect(savedContent).toContain(`--ed-title-w: ${savedW}px`);
    expect(savedContent).toContain(`--ed-title-h: ${savedH}px`);

    // Regression guard: reopening the layout editor must show the restored size,
    // not silently fall back to the compiled-in default (400x36)
    await page.locator('.lep-el').filter({ hasText: 'Title' }).click();
    const restoredW = await wInput.inputValue();
    const restoredH = await hInput.inputValue();
    expect(parseFloat(restoredW)).toBeCloseTo(parseFloat(savedW), 0);
    expect(parseFloat(restoredH)).toBeCloseTo(parseFloat(savedH), 0);
  });

  test('content tab reflects the new layout frontmatter after saving as a new layout', async ({ page }) => {
    // Drag the title a bit so the save isn't a no-op
    await page.locator('.lep-el').filter({ hasText: 'Title' }).click();
    const titleOverlay = page.locator('.slidev-page-1 .title-overlay');
    const box = await titleOverlay.boundingBox();
    if (!box) throw new Error('title-overlay not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 40, { steps: 10 });
    await page.mouse.up();

    // Save as new layout (triggers auto-reload)
    const layoutName = `test-layout-${Date.now()}`;
    await page.locator('.lep-name-row input').fill(layoutName);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }),
      page.locator('.lep-btn.lep-btn-primary').click(),
    ]);
    await page.waitForTimeout(2000);

    // Open the editor and switch to the content tab
    if (!(await page.locator('button:has-text("Hide editor")').isVisible().catch(() => false))) {
      await page.locator('button:has-text("Show editor")').click();
    }
    await page.locator('button:has-text("Switch to content tab")').click();
    await page.waitForTimeout(1000);

    // Regression guard: the markdown shown in the content editor must reflect
    // the new "layout:" frontmatter, not the stale value from before the save
    const shownText = await page.locator('textarea').first().inputValue();
    expect(shownText).toContain(`layout: ${layoutName}`);
  });


});
