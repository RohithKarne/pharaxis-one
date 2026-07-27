const { test, expect } = require('@playwright/test');

/**
 * QMS E2E smoke suite.
 *
 * Rewritten 2026-07-27. Routes 3–7 previously asserted `expect(page).toBeDefined()`,
 * which can never fail — `page` is always defined — so five of the seven tests
 * verified nothing at all. Each route now has to actually load and render.
 */

// Text that must never appear on a healthy page.
const ERROR_SIGNATURES = [
  'Cannot GET',
  'Something went wrong',
  'Internal Server Error',
  'Unexpected Application Error',
  'TypeError:',
  '404 Not Found',
];

async function expectRouteRenders(page, route) {
  const response = await page.goto(route, { waitUntil: 'networkidle' });

  // A route served with a 5xx is a failure even if the SPA shell paints.
  if (response) {
    expect(response.status(), `${route} responded ${response.status()}`).toBeLessThan(500);
  }

  const body = await page.locator('body').innerText();

  for (const signature of ERROR_SIGNATURES) {
    expect(body, `${route} rendered an error containing "${signature}"`).not.toContain(signature);
  }

  // The SPA must have mounted something — not a blank shell.
  const textLines = body.split('\n').map(s => s.trim()).filter(Boolean);
  expect(
    textLines.length,
    `${route} rendered an effectively blank page (${textLines.length} text lines)`
  ).toBeGreaterThanOrEqual(3);
}

test.describe('Pharaxis QMS Comprehensive E2E Smoke Suite', () => {

  test('1. User Login Page Renders Correctly', async ({ page }) => {
    await page.goto('login');
    await expect(page).toHaveTitle(/QMS/i);
    await expect(page.locator('input').first()).toBeVisible();
  });

  test('2. Superadmin Login Page Renders Correctly', async ({ page }) => {
    await page.goto('superadmin/login');
    await expect(page.locator('input').first()).toBeVisible();
  });

  test('3. Document Control Route Accessible', async ({ page }) => {
    await expectRouteRenders(page, 'document-control');
  });

  test('4. CAPA Route Accessible', async ({ page }) => {
    await expectRouteRenders(page, 'capa');
  });

  test('5. Deviations Route Accessible', async ({ page }) => {
    await expectRouteRenders(page, 'deviations');
  });

  test('6. Audits Route Accessible', async ({ page }) => {
    await expectRouteRenders(page, 'audits');
  });

  test('7. Validation Route Accessible', async ({ page }) => {
    await expectRouteRenders(page, 'validation');
  });

});
