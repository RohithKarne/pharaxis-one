const { test, expect } = require('@playwright/test')

test.describe('QMS smoke', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('login')
    await expect(page.locator('input').first()).toBeVisible()
  })
})
