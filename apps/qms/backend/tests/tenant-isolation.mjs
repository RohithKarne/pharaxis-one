/**
 * tenant-isolation.mjs — can one tenant reach another tenant's data?
 *
 * WHY THIS EXISTS
 * QMS has migrated PostgreSQL -> MySQL. MySQL has no Row Level Security. Under
 * Postgres, 90 tables carried RLS policies shaped
 *   USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id')::uuid)
 * so the DATABASE silently appended the org predicate to every tenant query.
 * Phase 0 moved that filter into the application so the cutover could not open
 * a cross-tenant hole. That application-side filter is now the ONLY thing
 * standing between two tenants, which is what this test exercises.
 *
 * The fixtures are created directly in MySQL — the same database the running
 * API reads. That is a strengthening, not just a port: while the fixtures lived
 * in the decommissioned Postgres, the API could not have seen the foreign row
 * even if it were leaking, so tests 1 and 2 could pass without proving
 * anything.
 *
 * HISTORY — read this before trusting an earlier version of this file.
 * The first version of Test 2 hardcoded a COPY of the route's SQL as a string
 * literal and asserted against that. It never read the route, so it could not
 * observe the fix, and its failure message claimed the leak was still open long
 * after it was closed. A test that restates the code under test proves nothing.
 * Test 2 now drives the real HTTP API.
 *
 * Requires the backend running on BASE_URL (npm run dev in apps/qms/backend).
 * Run: node tests/tenant-isolation.mjs
 */

import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { getMysqlPool, getMysqlClient } from '../src/db/mysql/pool.js';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3145/api';
const SUPERADMIN_ID = process.env.QMS_SUPERADMIN_USER_ID || 'Superadmin';
const SUPERADMIN_PASSWORD = process.env.QMS_SUPERADMIN_PASSWORD || '';

const TEST_TAG = 'ZZ_TENANT_ISO_TEST';

function pass(name) {
  console.log(`PASS ${name}`);
}

function fail(name, details) {
  console.error(`FAIL ${name}: ${details}`);
  process.exitCode = 1;
}

function check(name, condition, details) {
  if (condition) pass(name);
  else fail(name, details);
}

/**
 * Run fixture work in one transaction.
 *
 * The Postgres version also called set_config('app.current_org_id', ...) and
 * set_config('app.is_superadmin', ...), mirroring src/middleware/rlsContext.js,
 * because without those session variables the RLS policies hid the rows this
 * test needs to create and read back. MySQL has no RLS and no session GUCs, so
 * there is nothing to set and nothing to bypass — the fixture connection sees
 * every row, and the isolation being tested is entirely the application's.
 */
async function withTransaction(handler) {
  const client = await getMysqlClient();
  try {
    await client.query('START TRANSACTION');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

try {
  if (!SUPERADMIN_PASSWORD) {
    throw new Error(
      'QMS_SUPERADMIN_PASSWORD is not set. This test authenticates against the ' +
        'running API; it fails loudly rather than skipping (SOP §29).'
    );
  }

  // ---- Log in as superadmin (who belongs to the PHA_DEV org) -----------------
  const loginResponse = await fetch(`${BASE_URL}/auth/superadmin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-include-token': 'true' },
    body: JSON.stringify({ userId: SUPERADMIN_ID, password: SUPERADMIN_PASSWORD })
  });

  if (!loginResponse.ok) {
    throw new Error(`superadmin login failed: ${loginResponse.status}`);
  }

  const { accessToken, user } = await loginResponse.json();
  if (!accessToken) throw new Error('login returned no accessToken');
  const actingOrgId = user?.orgId || user?.org_id;
  console.log(`logged in; acting org = ${actingOrgId}\n`);

  // ---- Fixture: a FOREIGN org with a deviation the caller must never see -----
  // MySQL has no RETURNING, so the ids are generated here and bound explicitly
  // rather than read back off the INSERT. Both columns are CHAR(36) with a
  // DEFAULT (UUID()); supplying our own value of the same shape is what the
  // application does on every insert since the cutover.
  const { foreignOrgId, foreignDeviationId } = await withTransaction(async (client) => {
    const orgId = randomUUID();
    await client.query('INSERT INTO qms_orgs (id, org_code, org_name) VALUES ($1, $2, $3)', [
      orgId,
      `${TEST_TAG}_FOREIGN`,
      `${TEST_TAG} Foreign Org`
    ]);

    const deviationId = randomUUID();
    await client.query(
      `INSERT INTO dv_deviation_records
         (id, org_id, deviation_code, title, description, deviation_type,
          classification, status, date_of_occurrence, department)
       VALUES ($1, $2, $3, $4, $5, 'Process', 'Major', 'Open', CURRENT_DATE, 'Quality')`,
      [
        deviationId,
        orgId,
        `${TEST_TAG}-001`,
        'FOREIGN ORG confidential deviation',
        'Must never be visible to another tenant'
      ]
    );
    return { foreignOrgId: orgId, foreignDeviationId: deviationId };
  });

  console.log(`fixture: foreign org=${foreignOrgId} deviation=${foreignDeviationId}\n`);

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // ---- Test 1: cross-tenant READ through the real list endpoint --------------
  const listResponse = await fetch(`${BASE_URL}/deviations`, { headers: authHeaders });
  const listBody = await listResponse.json();
  const rows = Array.isArray(listBody) ? listBody : listBody.deviations || [];
  const leaked = rows.filter((r) => r.org_id === foreignOrgId || r.id === foreignDeviationId);

  check(
    'list-endpoint-does-not-return-foreign-org-rows',
    listResponse.status === 200 && leaked.length === 0,
    `GET /deviations returned ${listResponse.status} with ${leaked.length} row(s) ` +
      `belonging to the foreign org ${foreignOrgId}`
  );

  // ---- Test 2: cross-tenant WRITE through the real detail endpoint -----------
  const patchResponse = await fetch(`${BASE_URL}/deviations/${foreignDeviationId}`, {
    method: 'PATCH',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'HIJACKED BY ANOTHER TENANT' })
  });

  check(
    'patch-cannot-modify-foreign-org-record',
    patchResponse.status === 404 || patchResponse.status === 403,
    `expected 404/403 for a foreign-org deviation, got ${patchResponse.status}`
  );

  // ---- Test 3: the row on disk is genuinely untouched ------------------------
  const after = await withTransaction(async (client) => {
    const { rows: r } = await client.query(
      'SELECT title FROM dv_deviation_records WHERE id = $1',
      [foreignDeviationId]
    );
    return r[0]?.title ?? null;
  });

  check(
    'foreign-org-row-unchanged-on-disk',
    after === 'FOREIGN ORG confidential deviation',
    `title is now "${after}" — a cross-tenant write succeeded`
  );
} catch (error) {
  fail('tenant-isolation-harness', error.message);
} finally {
  try {
    // Deviations first: dv_deviation_records.org_id is ON DELETE RESTRICT, so
    // removing the org while its rows exist would be refused.
    await withTransaction(async (client) => {
      await client.query('DELETE FROM dv_deviation_records WHERE deviation_code LIKE $1', [
        `${TEST_TAG}%`
      ]);
      await client.query('DELETE FROM qms_orgs WHERE org_code LIKE $1', [`${TEST_TAG}%`]);
    });
  } catch (cleanupError) {
    console.error(`cleanup failed (test rows may remain): ${cleanupError.message}`);
    process.exitCode = 1;
  }
  await getMysqlPool().end();
}

if (process.exitCode) {
  console.error('\nTenant isolation: FAILED');
  process.exit(process.exitCode);
}

console.log('\nTenant isolation: PASSED');
