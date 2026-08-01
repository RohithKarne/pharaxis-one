/**
 * CP-63 regression — GDPR export + retention-aware erasure engine.
 * Provisions its own throwaway user + data, exercises buildExport and eraseUser,
 * and asserts the retention ruling: AE/PC retained (identity severed), consent
 * retained, everything else deleted, identity anonymized. Cleans up after itself.
 *
 * Run: node tests/cp63-data-subject.js
 */
const assert = require('assert');
const { pool } = require('../database/db');
const { buildExport, eraseUser } = require('../services/dataSubject');

let failures = 0;
const check = (name, fn) => { try { fn(); console.log(`✓ ${name}`); } catch (e) { failures++; console.error(`✗ ${name}\n   ${e.message}`); } };

async function main() {
  const CLIENT = 4;
  const email = `cp63.test.${Date.now()}@example.invalid`;

  // ── Fixtures ──────────────────────────────────────────────────────────────
  const [u] = await pool.execute(
    `INSERT INTO cp_portal_users (client_id, first_name, last_name, email, password, user_type, phone, specialty, country, is_active, email_verified)
     VALUES (?, 'Test', 'Subject', ?, 'x-dummy-hash', 'hcp', '+100', 'Oncology', 'US', 1, 1)`, [CLIENT, email]);
  const uid = u.insertId;

  const mk = (type) => pool.execute(
    `INSERT INTO cp_submissions (client_id, submission_type, user_id, submitter_name, submitter_email, form_data, status)
     VALUES (?, ?, ?, 'Test Subject', ?, '{"x":1}', 'submitted')`, [CLIENT, type, uid, email]);
  const [ae] = await mk('adverse_event');
  const [mi] = await mk('medical_inquiry');
  await pool.execute(`INSERT INTO cp_saved_items (portal_user_id, client_id, item_type, item_id) VALUES (?, ?, 'news', 1)`, [uid, CLIENT]);
  await pool.execute(`INSERT INTO cp_consent_records (client_id, user_id, version, choices_json) VALUES (?, ?, 1, '{"a":true}')`, [CLIENT, uid]);

  try {
    // ── Export (Art. 15) ──────────────────────────────────────────────────
    const exp = await buildExport(uid, CLIENT);
    check('export includes profile with email', () => assert.strictEqual(exp.profile.email, email));
    check('export includes both submissions', () => assert.strictEqual(exp.submissions.length, 2));
    check('export includes saved item + consent', () => {
      assert.strictEqual(exp.saved_items.length, 1);
      assert.strictEqual(exp.consent_records.length, 1);
    });
    check('export excludes password/token fields', () => assert.ok(!('password' in exp.profile)));

    // ── Erasure (Art. 17) with retention holds ────────────────────────────
    const summary = await eraseUser(uid, CLIENT);

    const [[aeRow]] = await pool.execute('SELECT user_id, submitter_name, submitter_email, submission_type FROM cp_submissions WHERE id=?', [ae.insertId]);
    check('AE submission RETAINED with identity severed', () => {
      assert.ok(aeRow, 'AE row must still exist');
      assert.strictEqual(aeRow.user_id, null);
      assert.strictEqual(aeRow.submitter_name, '[erased]');
      assert.strictEqual(aeRow.submitter_email, '[erased]');
    });

    const [[miRow]] = await pool.execute('SELECT id FROM cp_submissions WHERE id=?', [mi.insertId]);
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
    // ── Cleanup ──────────────────────────────────────────────────────────
    await pool.execute('DELETE FROM cp_submissions WHERE user_id=? OR (submitter_email=? )', [uid, '[erased]']).catch(() => {});
    await pool.execute('DELETE FROM cp_submissions WHERE client_id=? AND form_data=? AND submitter_name=?', [CLIENT, '{"x":1}', '[erased]']).catch(() => {});
    await pool.execute('DELETE FROM cp_consent_records WHERE user_id=?', [uid]).catch(() => {});
    await pool.execute('DELETE FROM cp_saved_items WHERE portal_user_id=?', [uid]).catch(() => {});
    await pool.execute('DELETE FROM cp_data_requests WHERE portal_user_id=?', [uid]).catch(() => {});
    await pool.execute('DELETE FROM cp_portal_users WHERE id=?', [uid]).catch(() => {});
  }

  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll CP-63 data-subject checks passed.');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error('ERR', e.message); process.exit(2); });
