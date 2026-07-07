import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:3030',
    viewport: {
      width: 1280,
      height: 720,
    },
  },
  retries: 0,
  timeout: 60000,
  // Multiple spec files read/write the shared e2e/slides.md fixture (see
  // tests/autofit-text.spec.ts's beforeAll/afterAll). Running files in
  // parallel workers races on that file, so force strictly serial execution.
  workers: 1,
  webServer: {
    command: 'npx slidev --no-open --port 3030 e2e/slides.md',
    port: 3030,
    reuseExistingServer: true,
    timeout: 30000,
  },
});