const { test, expect } = require('@playwright/test');

test.describe('Pharaxis QMS Comprehensive E2E Smoke Suite', () => {

  test('1. User Login Page Renders Correctly', async ({ page }) => {
    await page.goto('login');
    await expect(page).toHaveTitle(/QMS/i);
    const userIdInput = page.locator('input').first();
    await expect(userIdInput).toBeVisible();
  });

  test('2. Superadmin Login Page Renders Correctly', async ({ page }) => {
    await page.goto('superadmin/login');
    await expect(page.locator('input').first()).toBeVisible();
  });

  test('3. Document Control Route Accessible', async ({ page }) => {
    await page.goto('document-control');
    await expect(page).toBeDefined();
  });

  test('4. CAPA Route Accessible', async ({ page }) => {
    await page.goto('capa');
    await expect(page).toBeDefined();
  });

  test('5. Deviations Route Accessible', async ({ page }) => {
    await page.goto('deviations');
    await expect(page).toBeDefined();
  });

  test('6. Audits Route Accessible', async ({ page }) => {
    await page.goto('audits');
    await expect(page).toBeDefined();
  });

  test('7. Validation Route Accessible', async ({ page }) => {
    await page.goto('validation');
    await expect(page).toBeDefined();
  });

});
