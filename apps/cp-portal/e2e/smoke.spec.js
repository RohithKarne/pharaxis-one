const { test, expect } = require('@playwright/test')

test.describe('CP Portal smoke', () => {
  test('admin login page renders', async ({ page }) => {
    await page.goto('admin/login')
    await expect(page.locator('input[type="text"], input[type="email"]')).toHaveCount(1)
    await expect(page.locator('input[type="password"]')).toHaveCount(1)
  })

  test('unknown route stays inside the SPA shell', async ({ page }) => {
    await page.goto('admin/__smoke_unknown__')
    await expect(page.locator('body')).not.toContainText('Cannot GET')
  })
})
