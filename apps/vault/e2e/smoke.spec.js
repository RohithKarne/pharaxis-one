const { test, expect } = require('@playwright/test')

test.describe('Vault smoke', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('input').first()).toBeVisible()
  })
})
