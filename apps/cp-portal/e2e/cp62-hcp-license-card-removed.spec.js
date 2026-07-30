import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';

// CP-62 regression: the fake "HCP License Verification" card on the portal Profile
// page (hardcoded "Verified HCP" badge, fake NPI, no-op Re-Verify) was removed.
// This test provisions its own portal session (signs a dev JWT, matching the
// backend's dev fallback secret) so it needs no manual login or seed password.
//
// Guards against the card ever returning: a fabricated "verified" credential
// signal in a regulated pharma portal is a compliance/trust defect.

const PORTAL_SECRET = process.env.CP_PORTAL_JWT_SECRET || 'cp-portal-local-dev-only-change-me';

// Seeded active, email-verified HCP for the Novartis (client_id 4) portal.
const HCP = { userId: 2, clientId: 4, email: 'hcp1@novartis-demo.com', name: 'Dr. Sarah Chen', user_type: 'hcp', tv: 0 };

// Minimal HS256 JWT signer (no external dependency) — the backend verifies with
// the same secret and algorithm, so a self-signed dev token authenticates.
function signHs256(payload, secret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + 3600 };
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const data = `${head}.${b64(body)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

test.describe('CP-62 — HCP License Verification card removed', () => {
  test.beforeEach(async ({ context }) => {
    const token = signHs256(HCP, PORTAL_SECRET);
    await context.addCookies([{
      name: 'cp_portal_token', value: token, domain: 'localhost', path: '/',
    }]);
  });

  test('Profile page shows no fake license-verification control', async ({ page }) => {
    await page.goto('http://localhost:5174/portal/novartis/profile');

    // Real profile card is present (proves we are authenticated on the right page).
    await expect(page.getByText('Profile Details')).toBeVisible();

    // None of the fabricated verification elements exist.
    await expect(page.getByText('HCP License Verification')).toHaveCount(0);
    await expect(page.getByText('Verified HCP')).toHaveCount(0);
    await expect(page.getByText('NPI-1948205810')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Re-Verify' })).toHaveCount(0);
  });
});
