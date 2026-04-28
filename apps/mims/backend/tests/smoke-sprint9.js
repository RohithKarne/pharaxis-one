'use strict';

process.stdout.write('Sprint 9 smoke test starting...\n');

/**
 * smoke-sprint9.js — Sprint 9 QA smoke tests
 * Tests: per-org roles, org switch JWT, audit log, user search,
 *        session timeout, notifications, login audit IP/location,
 *        org logo endpoint, alert email template, site edit, regression.
 *
 * Run: node mims/backend/tests/smoke-sprint9.js
 * Requires: server running on http://127.0.0.1:3000
 */

const BASE_URL = 'http://127.0.0.1:3000';

async function req(path, { method = 'GET', token, body, form } = {}) {
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
  return { res, data, status: res.status };
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function pass(name, summary) {
  summary.push({ name, result: 'PASS', note: '' });
}

function fail(name, summary, reason) {
  summary.push({ name, result: 'FAIL', note: reason });
}

function printResults(summary, testEmail, testUserId) {
  const passed = summary.filter(r => r.result === 'PASS').length;
  const failed = summary.filter(r => r.result === 'FAIL').length;
  const skipped = summary.filter(r => r.result === 'SKIP').length;
  console.log('\n══════════════════════════════════════════════════');
  console.log(' SPRINT 9 — QA SMOKE TEST RESULTS');
  console.log('══════════════════════════════════════════════════');
  for (const { name, result, note } of summary) {
    const icon = result === 'PASS' ? '✅' : result === 'SKIP' ? '⏭ ' : '❌';
    console.log(`  ${icon}  ${result}  ${name}${note ? `  [${note}]` : ''}`);
  }
  console.log('──────────────────────────────────────────────────');
  console.log(`  TOTAL: ${passed} PASS  |  ${failed} FAIL  |  ${skipped} SKIP  |  ${summary.length} TOTAL`);
  console.log('══════════════════════════════════════════════════\n');
  if (testEmail) console.log(`  Test user: ${testEmail} (id: ${testUserId || 'N/A'})`);
  console.log('');
  if (failed > 0) process.exitCode = 1;
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  const summary = [];
  const testEmail = `qa.sprint9+${Date.now()}@example.com`;
  let testUserId, orgAToken, orgBToken;

  // ─── 0. Server health ─────────────────────────────────────────────────────
  try {
    const { res } = await req('/api/health');
    assert(res.ok, `Health check failed: ${res.status}`);
    pass('T00 — Server health check', summary);
  } catch (e) { fail('T00 — Server health check', summary, e.message); }

  // ─── 1. Superadmin login ──────────────────────────────────────────────────
  let superToken;
  try {
    const { res, data } = await req('/api/auth/login', {
      method: 'POST',
      body: { email: 'superadmin', password: '__SET_SMOKE_TEST_PASSWORD__' },
    });
    assert(res.ok && data.token, `Superadmin login failed: ${JSON.stringify(data)}`);
    superToken = data.token;
    pass('T01 — Superadmin login', summary);
  } catch (e) { fail('T01 — Superadmin login', summary, e.message); return printResults(summary, testEmail, testUserId); }

  // ─── 2. Create test user ──────────────────────────────────────────────────
  try {
    const { res, data } = await req('/api/superadmin/users/create', {
      method: 'POST',
      token: superToken,
      body: { name: 'Sprint9 Test User', email: testEmail, role: 'agent' },
    });
    assert(res.ok && data.id, `Create user failed: ${JSON.stringify(data)}`);
    testUserId = data.id;
    pass('T02 — Create test user', summary);
  } catch (e) { fail('T02 — Create test user', summary, e.message); return printResults(summary, testEmail, testUserId); }

  // ─── 3. Fetch orgs — get Novartis (id 1) and Vanaja Review Co. (id 26) ───
  let orgA, orgAsite, orgB, orgBsite;
  try {
    const { res, data } = await req('/api/superadmin/orgs-for-assignment', { token: superToken });
    assert(res.ok, `orgs-for-assignment failed: ${JSON.stringify(data)}`);
    orgA = (data.orgs || []).find(o => o.id === 1);
    orgB = (data.orgs || []).find(o => o.id === 26);
    assert(orgA, 'Novartis (id 1) not found');
    assert(orgB, 'Vanaja Review Co. (id 26) not found');
    orgAsite = (orgA.sites || [])[0];
    orgBsite = (orgB.sites || [])[0];
    assert(orgAsite, 'Novartis has no active site');
    assert(orgBsite, 'Vanaja Review Co. has no active site');
    pass('T03 — Fetch orgs (Novartis + Vanaja Review Co.)', summary);
  } catch (e) { fail('T03 — Fetch orgs (Novartis + Vanaja Review Co.)', summary, e.message); return printResults(summary, testEmail, testUserId); }

  // ─── 4. Assign test user to Org A as admin, Org B as agent ───────────────
  try {
    const r1 = await req(`/api/superadmin/users/${testUserId}/org-access`, {
      method: 'POST',
      token: superToken,
      body: { org_id: orgA.id, primary_site_id: orgAsite.id, role_at_org: 'admin', site_permission: 'full' },
    });
    assert(r1.res.ok, `Assign Org A failed: ${JSON.stringify(r1.data)}`);

    const r2 = await req(`/api/superadmin/users/${testUserId}/org-access`, {
      method: 'POST',
      token: superToken,
      body: { org_id: orgB.id, primary_site_id: orgBsite.id, role_at_org: 'agent', site_permission: 'read' },
    });
    assert(r2.res.ok, `Assign Org B failed: ${JSON.stringify(r2.data)}`);
    pass('T04 — Assign user to 2 orgs (admin in Novartis, agent in PharmaTest)', summary);
  } catch (e) { fail('T04 — Assign user to 2 orgs', summary, e.message); return printResults(summary, testEmail, testUserId); }

  // ─── 5. Initial login — password reset required ───────────────────────────
  let loginToken;
  try {
    const { res, data } = await req('/api/auth/login', {
      method: 'POST',
      body: { email: testEmail, password: '__SET_SMOKE_TEST_PASSWORD__' },
    });
    assert(res.ok && data.passwordResetRequired && data.token, `Expected password reset: ${JSON.stringify(data)}`);
    loginToken = data.token;
    pass('T05 — Initial login prompts password reset', summary);
  } catch (e) { fail('T05 — Initial login prompts password reset', summary, e.message); return printResults(summary, testEmail, testUserId); }

  // ─── 6. Reset password ────────────────────────────────────────────────────
  const testPass = 'Sprint9@QA';
  try {
    const { res, data } = await req('/api/auth/reset-password', {
      method: 'POST',
      token: loginToken,
      body: { newPassword: testPass },
    });
    assert(res.ok, `Password reset failed: ${JSON.stringify(data)}`);
    pass('T06 — Password reset completed', summary);
  } catch (e) { fail('T06 — Password reset completed', summary, e.message); return printResults(summary, testEmail, testUserId); }

  // ─── 7. Per-org role — login response has roleAtOrg per org ──────────────
  // Novartis has 2FA enabled, so login may return twoFactorSetupAvailable=true.
  // If so, skip 2FA setup (optional) to get a real session token.
  let mainToken, allOrgs;
  try {
    const loginRes = await req('/api/auth/login', {
      method: 'POST',
      body: { email: testEmail, password: testPass },
    });
    assert(loginRes.res.ok, `Login after reset failed: status ${loginRes.status}`);

    let data = loginRes.data;

    // Handle optional 2FA setup flow — skip it to get a real token
    if (data.twoFactorSetupAvailable && !data.token) {
      const skipRes = await req('/api/auth/2fa/skip-setup', {
        method: 'POST',
        body: { challengeToken: data.challengeToken },
      });
      assert(skipRes.res.ok && skipRes.data.token, `2FA skip failed: ${JSON.stringify(skipRes.data)}`);
      // allOrgs lives in the challenge token payload
      const challengeParts = (data.challengeToken || '').split('.');
      if (challengeParts.length === 3) {
        try {
          const cp = JSON.parse(Buffer.from(challengeParts[1], 'base64url').toString());
          allOrgs = cp.allOrgs || [];
        } catch (_) {}
      }
      mainToken = skipRes.data.token;
      allOrgs = allOrgs || skipRes.data.allOrgs || [];
    } else {
      mainToken = data.token;
      allOrgs = data.allOrgs || [];
    }

    assert(mainToken, `No main token after login/2fa-skip flow`);

    const orgAEntry = allOrgs.find(o => o.orgId === orgA.id || o.orgId === String(orgA.id));
    const orgBEntry = allOrgs.find(o => o.orgId === orgB.id || o.orgId === String(orgB.id));
    assert(orgAEntry, `Org A not found in allOrgs: ${JSON.stringify(allOrgs)}`);
    assert(orgBEntry, `Org B not found in allOrgs: ${JSON.stringify(allOrgs)}`);
    assert(orgAEntry.roleAtOrg === 'admin', `Expected admin for Org A, got: ${orgAEntry.roleAtOrg}`);
    assert(orgBEntry.roleAtOrg === 'agent', `Expected agent for Org B, got: ${orgBEntry.roleAtOrg}`);
    pass('T07 — Per-org role: allOrgs contains correct roleAtOrg per org', summary);
  } catch (e) { fail('T07 — Per-org role: allOrgs contains correct roleAtOrg', summary, e.message); }

  // ─── 8. JWT carries role_at_org for active org ───────────────────────────
  try {
    const parts = mainToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    assert(payload.role === 'admin', `JWT role should be admin (active org = Novartis), got: ${payload.role}`);
    pass('T08 — JWT carries role_at_org (admin) for active org on login', summary);
  } catch (e) { fail('T08 — JWT carries role_at_org for active org', summary, e.message); }

  // ─── 9. Org switch re-issues JWT with new role ───────────────────────────
  try {
    const { res, data } = await req('/api/auth/switch-org', {
      method: 'POST',
      token: mainToken,
      body: { orgId: orgB.id },
    });
    assert(res.ok && data.token, `switch-org failed: ${JSON.stringify(data)}`);
    orgBToken = data.token;
    const parts = orgBToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    assert(payload.role === 'agent', `After switch to Org B, JWT role should be agent, got: ${payload.role}`);
    assert(Number(payload.orgId) === orgB.id, `JWT orgId mismatch: expected ${orgB.id}, got ${payload.orgId}`);
    pass('T09 — Org switch re-issues JWT with agent role for Org B', summary);
  } catch (e) { fail('T09 — Org switch re-issues JWT with new role', summary, e.message); }

  // ─── 10. Org switch back to Org A — role returns to admin ────────────────
  try {
    const { res, data } = await req('/api/auth/switch-org', {
      method: 'POST',
      token: orgBToken,
      body: { orgId: orgA.id },
    });
    assert(res.ok && data.token, `switch back to Org A failed: ${JSON.stringify(data)}`);
    orgAToken = data.token;
    const parts = orgAToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    assert(payload.role === 'admin', `After switch back to Org A, role should be admin, got: ${payload.role}`);
    pass('T10 — Org switch back to Org A restores admin role', summary);
  } catch (e) { fail('T10 — Org switch back to Org A restores admin role', summary, e.message); }

  // ─── 11. Login audit: org_switch event logged ────────────────────────────
  try {
    const { res, data } = await req('/api/superadmin/login-audit?limit=50', { token: superToken });
    assert(res.ok, `Login audit fetch failed: ${JSON.stringify(data)}`);
    const logs = data.logs || [];
    const switchLog = logs.find(l =>
      l.auth_event === 'org_switch' &&
      (l.user_id === testUserId || l.user_name === 'Sprint9 Test User')
    );
    assert(switchLog, `No org_switch audit entry found for test user. Recent events: ${JSON.stringify(logs.slice(0,5).map(l=>({event:l.auth_event,user:l.user_name})))}`);
    pass('T11 — Login audit: org_switch event logged', summary);
  } catch (e) { fail('T11 — Login audit: org_switch event logged', summary, e.message); }

  // ─── 12. Login audit: ip_address + location columns present ──────────────
  try {
    const { res, data } = await req('/api/superadmin/login-audit?limit=20', { token: superToken });
    assert(res.ok, `Audit fetch failed`);
    const logs = data.logs || [];
    assert(logs.length > 0, 'No audit logs returned');
    const sample = logs[0];
    assert('ip_address' in sample, `ip_address column missing from audit row: ${Object.keys(sample).join(', ')}`);
    assert('location' in sample, `location column missing from audit row: ${Object.keys(sample).join(', ')}`);
    // For localhost, location should be 'localhost' or null — both acceptable
    pass('T12 — Login audit: ip_address + location columns present', summary);
  } catch (e) { fail('T12 — Login audit: ip_address + location columns', summary, e.message); }

  // ─── 13. User search — SuperAdmin users list ─────────────────────────────
  try {
    const { res, data } = await req('/api/superadmin/all-users?search=Sprint9', { token: superToken });
    assert(res.ok, `User search failed: ${JSON.stringify(data)}`);
    const users = data.users || data || [];
    const found = Array.isArray(users) && users.some(u =>
      (u.name || '').toLowerCase().includes('sprint9') ||
      (u.email || '').toLowerCase().includes('sprint9')
    );
    assert(found, `Sprint9 test user not found in search results. Got: ${JSON.stringify(users.slice(0,3))}`);
    pass('T13 — User search: filter by name returns Sprint9 user', summary);
  } catch (e) { fail('T13 — User search: filter by name', summary, e.message); }

  // ─── 14. Session timeout config — GET ────────────────────────────────────
  // Config is nested under data.config; key is superadmin_session_timeout_minutes
  let currentTimeout;
  try {
    const { res, data } = await req('/api/superadmin/config', { token: superToken });
    assert(res.ok, `Config GET failed: ${JSON.stringify(data)}`);
    const cfg = data.config || data;
    assert(cfg.superadmin_session_timeout_minutes !== undefined,
      `superadmin_session_timeout_minutes missing from config: ${JSON.stringify(data)}`);
    currentTimeout = Number(cfg.superadmin_session_timeout_minutes);
    pass(`T14 — Session timeout config GET (current: ${currentTimeout} min)`, summary);
  } catch (e) { fail('T14 — Session timeout config GET', summary, e.message); }

  // ─── 15. Session timeout config — PUT ────────────────────────────────────
  try {
    const newTimeout = currentTimeout === 30 ? 60 : 30;
    const { res, data } = await req('/api/superadmin/config', {
      method: 'PUT',
      token: superToken,
      body: { superadmin_session_timeout_minutes: newTimeout },
    });
    assert(res.ok, `Config PUT failed: ${JSON.stringify(data)}`);
    // Verify persisted
    const verify = await req('/api/superadmin/config', { token: superToken });
    assert(verify.res.ok, 'Config re-fetch failed');
    const verifyCfg = verify.data.config || verify.data;
    assert(
      Number(verifyCfg.superadmin_session_timeout_minutes) === newTimeout,
      `Timeout not persisted: expected ${newTimeout}, got ${verifyCfg.superadmin_session_timeout_minutes}`
    );
    // Restore original
    await req('/api/superadmin/config', {
      method: 'PUT', token: superToken,
      body: { superadmin_session_timeout_minutes: currentTimeout },
    });
    pass(`T15 — Session timeout config PUT + persist (set to ${newTimeout}, restored to ${currentTimeout})`, summary);
  } catch (e) { fail('T15 — Session timeout config PUT + persist', summary, e.message); }

  // ─── 16. Alert email template — GET ──────────────────────────────────────
  let alertTemplate;
  try {
    const { res, data } = await req('/api/superadmin/alert-email-template', { token: superToken });
    assert(res.ok, `Alert template GET failed: ${JSON.stringify(data)}`);
    assert(data.subject !== undefined, `subject field missing: ${JSON.stringify(data)}`);
    assert(data.body !== undefined, `body field missing: ${JSON.stringify(data)}`);
    alertTemplate = data;
    pass('T16 — Alert email template GET returns subject + body', summary);
  } catch (e) { fail('T16 — Alert email template GET', summary, e.message); }

  // ─── 17. Alert email template — PUT + persist ────────────────────────────
  try {
    const testSubject = `QA Test Alert — {{alert_title}} [Sprint9]`;
    const testBody = `Severity: {{severity}}\nOrg: {{org_name}}\nTriggered: {{triggered_at}}\n\n{{message}}`;
    const { res, data } = await req('/api/superadmin/alert-email-template', {
      method: 'PUT',
      token: superToken,
      body: { subject: testSubject, body: testBody },
    });
    assert(res.ok, `Alert template PUT failed: ${JSON.stringify(data)}`);
    const verify = await req('/api/superadmin/alert-email-template', { token: superToken });
    assert(verify.res.ok, 'Template re-fetch failed');
    assert(verify.data.subject === testSubject, `Subject not persisted: ${verify.data.subject}`);
    assert(verify.data.body === testBody, `Body not persisted: ${verify.data.body}`);
    // Restore original
    if (alertTemplate) {
      await req('/api/superadmin/alert-email-template', {
        method: 'PUT', token: superToken, body: alertTemplate,
      });
    }
    pass('T17 — Alert email template PUT + persist + restore', summary);
  } catch (e) { fail('T17 — Alert email template PUT + persist', summary, e.message); }

  // ─── 18. Org logo endpoint — accessible by non-superadmin ────────────────
  try {
    const { res, data } = await req('/api/auth/org-logo', { token: mainToken });
    assert(res.ok, `org-logo endpoint failed: status ${res.status}, body: ${JSON.stringify(data)}`);
    assert(data.hasOwnProperty('logo_url'), `logo_url key missing: ${JSON.stringify(data)}`);
    pass('T18 — Org logo endpoint accessible to non-superadmin user', summary);
  } catch (e) { fail('T18 — Org logo endpoint accessible to non-superadmin', summary, e.message); }

  // ─── 19. Org logo endpoint — 401 without token ───────────────────────────
  try {
    const { res } = await req('/api/auth/org-logo');
    assert(res.status === 401, `Expected 401 without token, got ${res.status}`);
    pass('T19 — Org logo endpoint: 401 without token', summary);
  } catch (e) { fail('T19 — Org logo endpoint: 401 without token', summary, e.message); }

  // ─── 20. Notifications — list ────────────────────────────────────────────
  let notifIds = [];
  try {
    const { res, data } = await req('/api/superadmin/notifications', { token: superToken });
    assert(res.ok, `Notifications list failed: ${JSON.stringify(data)}`);
    const items = data.notifications || data || [];
    notifIds = Array.isArray(items) ? items.map(n => n.id) : [];
    pass(`T20 — Notifications list (${notifIds.length} items)`, summary);
  } catch (e) { fail('T20 — Notifications list', summary, e.message); }

  // ─── 21. Notifications — delete single ───────────────────────────────────
  try {
    if (notifIds.length > 0) {
      const idToDelete = notifIds[notifIds.length - 1];
      const { res, data } = await req(`/api/superadmin/notifications/${idToDelete}`, {
        method: 'DELETE',
        token: superToken,
      });
      assert(res.ok, `Delete single notification failed: ${JSON.stringify(data)}`);
      pass(`T21 — Delete single notification (id ${idToDelete})`, summary);
    } else {
      summary.push({ name: 'T21 — Delete single notification', result: 'SKIP', note: 'No notifications to delete' });
    }
  } catch (e) { fail('T21 — Delete single notification', summary, e.message); }

  // ─── 22. Notifications — clear all read ──────────────────────────────────
  try {
    const { res, data } = await req('/api/superadmin/notifications/read', {
      method: 'DELETE',
      token: superToken,
    });
    assert(res.ok, `Clear all read failed: ${JSON.stringify(data)}`);
    assert(data.hasOwnProperty('deleted'), `'deleted' count missing in response: ${JSON.stringify(data)}`);
    pass(`T22 — Clear all read notifications (deleted: ${data.deleted})`, summary);
  } catch (e) { fail('T22 — Clear all read notifications', summary, e.message); }

  // ─── 23. Site inline edit — PUT /api/superadmin/sites/:id ───────────────
  // Verifies the site edit endpoint exists and accepts updates
  try {
    const orgASiteId = orgAsite?.id;
    assert(orgASiteId, 'No site id available for edit test');
    const { res, data } = await req(`/api/superadmin/sites/${orgASiteId}`, {
      method: 'PUT',
      token: superToken,
      body: { name: orgAsite.name || 'United States', is_primary: 1 },
    });
    assert(res.ok, `Site PUT failed: status ${res.status}, body: ${JSON.stringify(data)}`);
    pass(`T23 — Site inline edit: PUT /sites/${orgASiteId} accepted`, summary);
  } catch (e) { fail('T23 — Site inline edit: PUT /sites/:id', summary, e.message); }

  // ─── 24. Regression — login returns allOrgs array ────────────────────────
  try {
    assert(Array.isArray(allOrgs) && allOrgs.length >= 2, `allOrgs should have ≥2 entries for test user, got: ${JSON.stringify(allOrgs)}`);
    const allHaveRoleAtOrg = allOrgs.every(o => o.roleAtOrg !== undefined);
    assert(allHaveRoleAtOrg, `Not all allOrgs entries have roleAtOrg: ${JSON.stringify(allOrgs)}`);
    pass('T24 — Regression: allOrgs in login response has roleAtOrg for each org', summary);
  } catch (e) { fail('T24 — Regression: allOrgs in login response', summary, e.message); }

  // ─── 25. Regression — /api/auth/me works with new JWT ────────────────────
  try {
    const { res, data } = await req('/api/auth/me', { token: orgAToken || mainToken });
    assert(res.ok, `/api/auth/me failed: ${JSON.stringify(data)}`);
    assert(data.user || data.email, `Unexpected /me response: ${JSON.stringify(data)}`);
    pass('T25 — Regression: /api/auth/me works with re-issued JWT', summary);
  } catch (e) { fail('T25 — Regression: /api/auth/me with re-issued JWT', summary, e.message); }

  // ─── 26. Regression — cross-org data isolation ───────────────────────────
  try {
    // Org B token should only see Org B cases — verify /api/cases returns without 403
    const { res } = await req('/api/cases?page=1&limit=5', { token: orgBToken });
    assert(res.status !== 403, `Org B token got 403 on /api/cases — unexpected rejection`);
    assert(res.status !== 500, `Org B token got 500 on /api/cases — server error`);
    pass('T26 — Regression: org-switched JWT passes auth on /api/cases', summary);
  } catch (e) { fail('T26 — Regression: org-switched JWT auth', summary, e.message); }

  printResults(summary, testEmail, testUserId);
})().catch(err => {
  process.stderr.write('\n❌ Sprint 9 smoke test crashed unexpectedly:\n');
  process.stderr.write(String(err) + '\n');
  process.exitCode = 1;
});
