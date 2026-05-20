'use strict';

const { generateTotpToken } = require('../services/twoFactorService');

const BASE_URL = 'http://127.0.0.1:3000';

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { res, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const email = `qa.2fa.smoke+${Date.now()}@example.com`;
  const newPassword = 'QaSmoke@123';
  const summary = [];

  const superLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'platform_admin', password: '__SET_SMOKE_TEST_PASSWORD__' },
  });
  assert(superLogin.res.ok, `Platform Admin login failed: ${JSON.stringify(superLogin.data)}`);
  const superToken = superLogin.data.token;
  summary.push(['Platform Admin login', 'PASS']);

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
  assert(createUser.res.ok, `Create test user failed: ${JSON.stringify(createUser.data)}`);
  const userId = createUser.data.id;
  summary.push(['Create test user', 'PASS']);

  const assignOrg = await req(`/api/admin/platform/users/${userId}/org-access`, {
    method: 'POST',
    token: superToken,
    body: { org_id: novartis.id, primary_site_id: primarySite.id, role_at_org: 'agent', site_permission: 'full' },
  });
  assert(assignOrg.res.ok, `Assign org failed: ${JSON.stringify(assignOrg.data)}`);
  summary.push(['Assign Novartis org', 'PASS']);

  const initialLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email, password: '__SET_SMOKE_TEST_PASSWORD__' },
  });
  assert(initialLogin.res.ok && initialLogin.data.passwordResetRequired, `Expected password reset flow, got: ${JSON.stringify(initialLogin.data)}`);
  summary.push(['Initial login prompts reset', 'PASS']);

  const resetPassword = await req('/api/auth/reset-password', {
    method: 'POST',
    token: initialLogin.data.token,
    body: { newPassword },
  });
  assert(resetPassword.res.ok, `Password reset failed: ${JSON.stringify(resetPassword.data)}`);
  summary.push(['Password reset', 'PASS']);

  const setupLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email, password: newPassword },
  });
  assert(setupLogin.res.ok && setupLogin.data.twoFactorSetupAvailable, `Expected optional 2FA setup, got: ${JSON.stringify(setupLogin.data)}`);
  summary.push(['2FA setup offered', 'PASS']);

  const skipSetup = await req('/api/auth/2fa/skip-setup', {
    method: 'POST',
    body: { challengeToken: setupLogin.data.challengeToken },
  });
  assert(skipSetup.res.ok && skipSetup.data.token, `Skip setup failed: ${JSON.stringify(skipSetup.data)}`);
  summary.push(['Skip optional 2FA', 'PASS']);

  const emailOtpAttempt = await req('/api/auth/2fa/send-email-code', {
    method: 'POST',
    body: { challengeToken: setupLogin.data.challengeToken },
  });
  assert(!emailOtpAttempt.res.ok, 'Email OTP unexpectedly passed without SMTP configuration.');
  summary.push(['Email OTP blocked without SMTP', 'PASS']);

  const totpLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email, password: newPassword },
  });
  assert(totpLogin.res.ok && totpLogin.data.twoFactorSetupAvailable, `Expected setup available before TOTP enrollment, got: ${JSON.stringify(totpLogin.data)}`);

  const totpSetup = await req('/api/auth/2fa/setup/totp', {
    method: 'POST',
    body: { challengeToken: totpLogin.data.challengeToken },
  });
  assert(totpSetup.res.ok && totpSetup.data.secret, `TOTP setup failed: ${JSON.stringify(totpSetup.data)}`);
  const totpCode = generateTotpToken(totpSetup.data.secret);
  const completeSetup = await req('/api/auth/2fa/verify', {
    method: 'POST',
    body: {
      challengeToken: totpLogin.data.challengeToken,
      method: 'totp',
      code: totpCode,
      rememberDevice: true,
    },
  });
  assert(completeSetup.res.ok && completeSetup.data.backupCodes?.length === 5, `TOTP enrollment failed: ${JSON.stringify(completeSetup.data)}`);
  const rememberedDeviceToken = completeSetup.data.rememberedDeviceToken;
  summary.push(['TOTP enrollment + backup codes', 'PASS']);

  const trustedBypass = await req('/api/auth/login', {
    method: 'POST',
    body: { email, password: newPassword, rememberedDeviceToken },
  });
  assert(trustedBypass.res.ok && trustedBypass.data.token && !trustedBypass.data.twoFactorRequired, `Trusted-device bypass failed: ${JSON.stringify(trustedBypass.data)}`);
  summary.push(['Trusted device bypass', 'PASS']);

  const requires2fa = await req('/api/auth/login', {
    method: 'POST',
    body: { email, password: newPassword },
  });
  assert(requires2fa.res.ok && requires2fa.data.twoFactorRequired, `Expected enrolled user to require 2FA, got: ${JSON.stringify(requires2fa.data)}`);
  summary.push(['2FA required after enrollment', 'PASS']);

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

  const reset2fa = await req(`/api/admin/platform/users/${userId}/reset-2fa`, {
    method: 'POST',
    token: superToken,
  });
  assert(reset2fa.res.ok, `Reset 2FA failed: ${JSON.stringify(reset2fa.data)}`);
  summary.push(['Platform Admin reset 2FA', 'PASS']);

  const postResetLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email, password: newPassword },
  });
  assert(postResetLogin.res.ok && postResetLogin.data.twoFactorSetupAvailable, `Expected setup available after reset, got: ${JSON.stringify(postResetLogin.data)}`);
  summary.push(['Optional setup restored after reset', 'PASS']);

  const auditRes = await req('/api/admin/platform/login-audit?limit=20', { token: superToken });
  assert(auditRes.res.ok, `Login audit fetch failed: ${JSON.stringify(auditRes.data)}`);
  const auditRows = auditRes.data.logs || [];
  const has2faAudit = auditRows.some(row => ['2fa_setup_completed', '2fa_trusted_device_bypass', '2fa_locked'].includes(row.auth_event) || /2FA/i.test(row.fail_reason || ''));
  assert(has2faAudit, 'Expected 2FA-related login audit rows not found.');
  summary.push(['Login audit contains 2FA events', 'PASS']);

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
