const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: process.env.CP_PORTAL_BASE_URL || 'http://localhost:5174/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  reporter: [['list']],

  // Without this the suite assumes a server is already up and fails as if the
  // app were broken. Skipped when CP_PORTAL_BASE_URL targets an external host.
  webServer: process.env.CP_PORTAL_BASE_URL ? undefined : {
    command: 'npm run dev:all',
    url: 'http://localhost:5174/',
    reuseExistingServer: true,
    timeout: 60000
  }
})
