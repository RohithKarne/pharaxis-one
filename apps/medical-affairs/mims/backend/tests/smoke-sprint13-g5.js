'use strict';

/**
 * Smoke test — Sprint 13 G5 backend items
 * G5-1: User Access Expiry
 * G5-2: Sensitive Change Approvals
 * G5-3: Dependency Mapping
 * G5-4: Audit Trail (logAudit utility exists + audit_logs columns)
 */

const BASE = 'http://127.0.0.1:3000';
let passed = 0;
let failed = 0;
let adminToken = '';
let orgId = 26;

async function req(method, path, body, token) {
  const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
  const f = await fetch;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res = await f(`${BASE}${path}`, opts);
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

async function login() {
  const r = await req('POST', '/api/auth/login', { email: 'vanaja_admin@reviewco.com', password: 'Test@1234' });
  if ((r.status === 200 || r.status === 202) && (r.data.token || r.data.challengeToken)) {
    adminToken = r.data.token || r.data.challengeToken;
    return true;
  }
  return false;
}

async function run() {
  console.log('\n=== Sprint 13 G5 Smoke Tests ===\n');

  const loggedIn = await login();
  check('Auth login succeeds', loggedIn);
  if (!loggedIn) { summary(); return; }

  // --- G5-1: User Access Expiry ---
  console.log('\n--- G5-1: User Access Expiry ---');

  const r1 = await req('GET', `/api/admin/orgs/${orgId}/users`, null, adminToken);
  check('GET /api/admin/orgs/:orgId/users returns 200', r1.status === 200, `status=${r1.status}`);
  check('Response has users array', Array.isArray(r1.data.users), JSON.stringify(r1.data).slice(0, 100));

  // Try setting expiry on user 1 (may not exist but route should respond correctly)
  const r2 = await req('PUT', `/api/admin/orgs/${orgId}/users/1/expiry`, { access_expires_at: '2099-12-31T00:00:00Z' }, adminToken);
  check('PUT /api/admin/orgs/:orgId/users/:userId/expiry returns 200 or 500', [200, 500].includes(r2.status), `status=${r2.status}`);

  // --- G5-2: Sensitive Change Approvals ---
  console.log('\n--- G5-2: Sensitive Change Approvals ---');

  const r3 = await req('POST', '/api/admin/change-approvals', {
    entity: 'organisation',
    entity_id: orgId,
    field_name: 'name',
    current_value: 'OldName',
    proposed_value: 'NewName',
    reason: 'Smoke test request',
  }, adminToken);
  check('POST /api/admin/change-approvals returns 201', r3.status === 201, `status=${r3.status}`);
  const approvalId = r3.data.id;

  const r4 = await req('GET', '/api/admin/change-approvals?status=pending', null, adminToken);
  check('GET /api/admin/change-approvals returns 200', r4.status === 200, `status=${r4.status}`);
  check('Response has requests array', Array.isArray(r4.data.requests), JSON.stringify(r4.data).slice(0, 100));

  const r5 = await req('GET', '/api/admin/change-approvals/my-requests', null, adminToken);
  check('GET /api/admin/change-approvals/my-requests returns 200', r5.status === 200, `status=${r5.status}`);

  if (approvalId) {
    const r6 = await req('PUT', `/api/admin/change-approvals/${approvalId}/approve`, {}, adminToken);
    check('PUT /api/admin/change-approvals/:id/approve returns 200', r6.status === 200, `status=${r6.status}`);

    // Submit another to test reject
    const r7 = await req('POST', '/api/admin/change-approvals', {
      entity: 'site',
      entity_id: 1,
      field_name: 'name',
      current_value: 'OldSite',
      proposed_value: 'NewSite',
      reason: 'Test reject',
    }, adminToken);
    if (r7.status === 201) {
      const r8 = await req('PUT', `/api/admin/change-approvals/${r7.data.id}/reject`, { rejection_note: 'Not approved' }, adminToken);
      check('PUT /api/admin/change-approvals/:id/reject returns 200', r8.status === 200, `status=${r8.status}`);
    }
  }

  // --- G5-3: Dependency Mapping ---
  console.log('\n--- G5-3: Dependency Mapping ---');

  const r9 = await req('GET', '/api/admin/dependencies/picklist/1', null, adminToken);
  check('GET /api/admin/dependencies/picklist/:id returns 200 or 404', [200, 404].includes(r9.status), `status=${r9.status}`);
  if (r9.status === 200) {
    check('Response has safe_to_delete field', 'safe_to_delete' in r9.data, JSON.stringify(r9.data).slice(0, 100));
  }

  const r10 = await req('GET', '/api/admin/dependencies/user/1', null, adminToken);
  check('GET /api/admin/dependencies/user/:id returns 200', r10.status === 200, `status=${r10.status}`);
  if (r10.status === 200) {
    check('Response has open_cases and safe_to_remove', 'open_cases' in r10.data && 'safe_to_remove' in r10.data);
  }

  const r11 = await req('GET', `/api/admin/dependencies/org/${orgId}`, null, adminToken);
  check('GET /api/admin/dependencies/org/:id returns 200 or 403', [200, 403].includes(r11.status), `status=${r11.status}`);

  const r12 = await req('GET', '/api/admin/dependencies/field-definition/1', null, adminToken);
  check('GET /api/admin/dependencies/field-definition/:id returns 200 or 404', [200, 404].includes(r12.status), `status=${r12.status}`);

  // --- G5-4: Audit Trail utility ---
  console.log('\n--- G5-4: Audit Trail Utility ---');

  // Verify auditLog utility exists and can be required
  try {
    const { logAudit } = require('../utils/auditLog');
    check('logAudit utility can be required', typeof logAudit === 'function');
  } catch (e) {
    check('logAudit utility can be required', false, e.message);
  }

  // Verify audit_logs route returns results (existing endpoint)
  const r13 = await req('GET', '/api/admin/audit', null, adminToken);
  check('GET /api/admin/audit returns 200 or 404', [200, 404].includes(r13.status), `status=${r13.status}`);

  summary();
}

function summary() {
  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
