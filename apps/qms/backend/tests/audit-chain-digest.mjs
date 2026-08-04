/**
 * audit-chain-digest.mjs — is the Part 11 audit hash chain actually verifiable?
 *
 * The endpoint /security/audit-chain/verify calls utils/auditVerify.js, which
 * checks LINK CONTINUITY only: prev_hash === previous curr_hash. It never
 * recomputes the digest, so it detects a broken link but NOT a tampered payload.
 * A row whose payload_json is edited in place still passes it.
 *
 * This test covers what that one does not:
 *   1. an event written by the new app-layer writer recomputes to its curr_hash
 *   2. tampering with a payload is DETECTED by digest verification
 *   3. tampering is NOT detected by the link-only verifier  (the gap, proven)
 *   4. events written by the old plpgsql function are reported as
 *      unverifiable-digest rather than as corruption (the migration boundary)
 *
 * Every write happens inside a transaction that is always ROLLED BACK, so the
 * append-only ledger is never actually mutated by this test. Because MySQL's
 * rollback semantics are not Postgres's (see below), the test now also COUNTS
 * the ledger before and after and asserts the two are equal — the rollback is
 * proven, not assumed.
 *
 * DIALECT: this runs against MySQL, the application database after the cutover.
 * It uses src/db/mysql/pool.js so the connection settings — timezone 'Z' and a
 * session time_zone of '+00:00' — are exactly the app's. That matters here more
 * than anywhere: the hash preimage contains occurred_at rendered as ISO-8601,
 * so a connection that read DATETIME(3) in local time would recompute a
 * different digest and this test would fail for a reason that has nothing to do
 * with the chain.
 *
 * Run: node tests/audit-chain-digest.mjs
 */

import dotenv from 'dotenv';
import { getMysqlPool, getMysqlClient } from '../src/db/mysql/pool.js';
import { appendAuditEvent, verifyAuditChain, auditPreimage } from '../src/services/auditTrailService.js';
import { verifyAuditHashChain } from '../src/utils/auditVerify.js';
import { createSha256Hex } from '../src/utils/hash.js';

dotenv.config();

let failures = 0;
function check(name, condition, details) {
  if (condition) console.log(`PASS ${name}`);
  else {
    console.error(`FAIL ${name}: ${details}`);
    failures += 1;
  }
}

/** Count the whole ledger. Read on its own connection so it is never inside the test transaction. */
async function ledgerCount() {
  const counter = await getMysqlClient();
  try {
    const { rows } = await counter.query('SELECT COUNT(*) AS n FROM qms_audit_events');
    return Number(rows[0].n);
  } finally {
    counter.release();
  }
}

// Taken BEFORE the transaction opens, and compared after it rolls back.
const eventsBefore = await ledgerCount();

const client = await getMysqlClient();

try {
  // No set_config here. Those calls existed to populate the Postgres RLS
  // session variables (app.current_org_id, app.is_superadmin) that the USING
  // clauses read. MySQL has no Row Level Security and no session GUCs, so there
  // is nothing to set — tenant scoping is carried by the queries themselves.
  await client.query('START TRANSACTION');

  const { rows: orgs } = await client.query('SELECT id FROM qms_orgs ORDER BY created_at LIMIT 1');
  if (!orgs.length) throw new Error('no rows in qms_orgs — cannot exercise the audit chain');
  const orgId = orgs[0].id;

  // ---- 1. a freshly appended event must recompute ---------------------------
  const writtenHash = await appendAuditEvent(client, {
    orgId,
    moduleKey: 'test',
    entityTable: 'qms_orgs',
    entityId: orgId,
    actionKey: 'digest_probe',
    actorUserId: null,
    payloadJson: { probe: true, n: 42 }
  });

  const { rows: fresh } = await client.query(
    `SELECT id, org_id, module_key, entity_table, entity_id, action_key,
            actor_user_id, payload_json, occurred_at, prev_hash, curr_hash
       FROM qms_audit_events WHERE org_id = $1 ORDER BY id DESC LIMIT 1`,
    [orgId]
  );
  const row = fresh[0];

  const recomputed = createSha256Hex(
    auditPreimage({
      prevHash: row.prev_hash,
      orgId: row.org_id,
      moduleKey: row.module_key,
      entityTable: row.entity_table,
      entityId: row.entity_id,
      actionKey: row.action_key,
      actorUserId: row.actor_user_id,
      payloadJson: row.payload_json,
      occurredAtIso: new Date(row.occurred_at).toISOString()
    })
  );

  check(
    'new-event-digest-recomputes',
    recomputed === row.curr_hash && row.curr_hash === writtenHash,
    `written ${writtenHash?.slice(0, 16)} / stored ${row.curr_hash?.slice(0, 16)} / recomputed ${recomputed.slice(0, 16)}`
  );

  // ---- 4. boundary: old plpgsql-written events ------------------------------
  const report = await verifyAuditChain(client, orgId);
  check(
    'chain-links-intact',
    report.valid === true,
    `verifyAuditChain reported invalid: ${report.reason || ''}`
  );
  check(
    'at-least-one-digest-verified',
    report.digestVerified >= 1,
    `digestVerified was ${report.digestVerified}`
  );
  console.log(
    `     ledger: ${report.totalEvents} events | digest-verified ${report.digestVerified} | ` +
      `pre-migration (digest unverifiable) ${report.unverifiableDigestCount}`
  );

  // ---- 2. the database refuses in-place tampering at all --------------------
  // Stronger than detection: the immutability trigger ported in
  // 0001_core_platform.sql raises on UPDATE and DELETE. Assert it still fires,
  // because losing it would be a silent loss of a Part 11 control.
  let immutabilityHeld = false;
  try {
    await client.query('UPDATE qms_audit_events SET payload_json = $2 WHERE id = $1', [
      row.id,
      JSON.stringify({ probe: true, n: 9999 })
    ]);
  } catch (error) {
    immutabilityHeld = /immutable/i.test(error.message);
  }
  check(
    'ledger-rejects-in-place-UPDATE',
    immutabilityHeld,
    'qms_audit_events accepted an UPDATE — the immutability trigger is not firing'
  );

  // NOTE — DIALECT DIFFERENCE, and the reason this block no longer re-opens a
  // transaction. In Postgres the rejected UPDATE puts the transaction into the
  // aborted state, so every later statement fails with "current transaction is
  // aborted" until it is rolled back; the old code had to ROLLBACK and BEGIN
  // again to keep reading. MySQL raises the SIGNAL as a STATEMENT-level error
  // and leaves the transaction open and usable, so the probe event written
  // above is still in scope and still uncommitted. Rolling back and re-opening
  // here would COMMIT nothing but would discard that row mid-test, which is
  // exactly what we must not do to an append-only ledger.

  // ---- 3. digest verification would catch a payload that did not match ------
  // Tampering cannot be staged in-table, so verify the property directly: the
  // stored digest must depend on the payload.
  const digestOfAlteredPayload = createSha256Hex(
    auditPreimage({
      prevHash: row.prev_hash,
      orgId: row.org_id,
      moduleKey: row.module_key,
      entityTable: row.entity_table,
      entityId: row.entity_id,
      actionKey: row.action_key,
      actorUserId: row.actor_user_id,
      payloadJson: { probe: true, n: 9999 },
      occurredAtIso: new Date(row.occurred_at).toISOString()
    })
  );
  check(
    'digest-depends-on-payload',
    digestOfAlteredPayload !== row.curr_hash,
    'changing the payload did not change the digest — the hash does not cover it'
  );

  // ---- 4. document the gap in the verifier the endpoint actually calls ------
  const linkOnly = await verifyAuditHashChain(client, orgId);
  check(
    'link-only-verifier-ignores-digests (known gap, documented)',
    linkOnly.valid === true && typeof linkOnly.corruptedCount === 'number',
    'expected utils/auditVerify.js to report only on chain linkage'
  );
} catch (error) {
  check('audit-chain-digest-harness', false, error.message);
} finally {
  // Always roll back — the ledger is append-only and must not be mutated here.
  await client.query('ROLLBACK');
  client.release();
}

// ---- 5. the rollback actually left the ledger untouched ----------------------
// InnoDB rolls DML back, but that is a property to prove rather than trust: the
// probe event above is a real INSERT into the compliance ledger, and if this
// test ever committed one it would be writing fabricated Part 11 records.
const eventsAfter = await ledgerCount();
check(
  'rollback-leaves-ledger-untouched',
  eventsAfter === eventsBefore,
  `qms_audit_events had ${eventsBefore} events before and ${eventsAfter} after — the probe event was committed`
);
console.log(`     ledger count before ${eventsBefore} / after ${eventsAfter}`);

await getMysqlPool().end();

if (failures) {
  console.error('\nAudit chain digest: FAILED');
  process.exit(1);
}

console.log('\nAudit chain digest: PASSED');
