const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: process.env.CP_PORTAL_BASE_URL || 'http://localhost:5174/cp-portal/',
    trace: 'retain-on-failure'
  },
  reporter: [['list']]
})
