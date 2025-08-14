import { defineConfig, devices } from '@playwright/test'

// Playwright E2E tests are currently disabled
// The old integration tests have been migrated to new unit-style integration tests
// If E2E tests are needed in the future, create them in a new location
export default defineConfig({
  testDir: './src/__tests__/e2e', // Non-existent directory to disable tests
  timeout: 30_000,
  use: {
    baseURL: process.env.API_BASE_URL || 'http://localhost:3000/api',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
