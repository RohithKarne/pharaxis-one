const { test, expect } = require('@playwright/test');

test.describe('CP Portal Negative & Edge Tests', () => {
  test('unauthorized admin API request fails with 401', async ({ request }) => {
    const response = await request.get('/api/admin/clients');
    expect(response.status()).toBe(401);
  });

  test('invalid submission form type fails with 400', async ({ request }) => {
    const response = await request.post('/api/portal/submit/novartis/invalid_form_type', {
      data: { name: 'Test User' },
    });
    expect(response.status()).toBe(400);
    const json = await response.json().catch(() => ({}));
    expect(json.error).toContain('Invalid form type');
  });

  test('unauthenticated portal user cannot access protected endpoints without auth token', async ({ request }) => {
    const response = await request.get('/api/portal/personal/saved/1');
    expect([401, 403, 404]).toContain(response.status());
  });

  // The API already answered 404 for an unknown client code. The screen recorded
  // that refusal into a context value nothing read, so any invented code served
  // the default portal shell — header, safety panel, chat widget and all.
  test('an unknown client code does not serve a portal', async ({ page }) => {
    await page.goto('/portal/zzzznotreal/');
    await expect(page.getByRole('heading', { name: /portal not available/i })).toBeVisible();
    await expect(page.getByText(/Welcome to the Medical Portal/i)).toHaveCount(0);
  });
});
