const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: process.env.QMS_FRONTEND_URL || 'http://localhost:3146/qms/',
    trace: 'retain-on-failure'
  },
  reporter: [['list']]
})
