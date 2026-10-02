'use strict';

// MIPM-82: brought up to the agreed 2FA behaviour (batch 1 and batch 5): the session
// is cookie-only, an organisation that turns 2FA on requires it (no skip), the
// remembered device is an httpOnly cookie, and three wrong codes lock — at sign-in
// and, since MIPM-78, during setup. TOTP codes come from utils/signInClient, which
// does not open the database (the old import of twoFactorService did, against
// whatever database .env named). It changes org 1's 2FA setting and creates a user,
// so point it at a throwaway or walk copy, never the shared dev server:
//
//   SMOKE_BASE_URL=http://127.0.0.1:3011 SMOKE_PLATFORM_EMAIL=… SMOKE_PLATFORM_PASSWORD=…
//   SMOKE_PLATFORM_TOTP_SECRET=… node backend/tests/smoke-2fa.js

const { signIn, fetchPost, totpCode, sessionTokenFromSetCookie } = require('../utils/signInClient');

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';

async function req(path, { method = 'GET', token, body, cookie } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return { res, data, setCookie, session: sessionTokenFromSetCookie(setCookie) };
}

function cookieNamed(setCookie, prefix) {
  const line = (setCookie || []).find((c) => c.startsWith(prefix));
  return line ? line.split(';')[0] : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const email = `qa.2fa.smoke+${Date.now()}@example.com`;
  const newPassword = 'QaSmoke@12345!';
  const summary = [];

  const platform = await signIn(fetchPost(BASE_URL), {
    email: process.env.SMOKE_PLATFORM_EMAIL || 'platform_admin',
    password: process.env.SMOKE_PLATFORM_PASSWORD || '__SET_SMOKE_TEST_PASSWORD__',
    totpSecret: process.env.SMOKE_PLATFORM_TOTP_SECRET,
  });
  assert(platform.token, `Platform Admin sign-in failed at ${platform.step}: ${platform.error || platform.status}`);
  const superToken = platform.token;
  summary.push(['Platform Admin sign-in', 'PASS']);

  const orgsRes = await req('/api/admin/platform/orgs-for-assignment', { token: superToken });
  assert(orgsRes.res.ok, `Load orgs-for-assignment failed: ${JSON.stringify(orgsRes.data)}`);
  const novartis = (orgsRes.data.orgs || []).find(o => o.id === 1 || o.name === 'Novartis');
  assert(novartis, 'Novartis org not found.');
  const primarySite = (novartis.sites || [])[0];
  assert(primarySite, 'No active Novartis site available for smoke test.');
  summary.push(['Novartis org lookup', 'PASS']);

  const enable2fa = await req('/api/admin/platform/orgs/1', {
    method: 'PUT',
    token: superToken,
    body: {
      name: 'Novartis',
      is_active: 1,
      session_timeout_minutes: 30,
      two_factor_enabled: true,
      two_factor_methods: 'email,totp',
      two_factor_remember_days: 7,
    },
  });
  assert(enable2fa.res.ok, `Enable org 2FA failed: ${JSON.stringify(enable2fa.data)}`);
  summary.push(['Enable Novartis 2FA', 'PASS']);

  const createUser = await req('/api/admin/platform/users/create', {
    method: 'POST',
    token: superToken,
    body: { name: 'QA 2FA Smoke', email, role: 'agent' },
  });
  assert(createUser.res.ok && createUser.data.temporary_password, `Create test user failed: ${JSON.stringify(createUser.data)}`);
  const userId = createUser.data.id;
  summary.push(['Create test user (one-time password)', 'PASS']);

  const assignOrg = await req(`/api/admin/platform/users/${userId}/org-access`, {
    method: 'POST',
    token: superToken,
    body: { org_id: novartis.id, primary_site_id: primarySite.id, role_at_org: 'agent', site_permission: 'full' },
  });
  assert(assignOrg.res.ok, `Assign org failed: ${JSON.stringify(assignOrg.data)}`);
  summary.push(['Assign Novartis org', 'PASS']);

  const initialLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email, password: createUser.data.temporary_password },
  });
  assert(initialLogin.res.ok && initialLogin.data.passwordResetRequired && initialLogin.session,
    `Expected the forced password change with a reset-only session, got: ${JSON.stringify(initialLogin.data)}`);
  summary.push(['First sign-in forces a new password', 'PASS']);

  const resetOnly = await req('/api/cases?limit=1', { token: initialLogin.session });
  assert(resetOnly.res.status === 403, `A reset-only session reached the case list: ${resetOnly.res.status}`);
  summary.push(['Reset-only session can do nothing else', 'PASS']);

  const resetPassword = await req('/api/auth/reset-password', {
    method: 'POST',
    token: initialLogin.session,
    body: { newPassword },
  });
  assert(resetPassword.res.ok, `Password reset failed: ${JSON.stringify(resetPassword.data)}`);
  summary.push(['Password reset', 'PASS']);

  const setupLogin = await req('/api/auth/login', { method: 'POST', body: { email, password: newPassword } });
  assert(setupLogin.res.ok && setupLogin.data.twoFactorSetupRequired && !setupLogin.session,
    `Expected required 2FA setup and no session yet, got: ${JSON.stringify(setupLogin.data)}`);
  summary.push(['2FA setup required (org has 2FA on)', 'PASS']);

  const skipSetup = await req('/api/auth/2fa/skip-setup', {
    method: 'POST',
    body: { challengeToken: setupLogin.data.challengeToken },
  });
  assert(!skipSetup.res.ok && !skipSetup.session, `Skipping required 2FA was allowed: ${JSON.stringify(skipSetup.data)}`);
  summary.push(['Skipping required 2FA is refused', 'PASS']);

  const totpSetup = await req('/api/auth/2fa/setup/totp', {
    method: 'POST',
    body: { challengeToken: setupLogin.data.challengeToken },
  });
  assert(totpSetup.res.ok && totpSetup.data.secret && !totpSetup.data.qrUrl,
    `TOTP setup failed or still points at an outside QR service: ${JSON.stringify(totpSetup.data)}`);
  summary.push(['TOTP setup (QR drawn locally — no outside address)', 'PASS']);

  const completeSetup = await req('/api/auth/2fa/verify', {
    method: 'POST',
    body: { challengeToken: setupLogin.data.challengeToken, method: 'totp', code: totpCode(totpSetup.data.secret), rememberDevice: true },
  });
  const trustedCookie = cookieNamed(completeSetup.setCookie, `mims_tdv_${userId}=`);
  assert(completeSetup.res.ok && completeSetup.data.backupCodes?.length === 5 && completeSetup.session && trustedCookie,
    `TOTP enrollment failed: ${JSON.stringify(completeSetup.data)}`);
  summary.push(['TOTP enrollment, backup codes, remembered device', 'PASS']);

  const trustedBypass = await req('/api/auth/login', { method: 'POST', body: { email, password: newPassword }, cookie: trustedCookie });
  assert(trustedBypass.res.ok && trustedBypass.session && !trustedBypass.data.twoFactorRequired,
    `Remembered device did not sign in without a code: ${JSON.stringify(trustedBypass.data)}`);
  summary.push(['Remembered device skips the code', 'PASS']);

  const requires2fa = await req('/api/auth/login', { method: 'POST', body: { email, password: newPassword } });
  assert(requires2fa.res.ok && requires2fa.data.twoFactorRequired && !requires2fa.session,
    `Expected an enrolled user to need a code, got: ${JSON.stringify(requires2fa.data)}`);
  summary.push(['Code required on another device', 'PASS']);

  for (let i = 1; i <= 3; i += 1) {
    const wrong = await req('/api/auth/2fa/verify', {
      method: 'POST',
      body: { challengeToken: requires2fa.data.challengeToken, method: 'totp', code: '000000', rememberDevice: false },
    });
    if (i < 3) {
      assert(wrong.res.status === 401, `Expected failed 2FA on attempt ${i}, got: ${wrong.res.status}`);
    } else {
      assert(wrong.res.status === 423, `Expected lock on third attempt, got: ${wrong.res.status}`);
    }
  }
  summary.push(['Lock after 3 invalid 2FA attempts', 'PASS']);

  const reset2fa = await req(`/api/admin/platform/users/${userId}/reset-2fa`, { method: 'POST', token: superToken });
  assert(reset2fa.res.ok, `Reset 2FA failed: ${JSON.stringify(reset2fa.data)}`);
  summary.push(['Platform Admin reset 2FA', 'PASS']);

  const postResetLogin = await req('/api/auth/login', { method: 'POST', body: { email, password: newPassword } });
  assert(postResetLogin.res.ok && postResetLogin.data.twoFactorSetupRequired,
    `Expected setup to be required again after reset, got: ${JSON.stringify(postResetLogin.data)}`);
  summary.push(['Setup required again after reset', 'PASS']);

  // MIPM-78: three wrong setup codes close that sign-in's setup.
  const sendCode = await req('/api/auth/2fa/setup/totp', { method: 'POST', body: { challengeToken: postResetLogin.data.challengeToken } });
  assert(sendCode.res.ok, `Setup could not start: ${JSON.stringify(sendCode.data)}`);
  let last;
  for (let i = 1; i <= 3; i += 1) {
    last = await req('/api/auth/2fa/verify', {
      method: 'POST',
      body: { challengeToken: postResetLogin.data.challengeToken, method: 'totp', code: '000000' },
    });
  }
  assert(last.res.status === 423 && last.data.restart, `Expected setup to close after 3 wrong codes, got: ${last.res.status}`);
  const afterClose = await req('/api/auth/2fa/setup/totp', { method: 'POST', body: { challengeToken: postResetLogin.data.challengeToken } });
  assert(afterClose.res.status === 423, `A closed setup started again: ${afterClose.res.status}`);
  summary.push(['Setup closes after 3 wrong codes (MIPM-78)', 'PASS']);

  const auditRes = await req('/api/admin/platform/login-audit?limit=50', { token: superToken });
  assert(auditRes.res.ok, `Login audit fetch failed: ${JSON.stringify(auditRes.data)}`);
  const events = new Set((auditRes.data.logs || []).map(row => row.auth_event));
  for (const ev of ['2fa_setup_completed', '2fa_locked', '2fa_setup_locked']) {
    assert(events.has(ev), `Expected login audit event ${ev} not found.`);
  }
  summary.push(['Login audit has setup, lock and setup-closed events', 'PASS']);

  console.log('\n2FA smoke summary');
  for (const [name, status] of summary) {
    console.log(`- ${status}: ${name}`);
  }
  console.log(`\nTest user: ${email}`);
})().catch(err => {
  console.error('\n2FA smoke failed');
  console.error(err);
  process.exit(1);
});
