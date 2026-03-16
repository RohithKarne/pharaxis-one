/**
 * admin-console.spec.js — Playwright E2E: Admin Console Tab Navigation
 */

const { test, expect } = require('@playwright/test')

test.describe('Admin Console', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.fill('input[type="email"]', 'superadmin@scimax.com')
    await page.fill('input[type="password"]', 'superadmin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')

    // Open Admin Console (new tab via window.open — navigate directly for tests)
    await page.goto('/admin.html')
  })

  test('all 9 tabs are visible', async ({ page }) => {
    const tabs = ['Service Log', 'System Activity', 'Service Dashboard',
      'Configuration', 'Escalation', 'Documents', 'Tables', 'System', 'Help']
    for (const tab of tabs) {
      await expect(page.getByRole('button', { name: tab })).toBeVisible()
    }
  })

  test('Configuration tab is active by default', async ({ page }) => {
    const configTab = page.getByRole('button', { name: 'Configuration' })
    await expect(configTab).toHaveClass(/active/)
  })

  test('clicking Service Log shows skeleton', async ({ page }) => {
    await page.getByRole('button', { name: 'Service Log' }).click()
    await expect(page.getByText('This section is under construction.')).toBeVisible()
  })

  test('Configuration tab shows inner nav and content', async ({ page }) => {
    await page.getByRole('button', { name: 'Configuration' }).click()
    await expect(page.getByText('Overview')).toBeVisible()
    await expect(page.getByText('Email Accounts')).toBeVisible()
  })
})
