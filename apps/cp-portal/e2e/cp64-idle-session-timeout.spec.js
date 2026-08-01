import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';

// CP-64 — HIPAA §164.312(a)(2)(iii) automatic logoff. Verifies the idle session
// timeout end-to-end at the REAL production duration (portal = 30 min) using
// Playwright's fake clock, so no real waiting and no password entry. Portal and
// admin share the same <IdleTimeout> component; this exercises the mechanism.
//
// Self-provisions a portal session (dev JWT, backend's dev fallback secret).

const PORTAL_SECRET = process.env.CP_PORTAL_JWT_SECRET || 'cp-portal-local-dev-only-change-me';
const HCP = { userId: 2, clientId: 4, email: 'hcp1@novartis-demo.com', name: 'Dr. Sarah Chen', user_type: 'hcp', tv: 0 };
const PROFILE = 'http://localhost:5174/portal/novartis/profile';
const MIN = 60 * 1000;

function signHs256(payload, secret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + 3 * 3600 };
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(body)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

test.describe('CP-64 — idle session auto-logout (HIPAA automatic logoff)', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([{ name: 'cp_portal_token', value: signHs256(HCP, PORTAL_SECRET), domain: 'localhost', path: '/' }]);
    // Deterministically authenticate: this test exercises the idle timer, not the
    // auth probe, so stub /me to always resolve the signed-in user (the app's async
    // probe otherwise races the route guard and flakes the login state).
    await page.route('**/api/portal/auth/me', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ user: { id: 2, first_name: 'Dr. Sarah', last_name: 'Chen', email: HCP.email, user_type: 'hcp' } }) }));
  });

  const dialog = (page) => page.getByRole('dialog', { name: 'Session expiring' });

  // Authenticate on the REAL clock (the idle timer arms once `user` is set), THEN
  // install the fake clock and fire one activity event so the timer re-arms on the
  // controllable clock. Avoids racing the async auth probe against a frozen clock.
  async function openAuthenticatedWithClock(page) {
    // PortalAuthGuard reads `user`, which PortalContext only sets after an async
    // /me probe; the config fetch can resolve first and bounce us to /login. That
    // race is in the app, not this feature — retry the load until the session is
    // applied rather than flaking on it.
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto(PROFILE);
      try {
        await expect(page.getByText('Profile Details')).toBeVisible({ timeout: 5000 });
        break;
      } catch {
        if (attempt === 2) throw new Error('Profile page never authenticated after 3 attempts');
      }
    }
    await expect(page.getByText('Profile Details')).toBeVisible();
    await page.clock.install();
    await page.mouse.move(200, 200); // activity → useIdleTimer reset() reschedules on the fake clock
  }

  test('warns at 28 min idle and auto-logs-out at 30 min', async ({ page }) => {
    await openAuthenticatedWithClock(page);

    await expect(dialog(page)).toHaveCount(0); // no warning while active

    await page.clock.fastForward(28 * MIN + 1000); // past the warning threshold
    await expect(dialog(page)).toBeVisible();

    await page.clock.fastForward(2 * MIN + 1000);  // past the full timeout
    await expect(page).toHaveURL(/\/portal\/novartis\/login/); // logged out
  });

  test('"Stay Logged In" resets the idle timer', async ({ page }) => {
    await openAuthenticatedWithClock(page);

    await page.clock.fastForward(28 * MIN + 1000);
    const stay = page.getByRole('button', { name: 'Stay Logged In' });
    await expect(stay).toBeVisible();
    await stay.click();
    await expect(dialog(page)).toHaveCount(0);

    // Still authenticated 20 min later (< 30 min from the reset).
    await page.clock.fastForward(20 * MIN);
    await expect(page.getByText('Profile Details')).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });
});
