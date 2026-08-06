#!/usr/bin/env node
'use strict';

/**
 * seed-e2e.js — deterministic test data for the MIMS E2E suite.
 *
 * Why this exists: before this script the E2E suite ran against whatever data
 * happened to be in the database. Tests that could not find their data called
 * test.skip(), so a run with an empty database reported 41 of 54 tests skipped
 * and still looked green (measured 2026-07-27).
 *
 * The suite now fails when required data is absent, so that data has to be
 * created deliberately and identically on every run. That is this script.
 *
 * Safety: refuses to run against any database whose name does not end in
 * `_test`. It deletes and recreates its own rows, and must never touch dev.
 *
 * Usage:
 *   MYSQL_DATABASE=pharaxis_mims_test node backend/tests/seed-e2e.js
 */

const bcrypt = require('bcrypt');
const mysql  = require('mysql2/promise');

const DB       = process.env.MYSQL_DATABASE || '';
const HOST     = process.env.MYSQL_HOST     || 'localhost';
const PORT     = parseInt(process.env.MYSQL_PORT || '3306', 10);
const USER     = process.env.MYSQL_USER     || 'devuser';
// No literal fallback. A known-weak default that silently works is how a weak
// password reaches an environment nobody meant it to reach; fail loudly instead.
const PASSWORD = process.env.MYSQL_PASSWORD;
if (PASSWORD === undefined) {
  throw new Error('MYSQL_PASSWORD must be set to run the E2E seeder. Refusing to guess a default.');
}

// Credentials the E2E specs expect. Test-only, and only ever written to a
// database whose name ends in `_test`.
const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    || 'vanaja_admin@reviewco.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Test@1234';
const ORG_NAME       = 'E2E Review Co.';
const SITE_NAME      = 'United States';

const ADMIN_MODULES = [
  'admin_console', 'mims_core', 'inbox', 'case_mgmt', 'case_query',
  'content_mgmt', 'browse_content', 'reports', 'utilities',
];

const WORKFLOW_STATES = ['New', 'Triage', 'In Progress', 'On Hold', 'Closed'];

function guardDatabaseName(name) {
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to seed "${name}". This script only runs against a database ` +
      `whose name ends in "_test" — it deletes rows, and must never touch dev data. ` +
      `Set MYSQL_DATABASE=pharaxis_mims_test.`
    );
  }
}

async function upsertOrg(conn) {
  const [existing] = await conn.query('SELECT id FROM organisations WHERE name = ?', [ORG_NAME]);
  if (existing.length) return existing[0].id;
  const [res] = await conn.query(
    'INSERT INTO organisations (name, is_active) VALUES (?, 1)', [ORG_NAME]
  );
  return res.insertId;
}

async function upsertSite(conn, orgId) {
  const [existing] = await conn.query(
    'SELECT id FROM sites WHERE org_id = ? AND name = ?', [orgId, SITE_NAME]
  );
  if (existing.length) return existing[0].id;
  const [res] = await conn.query(
    'INSERT INTO sites (org_id, name, is_primary, is_active) VALUES (?, ?, 1, 1)',
    [orgId, SITE_NAME]
  );
  return res.insertId;
}

async function upsertAdminUser(conn, orgId, siteId) {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
  let userId;
  if (existing.length) {
    userId = existing[0].id;
    // Reset the password every run so a changed hash can never make the suite
    // fail for a reason unrelated to the code under test.
    await conn.query(
      `UPDATE users SET password = ?, role = 'admin', is_active = 1, email_verified = 1,
              password_reset_required = 0, failed_login_attempts = 0, locked_until = NULL,
              org_id = ? WHERE id = ?`,
      [hash, orgId, userId]
    );
  } else {
    const [res] = await conn.query(
      `INSERT INTO users (name, email, password, role, is_active, email_verified,
                          password_reset_required, org_id)
       VALUES (?, ?, ?, 'admin', 1, 1, 0, ?)`,
      ['E2E Admin', ADMIN_EMAIL, hash, orgId]
    );
    userId = res.insertId;
  }

  await conn.query('DELETE FROM user_module_permissions WHERE user_id = ?', [userId]);
  for (const mod of ADMIN_MODULES) {
    await conn.query(
      'INSERT INTO user_module_permissions (user_id, module, can_access) VALUES (?, ?, 1)',
      [userId, mod]
    );
  }

  await conn.query('DELETE FROM user_org_access WHERE user_id = ?', [userId]);
  await conn.query(
    `INSERT INTO user_org_access (user_id, org_id, site_id, is_active, role_at_org, primary_site_id)
     VALUES (?, ?, ?, 1, 'admin', ?)`,
    [userId, orgId, siteId, siteId]
  );

  return userId;
}

/**
 * The bootstrap platform_admin created by migration 001 has no module
 * permissions and no org access, so /mims-admin bounces it straight to the
 * Administration Console login (ModuleAccessGuard requires 'admin_console').
 * Every Platform Admin E2E test failed for this reason alone.
 */
async function provisionPlatformAdmin(conn, orgId, siteId) {
  const [rows] = await conn.query(
    `SELECT id FROM users WHERE email IN ('platform_admin', 'platform_admin@mims.io') LIMIT 1`
  );
  if (!rows.length) return null;
  const userId = rows[0].id;

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await conn.query(
    `UPDATE users SET password = ?, is_active = 1, email_verified = 1,
            password_reset_required = 0, failed_login_attempts = 0, locked_until = NULL
       WHERE id = ?`,
    [hash, userId]
  );

  await conn.query('DELETE FROM user_module_permissions WHERE user_id = ?', [userId]);
  for (const mod of ADMIN_MODULES) {
    await conn.query(
      'INSERT INTO user_module_permissions (user_id, module, can_access) VALUES (?, ?, 1)',
      [userId, mod]
    );
  }

  await conn.query('DELETE FROM user_org_access WHERE user_id = ?', [userId]);
  await conn.query(
    `INSERT INTO user_org_access (user_id, org_id, site_id, is_active, role_at_org, primary_site_id)
     VALUES (?, ?, ?, 1, 'platform_admin', ?)`,
    [userId, orgId, siteId, siteId]
  );

  return userId;
}

/**
 * The v1 platform API (/api/v1/cases) authenticates with an API-platform access
 * token, not a user JWT — that is the path CP Portal uses to push cases into
 * MIMS. Without a seeded client and token the cross-app integration test cannot
 * exercise the real integration route at all.
 *
 * The token is fixed and test-only, so the suite can present it without a
 * separate issuance round-trip.
 */
const E2E_API_TOKEN = process.env.E2E_API_TOKEN || 'e2e-cross-app-token-do-not-use-outside-tests';

async function upsertApiClient(conn, orgId, userId) {
  const crypto = require('node:crypto');
  const tokenHash = crypto.createHash('sha256').update(E2E_API_TOKEN).digest('hex');
  const scopes = JSON.stringify(['*']);

  const [existing] = await conn.query('SELECT id FROM api_clients WHERE client_id = ? LIMIT 1', ['e2e-cross-app']);
  let clientRowId;
  if (existing.length) {
    clientRowId = existing[0].id;
    await conn.query(
      `UPDATE api_clients SET org_id = ?, name = 'E2E Cross-App', scopes = ?, status = 'active' WHERE id = ?`,
      [orgId, scopes, clientRowId]
    );
  } else {
    const secretHash = await bcrypt.hash('e2e-cross-app-secret', 10);
    const [res] = await conn.query(
      `INSERT INTO api_clients (org_id, client_id, client_secret_hash, name, scopes, rate_limit_per_min, status, created_by)
       VALUES (?, 'e2e-cross-app', ?, 'E2E Cross-App', ?, 600, 'active', ?)`,
      [orgId, secretHash, scopes, userId]
    );
    clientRowId = res.insertId;
  }

  await conn.query('DELETE FROM api_tokens WHERE client_id = ?', [clientRowId]);
  await conn.query(
    `INSERT INTO api_tokens (client_id, access_token_hash, expires_at, revoked)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), 0)`,
    [clientRowId, tokenHash]
  );
  return clientRowId;
}

async function ensureWorkflowStates(conn) {
  const ids = {};
  for (const name of WORKFLOW_STATES) {
    const [rows] = await conn.query(
      'SELECT id FROM workflow_states WHERE name = ? AND org_id IS NULL', [name]
    );
    if (rows.length) { ids[name] = rows[0].id; continue; }
    const [res] = await conn.query(
      'INSERT INTO workflow_states (name, org_id, is_active) VALUES (?, NULL, 1)', [name]
    );
    ids[name] = res.insertId;
  }
  return ids;
}

async function seedCases(conn, { orgId, siteId, userId, statusIds }) {
  // Deterministic case numbers so re-running is idempotent.
  const CASES = [
    { number: 'E2E-MI-0001', type: 'MI', status: 'New' },
    { number: 'E2E-AE-0001', type: 'AE', status: 'New' },
    { number: 'E2E-PC-0001', type: 'PC', status: 'Triage' },
    { number: 'E2E-MI-0002', type: 'MI', status: 'In Progress' },
  ];

  const created = [];
  for (const c of CASES) {
    const [existing] = await conn.query(
      'SELECT id FROM cases WHERE case_number = ?', [c.number]
    );
    if (existing.length) {
      await conn.query('UPDATE cases SET is_deleted = 0, status_id = ? WHERE id = ?',
        [statusIds[c.status], existing[0].id]);
      created.push(existing[0].id);
      continue;
    }
    const [res] = await conn.query(
      `INSERT INTO cases (case_number, case_type, org_id, site_id, status_id,
                          case_owner_id, priority, date_received, description,
                          is_deleted, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'normal', CURDATE(), ?, 0, ?)`,
      [c.number, c.type, orgId, siteId, statusIds[c.status], userId,
       `Deterministic E2E fixture case (${c.type}). Created by seed-e2e.js.`, userId]
    );
    created.push(res.insertId);
  }
  return created;
}

async function main() {
  guardDatabaseName(DB);

  const conn = await mysql.createConnection({
    host: HOST, port: PORT, user: USER, password: PASSWORD, database: DB,
    multipleStatements: false,
  });

  try {
    console.log(`[seed-e2e] target database: ${DB}`);

    const orgId  = await upsertOrg(conn);
    const siteId = await upsertSite(conn, orgId);
    const userId = await upsertAdminUser(conn, orgId, siteId);
    console.log(`[seed-e2e] org=${orgId} site=${siteId} admin=${userId} (${ADMIN_EMAIL})`);

    const platformAdminId = await provisionPlatformAdmin(conn, orgId, siteId);
    console.log(platformAdminId
      ? `[seed-e2e] platform_admin=${platformAdminId} provisioned with modules + org access`
      : '[seed-e2e] platform_admin not found — skipped');

    const apiClientId = await upsertApiClient(conn, orgId, userId);
    console.log(`[seed-e2e] api client=${apiClientId} with a 30-day token for the cross-app suite`);

    const statusIds = await ensureWorkflowStates(conn);
    console.log(`[seed-e2e] workflow states: ${Object.keys(statusIds).join(', ')}`);

    // Picklists, field setup and CaseForm definition come from the app's own
    // seeder so the fixture matches what a real new org gets.
    process.env.MYSQL_DATABASE = DB;
    const { seedNewOrgWithConnection } = require('../services/seedService');
    await seedNewOrgWithConnection(conn, orgId, userId);
    console.log('[seed-e2e] picklists, field setup and CaseForm definition seeded');

    const caseIds = await seedCases(conn, { orgId, siteId, userId, statusIds });
    console.log(`[seed-e2e] cases: ${caseIds.length} (${caseIds.join(', ')})`);

    const [[{ picklists }]] = await conn.query('SELECT COUNT(*) AS picklists FROM picklists');
    console.log(`[seed-e2e] done — ${picklists} picklist values available`);
  } finally {
    await conn.end();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(`[seed-e2e] FAILED: ${err.message}`);
  process.exit(1);
});
