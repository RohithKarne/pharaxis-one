/**
 * tenant-isolation.mjs — can one tenant reach another tenant's data?
 *
 * WHY THIS EXISTS
 * QMS is migrating PostgreSQL -> MySQL. MySQL has no Row Level Security. Today
 * 90 tables carry RLS policies shaped
 *   USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id')::uuid)
 * so the DATABASE silently appends the org predicate to every tenant query.
 * Phase 0 moved that filter into the application so the cutover cannot open a
 * cross-tenant hole.
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
import pg from 'pg';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3145/api';
const SUPERADMIN_ID = process.env.QMS_SUPERADMIN_USER_ID || 'Superadmin';
const SUPERADMIN_PASSWORD = process.env.QMS_SUPERADMIN_PASSWORD || '';

const TEST_TAG = 'ZZ_TENANT_ISO_TEST';

// Superadmin sessions still need a syntactically valid uuid: the policies cast
// current_setting('app.current_org_id')::uuid, and Postgres does not guarantee
// the qms_is_superadmin() branch of the OR short-circuits before that cast.
const NO_ORG = '00000000-0000-0000-0000-000000000000';

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

/** Mirrors src/middleware/rlsContext.js so fixtures use the same session setup. */
async function withSession(pool, { orgId, superadmin = false }, handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgId]);
    await client.query("SELECT set_config('app.is_superadmin', $1, true)", [
      superadmin ? 'true' : 'false'
    ]);
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

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

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
  const { foreignOrgId, foreignDeviationId } = await withSession(
    pool,
    { orgId: NO_ORG, superadmin: true },
    async (client) => {
      const org = await client.query(
        'INSERT INTO qms_orgs (org_code, org_name) VALUES ($1, $2) RETURNING id',
        [`${TEST_TAG}_FOREIGN`, `${TEST_TAG} Foreign Org`]
      );
      const orgId = org.rows[0].id;

      const dev = await client.query(
        `INSERT INTO dv_deviation_records
           (org_id, deviation_code, title, description, deviation_type,
            classification, status, date_of_occurrence, department)
         VALUES ($1, $2, $3, $4, 'Process', 'Major', 'Open', CURRENT_DATE, 'Quality')
         RETURNING id`,
        [
          orgId,
          `${TEST_TAG}-001`,
          'FOREIGN ORG confidential deviation',
          'Must never be visible to another tenant'
        ]
      );
      return { foreignOrgId: orgId, foreignDeviationId: dev.rows[0].id };
    }
  );

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
  const after = await withSession(pool, { orgId: NO_ORG, superadmin: true }, async (client) => {
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
    await withSession(pool, { orgId: NO_ORG, superadmin: true }, async (client) => {
      await client.query('DELETE FROM dv_deviation_records WHERE deviation_code LIKE $1', [
        `${TEST_TAG}%`
      ]);
      await client.query('DELETE FROM qms_orgs WHERE org_code LIKE $1', [`${TEST_TAG}%`]);
    });
  } catch (cleanupError) {
    console.error(`cleanup failed (test rows may remain): ${cleanupError.message}`);
    process.exitCode = 1;
  }
  await pool.end();
}

if (process.exitCode) {
  console.error('\nTenant isolation: FAILED');
  process.exit(process.exitCode);
}

console.log('\nTenant isolation: PASSED');
