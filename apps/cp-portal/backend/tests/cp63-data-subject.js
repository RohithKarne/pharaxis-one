/**
 * CP-63 regression — GDPR export + retention-aware erasure engine.
 * Provisions its own throwaway client + user + data, exercises buildExport and
 * eraseUser, and asserts the retention ruling: AE/PC retained (identity severed),
 * consent retained, everything else deleted, identity anonymized.
 *
 * This is the only CP Portal backend test that talks to a real database, so two
 * things about it are deliberate:
 *
 *   1. It refuses to run unless MYSQL_DATABASE names a database ending in
 *      `_test`. Left unset, database/db.js falls back to the developer's own
 *      pharaxis_cp_portal_dev — which is where this test inserted, erased and
 *      deleted rows on 2026-08-08. The guard below runs before db.js is
 *      required, so there is no path to that default.
 *   2. Cleanup deletes by the ids this run created, and nothing else. The
 *      previous version deleted every row with submitter_email = '[erased]',
 *      which is every previously-erased submission in the target database.
 *
 * Run: MYSQL_DATABASE=pharaxis_cp_portal_test node tests/cp63-data-subject.js
 */
'use strict';

const assert = require('assert');

// ── Target-database guard — before database/db.js is required ───────────────
const targetDb = process.env.MYSQL_DATABASE;

if (!targetDb && !process.env.MYSQL_HOST && !process.env.CI) {
  // Nothing is configured, so there is nothing to point at — the same
  // skip-on-a-laptop / run-in-CI rule tests/fresh-provision-mysql.js uses.
  console.log('SKIPPED — no test database configured (MYSQL_DATABASE is unset).');
  console.log('          Run it with: MYSQL_DATABASE=pharaxis_cp_portal_test node tests/cp63-data-subject.js');
  process.exit(0);
}

if (!targetDb || !targetDb.endsWith('_test')) {
  console.error(targetDb
    ? `FAILED — refusing to run against database "${targetDb}".`
    : 'FAILED — MYSQL_DATABASE is not set, so this would run against the database/db.js default (pharaxis_cp_portal_dev).');
  console.error('         This test inserts, erases and deletes rows. It only runs against a');
  console.error('         database whose name ends in "_test". Set MYSQL_DATABASE explicitly.');
  process.exit(1);
}

const { pool } = require('../database/db');
const { runMigrations } = require('../database/migrate');
const { buildExport, eraseUser } = require('../services/dataSubject');

let failures = 0;
const check = (name, fn) => { try { fn(); console.log(`✓ ${name}`); } catch (e) { failures++; console.error(`✗ ${name}\n   ${e.message}`); } };

async function main() {
  // CI provisions pharaxis_cp_portal_test empty, so build the schema before
  // using it. Already-migrated databases skip every file, so this is a no-op
  // for anyone re-running the test locally.
  await runMigrations({ logger: { log: () => {} } });

  const stamp = Date.now();
  const email = `cp63.test.${stamp}@example.invalid`;

  // Captured so cleanup can delete by id and nothing else.
  let clientId = null, uid = null, aeId = null, miId = null;

  try {
    // ── Fixtures ──────────────────────────────────────────────────────────
    // Provisioned here, not assumed: this used to hardcode client_id = 4 and
    // failed with a foreign-key error against a freshly migrated database.
    const [c] = await pool.execute(
      `INSERT INTO cp_clients (name, code) VALUES ('CP-63 Data Subject Test', ?)`, [`cp63-test-${stamp}`]);
    clientId = c.insertId;

    const [u] = await pool.execute(
      `INSERT INTO cp_portal_users (client_id, first_name, last_name, email, password, user_type, phone, specialty, country, is_active, email_verified)
       VALUES (?, 'Test', 'Subject', ?, 'x-dummy-hash', 'hcp', '+100', 'Oncology', 'US', 1, 1)`, [clientId, email]);
    uid = u.insertId;

    const mk = (type) => pool.execute(
      `INSERT INTO cp_submissions (client_id, submission_type, user_id, submitter_name, submitter_email, form_data, status)
       VALUES (?, ?, ?, 'Test Subject', ?, '{"x":1}', 'submitted')`, [clientId, type, uid, email]);
    const [ae] = await mk('adverse_event');
    aeId = ae.insertId;
    const [mi] = await mk('medical_inquiry');
    miId = mi.insertId;
    await pool.execute(`INSERT INTO cp_saved_items (portal_user_id, client_id, item_type, item_id) VALUES (?, ?, 'news', 1)`, [uid, clientId]);
    await pool.execute(`INSERT INTO cp_consent_records (client_id, user_id, version, choices_json) VALUES (?, ?, 1, '{"a":true}')`, [clientId, uid]);

    // ── Export (Art. 15) ──────────────────────────────────────────────────
    const exp = await buildExport(uid, clientId);
    check('export includes profile with email', () => assert.strictEqual(exp.profile.email, email));
    check('export includes both submissions', () => assert.strictEqual(exp.submissions.length, 2));
    check('export includes saved item + consent', () => {
      assert.strictEqual(exp.saved_items.length, 1);
      assert.strictEqual(exp.consent_records.length, 1);
    });
    check('export excludes password/token fields', () => assert.ok(!('password' in exp.profile)));

    // ── Erasure (Art. 17) with retention holds ────────────────────────────
    const summary = await eraseUser(uid, clientId);

    const [[aeRow]] = await pool.execute('SELECT user_id, submitter_name, submitter_email, submission_type FROM cp_submissions WHERE id=?', [aeId]);
    check('AE submission RETAINED with identity severed', () => {
      assert.ok(aeRow, 'AE row must still exist');
      assert.strictEqual(aeRow.user_id, null);
      assert.strictEqual(aeRow.submitter_name, '[erased]');
      assert.strictEqual(aeRow.submitter_email, '[erased]');
    });

    const [[miRow]] = await pool.execute('SELECT id FROM cp_submissions WHERE id=?', [miId]);
    check('MI submission DELETED', () => assert.strictEqual(miRow, undefined));

    const [[saved]] = await pool.execute('SELECT COUNT(*) n FROM cp_saved_items WHERE portal_user_id=?', [uid]);
    check('saved items DELETED', () => assert.strictEqual(saved.n, 0));

    const [[consent]] = await pool.execute('SELECT COUNT(*) n FROM cp_consent_records WHERE user_id=?', [uid]);
    check('consent records RETAINED (proof of consent)', () => assert.strictEqual(consent.n, 1));

    const [[usr]] = await pool.execute('SELECT first_name, email, is_active, phone, token_version FROM cp_portal_users WHERE id=?', [uid]);
    check('identity ANONYMIZED + deactivated + sessions killed', () => {
      assert.strictEqual(usr.first_name, '[erased]');
      assert.ok(usr.email.includes('anonymized.invalid'));
      assert.strictEqual(usr.is_active, 0);
      assert.strictEqual(usr.phone, null);
      assert.ok(usr.token_version >= 1);
    });

    check('summary reports retained AE + deleted MI', () => {
      assert.ok(summary.retained.some(s => s.includes('submissions')));
      assert.ok(summary.deleted.some(s => s.includes('submissions')));
      assert.ok(summary.anonymized.length >= 1);
    });
  } finally {
    // ── Cleanup — by id only ──────────────────────────────────────────────
    // Reported rather than swallowed: a cleanup that fails quietly leaves rows
    // behind in a database the next run assumes is clean.
    try {
      const subIds = [aeId, miId].filter(Boolean);
      if (subIds.length) {
        await pool.execute(`DELETE FROM cp_submissions WHERE id IN (${subIds.map(() => '?').join(',')})`, subIds);
      }
      if (uid) {
        await pool.execute('DELETE FROM cp_consent_records WHERE user_id=?', [uid]);
        await pool.execute('DELETE FROM cp_saved_items WHERE portal_user_id=?', [uid]);
        await pool.execute('DELETE FROM cp_data_requests WHERE portal_user_id=?', [uid]);
        await pool.execute('DELETE FROM cp_portal_users WHERE id=?', [uid]);
      }
      if (clientId) await pool.execute('DELETE FROM cp_clients WHERE id=?', [clientId]);
    } catch (err) {
      failures++;
      console.error(`✗ cleanup failed — rows may remain (client ${clientId}, user ${uid})\n   ${err.message}`);
    }
  }

  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll CP-63 data-subject checks passed.');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error('ERR', e.message); process.exit(2); });
