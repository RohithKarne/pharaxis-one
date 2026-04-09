'use strict';

/**
 * smoke-case-regressions.js
 * Validates:
 * 1) Case number assignment remains unique across consecutive case creations
 * 2) /api/cases query validation rejects bad params
 * 3) /api/cases include_meta returns rows + total + paging fields
 *
 * Run:
 *   node mims/backend/tests/smoke-case-regressions.js
 */

const mysql = require('mysql2/promise');

const BASE = 'http://127.0.0.1:3000';

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function loginUser(email, password) {
  const r = await req('/api/auth/login', { method: 'POST', body: { email, password } });
  if (!r.ok) throw new Error(`Login failed (${email}): ${JSON.stringify(r.data)}`);
  if (r.data?.token) return r.data.token;
  if (r.data?.twoFactorSetupAvailable && r.data?.challengeToken) {
    const skip = await req('/api/auth/2fa/skip-setup', { method: 'POST', body: { challengeToken: r.data.challengeToken } });
    if (!skip.ok || !skip.data?.token) throw new Error(`2FA skip failed: ${JSON.stringify(skip.data)}`);
    return skip.data.token;
  }
  throw new Error(`Unexpected login payload: ${JSON.stringify(r.data)}`);
}

async function ensureOrgWithSite(superToken, created) {
  const orgs = await req('/api/superadmin/orgs-for-assignment', { token: superToken });
  assert(orgs.ok, `Failed to load orgs: ${JSON.stringify(orgs.data)}`);

  const existing = (orgs.data.orgs || []).find(o => Array.isArray(o.sites) && o.sites.length > 0);
  if (existing) {
    return { org: existing, site: existing.sites[0] };
  }

  const suffix = Date.now();
  const orgName = `QA Regression Org ${suffix}`;
  const siteName = `QA Regression Site ${suffix}`;

  const createOrg = await req('/api/superadmin/orgs', {
    method: 'POST',
    token: superToken,
    body: { name: orgName },
  });
  assert(createOrg.ok && createOrg.data?.id, `Failed to create fallback org: ${JSON.stringify(createOrg.data)}`);
  created.orgId = createOrg.data.id;

  const createSite = await req(`/api/superadmin/orgs/${created.orgId}/sites`, {
    method: 'POST',
    token: superToken,
    body: { name: siteName, country: 'US', is_primary: true },
  });
  assert(createSite.ok && createSite.data?.id, `Failed to create fallback site: ${JSON.stringify(createSite.data)}`);
  created.siteId = createSite.data.id;

  return {
    org: { id: created.orgId, name: orgName },
    site: { id: created.siteId, name: siteName },
  };
}

async function main() {
  const created = { userId: null, caseIds: [], email: null, orgId: null, siteId: null };
  let superToken = null;
  try {
    const health = await req('/api/health');
    assert(health.ok, 'Health check failed');

    superToken = await loginUser('superadmin', 'Manager@123');
    const { org, site } = await ensureOrgWithSite(superToken, created);

    const email = `qa.regression+${Date.now()}@example.com`;
    created.email = email;
    const createUser = await req('/api/superadmin/users/create', {
      method: 'POST',
      token: superToken,
      body: { name: 'QA Regression User', email, role: 'agent' },
    });
    assert(createUser.ok && createUser.data?.id, `Failed to create user: ${JSON.stringify(createUser.data)}`);
    created.userId = createUser.data.id;

    const assignOrg = await req(`/api/superadmin/users/${created.userId}/org-access`, {
      method: 'POST',
      token: superToken,
      body: { org_id: org.id, primary_site_id: site.id, role_at_org: 'agent', site_permission: 'full' },
    });
    assert(assignOrg.ok, `Failed to assign org access: ${JSON.stringify(assignOrg.data)}`);

    const firstLogin = await req('/api/auth/login', { method: 'POST', body: { email, password: 'Manager@123' } });
    assert(firstLogin.ok && firstLogin.data?.passwordResetRequired && firstLogin.data?.token, `Initial login/reset failed: ${JSON.stringify(firstLogin.data)}`);
    const reset = await req('/api/auth/reset-password', {
      method: 'POST',
      token: firstLogin.data.token,
      body: { newPassword: 'QaReg@123' },
    });
    assert(reset.ok, `Reset password failed: ${JSON.stringify(reset.data)}`);

    const userToken = await loginUser(email, 'QaReg@123');

    // Create and assign numbers for two cases; numbers must differ.
    const c1 = await req('/api/cases', {
      method: 'POST',
      token: userToken,
      body: { site_id: site.id, case_type: 'MI', intake_channel: 'manual' },
    });
    assert(c1.ok && c1.data?.id, `Create case #1 failed: ${JSON.stringify(c1.data)}`);
    created.caseIds.push(c1.data.id);
    const n1 = await req(`/api/cases/${c1.data.id}/assign-number`, { method: 'POST', token: userToken });
    assert(n1.ok && n1.data?.case_number, `Assign number #1 failed: ${JSON.stringify(n1.data)}`);

    const c2 = await req('/api/cases', {
      method: 'POST',
      token: userToken,
      body: { site_id: site.id, case_type: 'MI', intake_channel: 'manual' },
    });
    assert(c2.ok && c2.data?.id, `Create case #2 failed: ${JSON.stringify(c2.data)}`);
    created.caseIds.push(c2.data.id);
    const n2 = await req(`/api/cases/${c2.data.id}/assign-number`, { method: 'POST', token: userToken });
    assert(n2.ok && n2.data?.case_number, `Assign number #2 failed: ${JSON.stringify(n2.data)}`);
    assert(n1.data.case_number !== n2.data.case_number, `Duplicate case numbers produced: ${n1.data.case_number}`);

    // Validation checks
    const badBox = await req('/api/cases?corr_box=invalid', { token: userToken });
    assert(badBox.status === 400, `Expected 400 for invalid corr_box, got ${badBox.status}`);
    const badDate = await req('/api/cases?corr_from=2026/03/29', { token: userToken });
    assert(badDate.status === 400, `Expected 400 for invalid corr_from, got ${badDate.status}`);

    // Meta response check
    const meta = await req('/api/cases?include_meta=true&limit=10&offset=0&sort_by=communication_count&sort_dir=desc', { token: userToken });
    assert(meta.ok, `Meta query failed: ${JSON.stringify(meta.data)}`);
    assert(Array.isArray(meta.data?.rows), 'Expected rows array in include_meta response');
    assert(typeof meta.data?.total === 'number', 'Expected numeric total in include_meta response');
    assert(typeof meta.data?.limit === 'number', 'Expected numeric limit in include_meta response');
    assert(typeof meta.data?.offset === 'number', 'Expected numeric offset in include_meta response');

    console.log(JSON.stringify({
      ok: true,
      checks: {
        unique_case_numbers: [n1.data.case_number, n2.data.case_number],
        validation_statuses: { bad_corr_box: badBox.status, bad_corr_from: badDate.status },
        meta_sample: { total: meta.data.total, limit: meta.data.limit, offset: meta.data.offset, rows: meta.data.rows.length },
      },
    }, null, 2));
  } finally {
    // Best-effort cleanup for generated test data
    try {
      const pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        user: process.env.MYSQL_USER || 'devuser',
        password: process.env.MYSQL_PASSWORD || 'devpass',
        database: process.env.MYSQL_DATABASE || 'mims_dev',
      });
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        if (created.caseIds.length > 0) {
          await conn.query(`DELETE FROM case_contacts WHERE case_id IN (${created.caseIds.map(() => '?').join(',')})`, created.caseIds).catch(() => {});
          await conn.query(`DELETE FROM cases WHERE id IN (${created.caseIds.map(() => '?').join(',')})`, created.caseIds);
        }
        if (created.userId) {
          await conn.query('DELETE FROM user_org_access WHERE user_id = ?', [created.userId]).catch(() => {});
          await conn.query('DELETE FROM sessions WHERE user_id = ?', [created.userId]).catch(() => {});
          await conn.query('DELETE FROM users WHERE id = ?', [created.userId]);
        }
        if (created.siteId) {
          await conn.query('DELETE FROM sites WHERE id = ?', [created.siteId]).catch(() => {});
        }
        if (created.orgId) {
          await conn.query('DELETE FROM organisations WHERE id = ?', [created.orgId]).catch(() => {});
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
      } finally {
        conn.release();
        await pool.end();
      }
    } catch (_) {
      // best-effort cleanup only
    }
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
