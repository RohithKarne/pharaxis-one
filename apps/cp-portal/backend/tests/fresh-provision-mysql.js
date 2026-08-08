/**
 * Fresh-database provisioning — against a REAL MySQL server.
 *
 * tests/fresh-provision.js proves the runner's ordering and bookkeeping using a
 * fake pool. It cannot prove the DDL in 0000_baseline.sql is valid MySQL, that
 * the foreign keys resolve in the order the file declares them, or that a second
 * run is genuinely a no-op. Only a real server proves that, and this is the file
 * that does it.
 *
 * It creates a throwaway database, runs the migration runner against it exactly
 * as a new environment would, asserts the resulting schema, runs it a second
 * time to prove idempotency, and drops the database again.
 *
 * Skips when MYSQL_HOST is unset, so it is a no-op on a laptop without MySQL.
 * CI sets MYSQL_HOST, so it always runs there — and fails the build rather than
 * skipping, because a provisioning test that quietly does nothing is worse than
 * no test at all.
 *
 * Run: node tests/fresh-provision-mysql.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

if (!process.env.MYSQL_HOST) {
  console.log('SKIPPED — MYSQL_HOST is not set, so there is no server to provision against.');
  console.log('          This check runs in CI, where a MySQL service is provided.');
  process.exit(0);
}

const mysql = require('mysql2/promise');

const migrationsDir = path.resolve(__dirname, '../database/migrations');
const SCRATCH_DB    = 'pharaxis_cp_portal_provision_check';

const server = {
  host    : process.env.MYSQL_HOST,
  port    : parseInt(process.env.MYSQL_PORT || '3306'),
  user    : process.env.MYSQL_USER     || 'devuser',
  password: process.env.MYSQL_PASSWORD || 'devpass',
  multipleStatements: false,
};

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
}

(async () => {
  const admin = await mysql.createConnection(server);
  await admin.query(`DROP DATABASE IF EXISTS \`${SCRATCH_DB}\``);
  await admin.query(`CREATE DATABASE \`${SCRATCH_DB}\` CHARACTER SET utf8mb4`);

  // database/db.js reads MYSQL_DATABASE when it is first required, and
  // migrate.js closes over that pool — so point it at the scratch database
  // before either module is loaded.
  process.env.MYSQL_DATABASE = SCRATCH_DB;
  const { pool } = require('../database/db');
  const { runMigrations } = require('../database/migrate');

  const quiet = { log: () => {} };
  let firstRun, secondRun, tables = new Set(), recorded = new Set();
  let provisionError = null;

  try {
    // THE test: an empty database, provisioned by the migration runner alone.
    // Before 0000_baseline.sql this threw ER_FK_CANNOT_OPEN_PARENT on 0002.
    firstRun = await runMigrations({ logger: quiet });

    const [tableRows] = await pool.query(
      'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?',
      [SCRATCH_DB]
    );
    tables = new Set(tableRows.map(r => String(r.t).toLowerCase()));

    const [appliedRows] = await pool.query('SELECT filename FROM cp_schema_migrations');
    recorded = new Set(appliedRows.map(r => r.filename));

    // Running it again must change nothing.
    secondRun = await runMigrations({ logger: quiet });
  } catch (err) {
    provisionError = err;
  }

  check('M1  the migration runner provisions an empty database without error', () => {
    if (provisionError) {
      throw new Error(`${provisionError.code || ''} ${provisionError.message}`.trim());
    }
  });

  if (!provisionError) {
    const expectedTables = [...fs.readFileSync(path.join(migrationsDir, '0000_baseline.sql'), 'utf8')
      .matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)].map(m => m[1].toLowerCase());

    check('M2  every table declared in the baseline exists', () => {
      const missing = expectedTables.filter(t => !tables.has(t));
      assert.deepStrictEqual(missing, [], `missing tables: ${missing.join(', ')}`);
    });

    check('M3  every migration file is recorded as applied', () => {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      const missing = files.filter(f => !recorded.has(f));
      assert.deepStrictEqual(missing, [], `not recorded: ${missing.join(', ')}`);
    });

    check('M4  a second run applies nothing', () => {
      assert.strictEqual(secondRun.appliedCount, 0,
        `second run applied ${secondRun.appliedCount} file(s) — the migrations are not idempotent`);
    });

  }

  // Column and constraint assertions need one more round-trip, done here so the
  // check() helper above can stay synchronous.
  if (!provisionError) {
    const [colRows] = await pool.query(
      'SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = ?',
      [SCRATCH_DB]
    );
    const columns = new Set(colRows.map(r => `${String(r.t).toLowerCase()}.${String(r.c).toLowerCase()}`));

    check('M5  columns that only existed in migrations 0006-0009 are present', () => {
      const want = [
        'cp_portal_users.token_version',
        'cp_portal_users.reset_token',
        'cp_portal_users.reset_token_expires_at',
        'cp_admin_users.token_version',
        'cp_clients.login_mode',
        'cp_integration_config.mims_case_url_base',
        'cp_chatbox_config.api_key',
        'cp_form_config.updated_at',
      ];
      const missing = want.filter(k => !columns.has(k));
      assert.deepStrictEqual(missing, [], `missing columns: ${missing.join(', ')}`);
    });

    const [fkRows] = await pool.query(
      `SELECT constraint_name AS n FROM information_schema.table_constraints
        WHERE table_schema = ? AND constraint_type = 'FOREIGN KEY'`,
      [SCRATCH_DB]
    );
    const fks = new Set(fkRows.map(r => String(r.n).toLowerCase()));

    check('M6  the foreign keys that could not be created before now exist', () => {
      // fk_digest_client is the one that failed on 0002 with
      // ER_FK_CANNOT_OPEN_PARENT, because cp_clients did not exist yet.
      for (const fk of ['fk_digest_client', 'fk_slots_msl', 'fk_admin_client', 'fk_subatt_sub']) {
        assert.ok(fks.has(fk), `foreign key ${fk} was not created`);
      }
    });
  }

  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS \`${SCRATCH_DB}\``);
  await admin.end();

  console.log(failures === 0
    ? '\nFresh-database provisioning verified against MySQL.'
    : `\n${failures} check(s) FAILED against MySQL.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(err => {
  console.error('Provisioning check crashed:', err);
  process.exit(1);
});
