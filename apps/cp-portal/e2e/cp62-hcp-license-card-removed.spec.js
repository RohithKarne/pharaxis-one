import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { seededHcp } from './seedSession.js';

// CP-62 regression: the fake "HCP License Verification" card on the portal Profile
// page (hardcoded "Verified HCP" badge, fake NPI, no-op Re-Verify) was removed.
// This test provisions its own portal session by signing a portal JWT, so it needs
// no manual login or seed password.
//
// Guards against the card ever returning: a fabricated "verified" credential
// signal in a regulated pharma portal is a compliance/trust defect.

// Resolve the portal JWT secret exactly the way the backend does, so the token we
// sign is the token it will accept. backend/server.js loads backend/.env through
// dotenv, and backend/middleware/auth.js then reads process.env.CP_PORTAL_JWT_SECRET
// with a dev fallback. dotenv never overwrites a real env var, hence this order:
//   1. CP_PORTAL_JWT_SECRET from the environment
//   2. CP_PORTAL_JWT_SECRET in backend/.env  (Playwright does not inherit that file)
//   3. the dev fallback, for a checkout that has configured no secret at all
// Reading step 2 is what keeps the spec green on a configured machine; without it
// we sign with the fallback, the backend rejects the cookie, and the run fails on
// the login page looking like a missing element.
const PORTAL_ENV_FILE = path.resolve(__dirname, '../backend/.env');
const DEV_FALLBACK_SECRET = 'cp-portal-local-dev-only-change-me';

// Minimal .env reader — cp-portal has no dotenv of its own and this must not add a
// dependency. Mirrors the dotenv behaviour that matters here: skips comments and
// blanks, tolerates an `export ` prefix, unwraps matching quotes, drops trailing
// inline comments on unquoted values, and lets a later assignment win.
function readEnvValue(file, key) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return ''; // no .env (fresh checkout) — caller falls back
  }
  let value = '';
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || match[1] !== key) continue;
    let v = match[2].trim();
    const quote = v[0];
    if (v.length > 1 && (quote === '"' || quote === "'") && v.endsWith(quote)) {
      v = v.slice(1, -1);
    } else {
      v = v.replace(/\s+#.*$/, '').trim();
    }
    value = v;
  }
  return value;
}

const PORTAL_SECRET =
  process.env.CP_PORTAL_JWT_SECRET ||
  readEnvValue(PORTAL_ENV_FILE, 'CP_PORTAL_JWT_SECRET') ||
  DEV_FALLBACK_SECRET;

// The active, email-verified HCP that backend/tests/seed-e2e.js creates.
const { clientCode: CLIENT, session: HCP } = seededHcp();

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
  test.beforeEach(async ({ context, page, baseURL }) => {
    const token = signHs256(HCP, PORTAL_SECRET);
    await context.addCookies([{
      name: 'cp_portal_token', value: token, domain: new URL(baseURL).hostname, path: '/',
    }]);

    // The portal now keeps a server-side record of every session (sign-in
    // Tier 1, 12 Oct 2026), so a self-signed token alone reads as signed out.
    // This spec is about the Profile screen, not sign-in: answer the session
    // probe here, as cp64 does.
    await page.route('**/api/portal/auth/me', route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ user: { id: HCP.userId, first_name: 'Sarah', last_name: 'Chen', email: HCP.email, user_type: 'hcp' }, submissions: [] }) }));
  });

  test('Profile page shows no fake license-verification control', async ({ page }) => {
    // PortalAuthGuard reads `user`, set only after an async /me probe; the config
    // fetch can win that race and bounce to /login. Retry the load so this test
    // measures the license card, not that pre-existing app race.
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto(`portal/${CLIENT}/profile`);
      try {
        await expect(page.getByText('Profile Details')).toBeVisible({ timeout: 5000 });
        break;
      } catch {
        if (attempt === 2) throw new Error('Profile page never authenticated after 3 attempts');
      }
    }

    // Real profile card is present (proves we are authenticated on the right page).
    await expect(page.getByText('Profile Details')).toBeVisible();

    // None of the fabricated verification elements exist.
    await expect(page.getByText('HCP License Verification')).toHaveCount(0);
    await expect(page.getByText('Verified HCP')).toHaveCount(0);
    await expect(page.getByText('NPI-1948205810')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Re-Verify' })).toHaveCount(0);
  });
});
