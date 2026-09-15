import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.ts'],
    // Corpus tests boot real conversions of full decks (and optionally
    // LibreOffice), which can take a while.
    testTimeout: 120000,
  },
})
