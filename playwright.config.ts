import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    viewport: {
      width: 1280,
      height: 720,
    },
  },
  retries: 0,
  timeout: 60000,
  // Most spec files still read/write the shared e2e/slides.md fixture
  // against the single `legacy`-project dev server (see
  // tests/autofit-text.spec.ts's beforeAll/afterAll for the convention).
  // Running files in parallel workers races on that file, so this stays
  // forced to strictly serial execution -- even though `isolated`-project
  // files no longer share any state, `workers` is a global Playwright
  // setting, not per-project, so it can't be raised until every remaining
  // shared-state file is migrated onto tests/fixtures.ts's per-worker
  // Slidev instances (see tests/fixtures.ts and CLAUDE.md's e2e notes).
  workers: 1,
  projects: [
    {
      name: 'legacy',
      testMatch: [
        'code-highlight-callouts.spec.ts',
        'image-paste.spec.ts',
        'image-position.spec.ts',
        'layout-editor.spec.ts',
        'slide-title-carryover.spec.ts',
        'text-click-to-edit.spec.ts',
        'vite-consumer-root-resolution.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3030',
      },
    },
    {
      name: 'isolated',
      // These files boot their own worker-scoped Slidev dev server via
      // tests/fixtures.ts instead of relying on the static webServer below,
      // so they need no baseURL here -- the fixture supplies one per worker.
      testMatch: [
        'autofit-text.spec.ts',
        'code-snippet-import.spec.ts',
        'code-source-links.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx slidev --no-open --port 3030 e2e/slides.md',
    port: 3030,
    reuseExistingServer: true,
    timeout: 30000,
  },
});