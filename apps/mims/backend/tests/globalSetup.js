'use strict';
/**
 * tests/globalSetup.js — migrate once, before any worker starts.
 *
 * Jest gives every test file its own module registry, so `require('../database/db')`
 * builds a fresh pool per suite and each one kicks off initializeDatabase(). Against
 * an already-migrated database that is cheap. Against an empty one — which is what CI
 * gets every run — it meant twenty workers applying 105 migrations to the same schema
 * at the same time. Two failures came out of that:
 *
 *   [DB] Migration failed: 035_enterprise_pv_ai_workflow_api.js
 *        Can't add new command when connection is in closed state
 *   thrown: "Exceeded timeout of 5000 ms for a hook."
 *
 * The first is the race; the second is that migrating from empty cannot finish inside
 * jest's default 5s hook budget however the race resolves.
 *
 * Running the migrations here, once, in the main process before any worker forks,
 * removes both. Each suite's own initializeDatabase() then finds every migration
 * already applied and returns in milliseconds.
 *
 * Deliberately no production code changed. db.js still migrates on require exactly as
 * it does in every other environment — this only ensures it has nothing left to do.
 */

module.exports = async () => {
  const started = Date.now();
  const pool = require('../database/db');

  try {
    await pool.initPromise;
  } catch (err) {
    // Fail the run here with the real cause rather than letting twenty suites each
    // report a timeout that says nothing about why.
    console.error('\n[jest globalSetup] Database migration failed — no suite can run.');
    throw err;
  }

  await provisionBaselineTenant(pool);

  await pool.end();
  console.log(`[jest globalSetup] Database ready in ${Date.now() - started}ms`);
};

/**
 * The migrations create a schema and a single platform admin with org_id NULL —
 * no organisation, no site, no tenant user. Several suites query
 * `WHERE org_id = 1` and abort with "No user in org 1" against a fresh database.
 *
 * This provisions the smallest tenant those suites need and nothing more. It is a
 * fixture, not product data: it asserts nothing and is created automatically on
 * every run, so §29's rule that a suite must never depend on a manual setup step
 * still holds. Suites continue to build their own cases on top of it.
 *
 * Idempotent — a repeat run against an already-seeded database is a no-op.
 */
async function provisionBaselineTenant(pool) {
  const [[org]] = await pool.execute('SELECT id FROM organisations ORDER BY id ASC LIMIT 1');
  if (org) return;

  const [orgResult] = await pool.execute(
    "INSERT INTO organisations (name) VALUES ('CI Test Organisation')"
  );
  const orgId = orgResult.insertId;

  await pool.execute('INSERT INTO sites (org_id, name) VALUES (?, ?)', [orgId, 'CI Test Site']);

  // Attach the bootstrap platform admin to the tenant so suites that look up "a
  // user in org 1" find one, rather than inventing a second identity.
  const [[admin]] = await pool.execute(
    'SELECT id FROM users ORDER BY id ASC LIMIT 1'
  );
  if (admin) {
    await pool.execute('UPDATE users SET org_id = ? WHERE id = ? AND org_id IS NULL', [orgId, admin.id]);
    await pool
      .execute(
        'INSERT INTO user_org_access (user_id, org_id, is_active) VALUES (?, ?, 1)',
        [admin.id, orgId]
      )
      .catch(() => {}); // column set varies by migration age; access rows are optional here
  }

  await provisionTenantFieldOverrides(pool, orgId);

  console.log(`[jest globalSetup] Baseline tenant provisioned (org ${orgId})`);
}

/**
 * Migration 106 ships the platform field defaults (org_id NULL). Three suites need
 * the *tenant* side of that picture as well:
 *
 *   - caseFormRegression proves the field_setup dedup bug is real, which requires a
 *     platform row and an org row for the same field to both exist. Its own comment
 *     says "Both rows must exist for this test to mean anything."
 *   - coreFieldConfig checks that an org's own custom field is left untagged, which
 *     needs an org field carrying no core_key.
 *
 * Org-scoped rows are tenant data, not product configuration, so they belong here
 * with the tenant rather than in a migration. Derived from the platform rows at
 * runtime — nothing is hardcoded, so this follows the field set rather than pinning
 * a copy of it that can silently drift.
 */
async function provisionTenantFieldOverrides(pool, orgId) {
  const [[existing]] = await pool.execute(
    'SELECT id FROM field_setup WHERE org_id = ? LIMIT 1',
    [orgId]
  );
  if (existing) return;

  // 1. Override Case Information / priority for this org. Named explicitly rather
  //    than "some platform field" because that is the exact row the suites look for:
  //    caseFormRegression queries LOWER(field_name)='priority' in that section, and
  //    caseFieldsAdmin looks up org_id=? AND core_key='priority'.
  const [[priority]] = await pool.execute(
    `SELECT section_name, field_name, field_type, sort_order
       FROM field_setup
      WHERE org_id IS NULL AND core_key = 'priority'
      LIMIT 1`
  );
  if (priority) {
    await pool.execute(
      `INSERT INTO field_setup
         (section_name, field_name, field_type, sort_order, core_key, custom_label,
          is_hidden, is_disabled, org_id)
       VALUES (?, ?, ?, ?, 'priority', ?, 0, 0, ?)`,
      [
        priority.section_name,
        priority.field_name,
        priority.field_type,
        priority.sort_order,
        'Tenant override (CI fixture)',
        orgId,
      ]
    );
  }

  // 2. A field this org invented. Not a platform field, so core_key stays NULL.
  //    Must sit in Case Information — coreFieldConfig scopes its check to that
  //    section when asserting that an org's own field is left untagged.
  await pool.execute(
    `INSERT INTO field_setup
       (section_name, field_name, field_type, sort_order, core_key, is_hidden, is_disabled, org_id)
     VALUES ('Case Information', 'CI Fixture Custom Field', 'text', 900, NULL, 0, 0, ?)`,
    [orgId]
  );
}
