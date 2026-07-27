// @ts-check
const { defineConfig, devices } = require('@playwright/test')

// Set MIMS_BASE_URL (with MIMS_BACKEND_URL) to run against an already-running
// isolated stack — e.g. a backend on the pharaxis_mims_test database. Without
// it the suite starts the normal dev servers, which point at the dev database.
const BASE_URL = process.env.MIMS_BASE_URL || 'http://localhost:5173'

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.MIMS_BASE_URL ? undefined : {
    command: 'npm run dev:all',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
