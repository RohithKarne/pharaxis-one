/**
 * audit-chain-concurrency.mjs — does the Part 11 hash chain survive concurrent writers?
 *
 * THIS IS THE TEST KIRANMAI EXCLUDED FROM QA SIGN-OFF.
 *
 * The PostgreSQL implementation serialised appenders with
 * `pg_advisory_xact_lock(hashtextextended(org_id))`. MySQL has no
 * transaction-scoped advisory lock — GET_LOCK() is session-scoped and does not
 * release on rollback — so appendAuditEvent() now serialises by taking a row
 * lock on the org:
 *
 *     SELECT id FROM qms_orgs WHERE id = ? FOR UPDATE
 *
 * If that lock does not actually serialise, two writers read the same
 * `prev_hash`, both compute a digest from it, and the chain FORKS: two events
 * claim the same parent. Single-user testing cannot detect this — every
 * verification so far has been sequential, so the bug would be invisible until
 * production concurrency.
 *
 * A forked chain is not a cosmetic defect. It means the audit ledger can no
 * longer prove ordering, which is the entire point of 21 CFR Part 11.10(e).
 *
 * WHAT IS ASSERTED
 *   1. no duplicate prev_hash  — the fork signature
 *   2. no duplicate curr_hash
 *   3. every event links to its predecessor, in id order
 *   4. exactly N events were written for N concurrent callers (none lost)
 *   5. every new event's digest recomputes
 *
 * The writes are real and are NOT rolled back — qms_audit_events is append-only
 * and blocks DELETE at the database level, which is correct. This test
 * therefore appends N events to the dev ledger each run, by design.
 *
 * Run:  node tests/audit-chain-concurrency.mjs
 *       CONCURRENCY=32 node tests/audit-chain-concurrency.mjs
 */

import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { appendAuditEvent, auditPreimage } from '../src/services/auditTrailService.js';
import { asPgClient } from '../src/db/mysql/pgCompat.js';
import { createSha256Hex } from '../src/utils/hash.js';

dotenv.config();

const CONCURRENCY = Number(process.env.CONCURRENCY || 16);

const MYSQL = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'devuser',
  password: process.env.MYSQL_PASSWORD || 'devpass',
  database: process.env.MYSQL_DATABASE || 'pharaxis_qms_dev',
  timezone: 'Z'
};

let failures = 0;
function check(name, condition, details) {
  if (condition) console.log(`PASS ${name}`);
  else {
    console.error(`FAIL ${name}: ${details}`);
    failures += 1;
  }
}

const pool = mysql.createPool({ ...MYSQL, connectionLimit: CONCURRENCY + 4, waitForConnections: true });
pool.on('connection', (c) => c.query("SET time_zone = '+00:00'"));

try {
  const [[org]] = await pool.query('SELECT id FROM qms_orgs ORDER BY created_at LIMIT 1');
  const orgId = org.id;

  const [[before]] = await pool.query(
    'SELECT count(*) n, max(id) maxId FROM qms_audit_events WHERE org_id = ?',
    [orgId]
  );
  console.log(`org ${orgId} — ${before.n} events before, launching ${CONCURRENCY} concurrent appends\n`);

  /**
   * Each writer takes its OWN connection and its OWN transaction, exactly as a
   * real request does via withMysqlTransaction. Sharing a connection would
   * serialise them by accident and the test would prove nothing.
   */
  async function writer(i) {
    const connection = await pool.getConnection();
    const client = asPgClient(connection);
    try {
      await connection.beginTransaction();
      await appendAuditEvent(client, {
        orgId,
        moduleKey: 'concurrency-probe',
        entityTable: 'qms_orgs',
        entityId: orgId,
        actionKey: 'concurrent_append',
        actorUserId: null,
        payloadJson: { writer: i }
      });
      await connection.commit();
      return { i, ok: true };
    } catch (error) {
      await connection.rollback();
      return { i, ok: false, error: error.code || error.message };
    } finally {
      connection.release();
    }
  }

  const results = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => writer(i)));
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log(`  ${failed.length} writer(s) errored: ${[...new Set(failed.map((f) => f.error))].join(', ')}`);
  }

  // ---- 4. nothing lost -------------------------------------------------------
  const [[after]] = await pool.query('SELECT count(*) n FROM qms_audit_events WHERE org_id = ?', [orgId]);
  check(
    'all-concurrent-appends-persisted',
    after.n - before.n === succeeded,
    `${succeeded} writers reported success but ${after.n - before.n} rows appeared`
  );

  // ---- 1 & 2. the fork signature --------------------------------------------
  // NOTE: NULL prev_hash is deliberately NOT excluded. An earlier version of this
  // query filtered `prev_hash IS NOT NULL`, which meant the worst case was
  // invisible: on an empty chain every concurrent writer reads NULL and inserts
  // NULL, producing N competing GENESIS events — a fork, and the filter hid it.
  // MySQL's GROUP BY collects NULLs into one group, so this catches both.
  const [dupPrev] = await pool.query(
    `SELECT prev_hash, count(*) n FROM qms_audit_events
      WHERE org_id = ?
      GROUP BY prev_hash HAVING count(*) > 1`,
    [orgId]
  );
  check(
    'no-forked-chain (duplicate prev_hash)',
    dupPrev.length === 0,
    `${dupPrev.length} hash(es) claimed as parent by more than one event — the chain forked`
  );

  const [dupCurr] = await pool.query(
    `SELECT curr_hash, count(*) n FROM qms_audit_events
      WHERE org_id = ? GROUP BY curr_hash HAVING count(*) > 1`,
    [orgId]
  );
  check('no-duplicate-curr_hash', dupCurr.length === 0, `${dupCurr.length} duplicated digest(s)`);

  // ---- 3 & 5. linkage and digest over the events this run created ------------
  const [rows] = await pool.query(
    `SELECT id, org_id, module_key, entity_table, entity_id, action_key,
            actor_user_id, payload_json, occurred_at, prev_hash, curr_hash
       FROM qms_audit_events WHERE org_id = ? ORDER BY id ASC`,
    [orgId]
  );

  let broken = null;
  let previous = null;
  for (const row of rows) {
    if (row.prev_hash !== previous) { broken = row.id; break; }
    previous = row.curr_hash;
  }
  check('chain-links-unbroken-after-concurrency', broken === null, `first break at event id ${broken}`);

  const fresh = rows.filter((r) => Number(r.id) > Number(before.maxId ?? 0));
  let digestOk = 0;
  for (const row of fresh) {
    const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
    const computed = createSha256Hex(
      auditPreimage({
        prevHash: row.prev_hash,
        orgId: row.org_id,
        moduleKey: row.module_key,
        entityTable: row.entity_table,
        entityId: row.entity_id,
        actionKey: row.action_key,
        actorUserId: row.actor_user_id,
        payloadJson: payload,
        occurredAtIso: new Date(row.occurred_at).toISOString()
      })
    );
    if (computed === row.curr_hash) digestOk += 1;
  }
  check(
    'every-concurrent-event-digest-verifies',
    fresh.length > 0 && digestOk === fresh.length,
    `${digestOk}/${fresh.length} recomputed`
  );

  console.log(
    `\n  ${CONCURRENCY} writers -> ${succeeded} committed, ${fresh.length} new events, ` +
      `${digestOk} digest-verified, ledger now ${after.n}`
  );
} catch (error) {
  check('audit-chain-concurrency-harness', false, error.message);
} finally {
  await pool.end();
}

if (failures) {
  console.error('\nAudit chain concurrency: FAILED');
  process.exit(1);
}

console.log('\nAudit chain concurrency: PASSED');
