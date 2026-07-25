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
});
