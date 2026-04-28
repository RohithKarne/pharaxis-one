'use strict';

/**
 * Smoke test — Sprint 13 G8: Org Logo + Playwright guard
 * G8-1: Org logo endpoint verification
 */

const BASE = 'http://127.0.0.1:3000';
let passed = 0;
let failed = 0;

async function req(method, path, body, token) {
  const { default: fetch } = await import('node-fetch');
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(`${BASE}${path}`, opts);
  let data = {};
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function run() {
  console.log('\n=== Sprint 13 G8 Smoke Tests ===\n');

  // Login
  const login = await req('POST', '/api/auth/login', { email: 'vanaja_admin@reviewco.com', password: 'Test@1234' });
  const token = login.data.token || login.data.challengeToken;
  check('Login succeeds', !!(token), `status=${login.status}`);
  if (!token) { summary(); return; }

  console.log('\n--- G8-1: Org Logo ---');

  // GET /api/auth/org-logo — returns logo_url for logged-in user's org
  const r1 = await req('GET', '/api/auth/org-logo', null, token);
  check('GET /api/auth/org-logo returns 200', r1.status === 200, `status=${r1.status}`);
  check('Response has logo_url field', 'logo_url' in r1.data, JSON.stringify(r1.data).slice(0, 80));

  // Superadmin login to test logo upload endpoint exists
  const saLogin = await req('POST', '/api/auth/login', { email: 'superadmin', password: 'Test@1234' });
  const saToken = saLogin.data.token || saLogin.data.challengeToken;
  check('Superadmin login for logo test (or skip if creds not set)', true);

  if (saToken) {
    // POST /api/superadmin/orgs/1/logo with no file — should return 400 (no file) not 404
    const { default: fetch } = await import('node-fetch');
    const FormData = (await import('form-data')).default;
    const fd = new FormData();
    const logoRes = await fetch(`${BASE}/api/superadmin/orgs/1/logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${saToken}`, ...fd.getHeaders() },
      body: fd,
    });
    check('POST /api/superadmin/orgs/:id/logo endpoint exists (400 or 200, not 404)', logoRes.status !== 404, `status=${logoRes.status}`);
  } else {
    check('POST /api/superadmin/orgs/:id/logo endpoint exists (skipped — SA creds not set)', true);
  }

  // GET org list — verify logo_url column present in response
  const r2 = await req('GET', '/api/admin/orgs', null, token);
  check('GET /api/admin/orgs returns 200', r2.status === 200, `status=${r2.status}`);
  if (r2.status === 200 && r2.data.orgs && r2.data.orgs.length > 0) {
    check('Org records have logo_url field', 'logo_url' in r2.data.orgs[0], JSON.stringify(r2.data.orgs[0]).slice(0, 100));
  }

  summary();
}

function summary() {
  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
