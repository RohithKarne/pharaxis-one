// @ts-check
const { defineConfig, devices } = require('@playwright/test')

// AI_AGENT_BASE_URL points the suite at an already-running stack — used by the
// test console and by anyone running against an isolated test database.
// Without it the suite starts the normal dev servers.
const BASE_URL = process.env.AI_AGENT_BASE_URL || 'http://localhost:5175/ai-agent/'

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.AI_AGENT_BASE_URL ? undefined : {
    command: 'npm run dev:all',
    url: 'http://localhost:5175/ai-agent/',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
