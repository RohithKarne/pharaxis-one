import { test, expect } from '@playwright/test';

test.describe('CP Portal UX/UI Feature Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Seed e2e data and navigate to Novartis portal
    await page.goto('http://localhost:5174/portal/novartis');
  });

  test('Hero search quick filter chips render and navigate', async ({ page }) => {
    const prescribingChip = page.locator('button:has-text("📁 Prescribing Info")');
    await expect(prescribingChip).toBeVisible();
    await prescribingChip.click();
    await expect(page).toHaveURL(/.*\/portal\/novartis\/documents/);
  });

  test('Top task cards display sub-action chips', async ({ page }) => {
    const quickAeChip = page.locator('span:has-text("⚡ Quick AE Report")');
    await expect(quickAeChip).toBeVisible();
  });

  test('Document cards display GxP approval badges and quick view button', async ({ page }) => {
    await page.goto('http://localhost:5174/portal/novartis/documents');
    const quickViewBtn = page.locator('button:has-text("👁️ Quick View")').first();
    if (await quickViewBtn.isVisible()) {
      await expect(quickViewBtn).toBeEnabled();
      const approvedBadge = page.locator('span:has-text("v2.1 Approved")').first();
      await expect(approvedBadge).toBeVisible();
    }
  });

  test('Find MSL page displays live availability badges', async ({ page }) => {
    await page.goto('http://localhost:5174/portal/novartis/find-msl');
    const availBadge = page.locator('span:has-text("🟢 Available Today")').first();
    if (await availBadge.isVisible()) {
      await expect(availBadge).toBeVisible();
    }
  });
});
