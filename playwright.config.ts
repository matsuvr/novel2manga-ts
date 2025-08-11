import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/integration/e2e',
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
