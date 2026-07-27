/**
 * _savedviews-setup.js — provisions a throwaway platform_admin test user and
 * logs in through the REAL backend to obtain a valid session token.
 * Run with: node --env-file=.env e2e/_savedviews-setup.js
 * Writes e2e/.savedviews-session.json for the Playwright spec to consume.
 *
 * platform_admin role bypasses ModuleAccessGuard, so no module grants needed.
 * Teardown is handled by _savedviews-teardown.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('../backend/database/db');

const BACKEND = process.env.MIMS_BACKEND_URL || 'http://localhost:3000';
const EMAIL = 'e2e_savedviews@pharaxis.test';
const PASSWORD = 'Test@1234!sv';
const OUT = path.join(__dirname, '.savedviews-session.json');

async function main() {
  if (pool.initPromise) { try { await pool.initPromise; } catch (_) {} }

  const hash = await bcrypt.hash(PASSWORD, 10);

  // Pick an active org, preferring one with 2FA disabled.
  const [orgs] = await pool.execute(
    'SELECT id, name, COALESCE(two_factor_enabled,0) AS tfa FROM organisations WHERE is_active = 1 ORDER BY tfa ASC, id ASC LIMIT 1'
  );
  if (!orgs.length) throw new Error('No active organisation found.');
  const org = orgs[0];

  // Upsert the test user.
  await pool.execute('DELETE FROM users WHERE email = ?', [EMAIL]);
  const [ins] = await pool.execute(
    `INSERT INTO users (name, email, password, role, is_active, org_id, email_verified, password_reset_required)
     VALUES (?, ?, ?, 'platform_admin', 1, ?, 1, 0)`,
    ['E2E SavedViews', EMAIL, hash, org.id]
  );
  const userId = ins.insertId;

  // Grant org access (login joins user_org_access -> organisations).
  await pool.execute(
    'INSERT INTO user_org_access (user_id, org_id, is_active) VALUES (?, ?, 1)',
    [userId, org.id]
  );

  // Log in through the real endpoint (token signed with the running backend's secret).
  let res = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  let data = await res.json();

  if (!data.token && data.challengeToken) {
    res = await fetch(`${BACKEND}/api/auth/2fa/skip-setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: data.challengeToken }),
    });
    data = await res.json();
  }

  if (!data.token) {
    throw new Error('Login failed: ' + JSON.stringify(data).slice(0, 300));
  }

  const session = {
    token: data.token,
    userId,
    user: data.user || { id: userId, name: 'E2E SavedViews', email: EMAIL, role: 'platform_admin' },
    modules: data.modules || ['mims_core'],
    orgId: data.orgId ?? org.id,
    siteId: data.siteId ?? '',
    orgName: data.orgName ?? org.name,
    siteName: data.siteName ?? '',
    allOrgs: data.allOrgs || [],
    sessionTimeout: data.sessionTimeout ?? 30,
  };
  fs.writeFileSync(OUT, JSON.stringify(session, null, 2));
  console.log('SETUP_OK userId=' + userId + ' org=' + org.id + ' tokenLen=' + data.token.length);
}

main().then(() => process.exit(0)).catch(err => { console.error('SETUP_FAIL', err.message); process.exit(1); });
