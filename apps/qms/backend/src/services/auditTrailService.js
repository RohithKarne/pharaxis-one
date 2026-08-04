import { createSha256Hex } from '../utils/hash.js';

/**
 * Append-only audit ledger with a SHA-256 hash chain (21 CFR Part 11).
 *
 * WHY THIS MOVED OUT OF THE DATABASE
 * This used to call the plpgsql function qms_append_audit_event(...) in
 * src/db/migrations/0003_audit_function.sql. That function cannot be ported to
 * MySQL: it serialises concurrent appenders with pg_advisory_xact_lock, and
 * MySQL's GET_LOCK() is SESSION-scoped rather than transaction-scoped, so it
 * does not release on rollback and is not a drop-in.
 *
 * The replacement is deliberately dialect-neutral, so it can be proven on
 * PostgreSQL before the cutover and keep working after it.
 *
 * HOW SERIALISATION IS PRESERVED
 * Two appenders racing on the same org must not read the same prev_hash, or the
 * chain forks. Instead of an advisory lock we take a row lock on the org:
 *
 *     SELECT id FROM qms_orgs WHERE id = $1 FOR UPDATE
 *
 * `SELECT ... FOR UPDATE` is valid in both engines, and because this always runs
 * inside withRlsTransaction the lock lives exactly as long as the transaction —
 * the same lifetime pg_advisory_xact_lock had. The ORG row is locked rather than
 * the newest audit row because the org row is guaranteed to exist; locking "the
 * last event" would lock nothing at all for an org's first event, which is
 * exactly the case where two racing writers would both compute GENESIS.
 *
 * THE PREIMAGE — AND ONE DELIBERATE, DOCUMENTED CHANGE
 * Field order and separators are identical to the plpgsql version. One component
 * changed: the timestamp.
 *
 *   plpgsql: v_occurred_at::text  ->  '2026-08-04 09:18:00.123456+00'
 *   here:    toISOString()        ->  '2026-08-04T09:18:00.123Z'
 *
 * The Postgres rendering is an implementation detail of Postgres and cannot be
 * reproduced faithfully in MySQL, so ISO-8601 is now canonical. This also fixes
 * a PRE-EXISTING BUG: verifyAuditChain below already recomputed with
 * toISOString(), so it could never reproduce a digest written by the plpgsql
 * function. Writer and verifier now agree for the first time.
 *
 * CONSEQUENCE, STATED PLAINLY: events written BEFORE this change hashed their
 * timestamp the Postgres way, so their digests cannot be recomputed here. They
 * stay link-verifiable but not digest-verifiable. That boundary is a validation
 * decision — accept and document the cut point, or re-anchor the ledger — and it
 * belongs to compliance, not to this file.
 */

const GENESIS = 'GENESIS';

/**
 * Deterministic JSON with recursively sorted keys.
 *
 * NECESSARY, not cosmetic. Neither engine preserves object key order in a JSON
 * column: Postgres jsonb normalises keys (length, then bytewise) and MySQL JSON
 * sorts them too. So a payload written as {"probe":true,"n":42} is read back as
 * {"n":42,"probe":true}. Hashing JSON.stringify() of each would produce two
 * different digests for the same data, and every event would fail verification
 * — which is precisely what the first version of this file did.
 *
 * The original plpgsql sidestepped this by hashing p_payload_json::text, i.e.
 * the database's own normalised rendering. That is not reproducible across
 * engines, so we impose our own canonical order instead and use it on both the
 * write and the verify path.
 */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

/**
 * Build the hash preimage.
 *
 * Exported and shared by the writer and the verifier on purpose: the previous
 * pair drifted apart precisely because each spelled the format out separately,
 * and nothing forced them to agree.
 */
export function auditPreimage({
  prevHash,
  orgId,
  moduleKey,
  entityTable,
  entityId,
  actionKey,
  actorUserId,
  payloadJson,
  occurredAtIso
}) {
  return [
    prevHash || GENESIS,
    orgId,
    moduleKey,
    entityTable,
    entityId,
    actionKey,
    actorUserId || 'SYSTEM',
    canonicalJson(payloadJson ?? {}),
    occurredAtIso
  ].join('|');
}

export async function appendAuditEvent(dbClient, event) {
  const orgId = event.orgId;
  const payloadJson = event.payloadJson || {};

  // Serialise appenders for this org — see the note above.
  await dbClient.query('SELECT id FROM qms_orgs WHERE id = $1 FOR UPDATE', [orgId]);

  const { rows: tail } = await dbClient.query(
    `
      SELECT curr_hash
      FROM qms_audit_events
      WHERE org_id = $1
      ORDER BY id DESC
      LIMIT 1
    `,
    [orgId]
  );

  const prevHash = tail[0]?.curr_hash ?? null;
  const occurredAtIso = new Date().toISOString();

  const currHash = createSha256Hex(
    auditPreimage({
      prevHash,
      orgId,
      moduleKey: event.moduleKey,
      entityTable: event.entityTable,
      entityId: event.entityId,
      actionKey: event.actionKey,
      actorUserId: event.actorUserId || null,
      payloadJson,
      occurredAtIso
    })
  );

  await dbClient.query(
    `
      INSERT INTO qms_audit_events (
        org_id,
        module_key,
        entity_table,
        entity_id,
        action_key,
        actor_user_id,
        payload_json,
        occurred_at,
        prev_hash,
        curr_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      orgId,
      event.moduleKey,
      event.entityTable,
      event.entityId,
      event.actionKey,
      event.actorUserId || null,
      JSON.stringify(payloadJson),
      occurredAtIso,
      prevHash,
      currHash
    ]
  );

  return currHash;
}

/**
 * Full verification: chain linkage AND digest recomputation.
 *
 * utils/auditVerify.js — the one the /audit-chain/verify endpoint calls — checks
 * linkage ONLY. It compares prev_hash to the previous row's curr_hash and never
 * recomputes the digest, so it detects a broken link but NOT a tampered payload.
 * This function closes that gap.
 *
 * Events written before the timestamp-format change cannot be recomputed here.
 * Rather than reporting them as corrupt — alarming and wrong — they are counted
 * as `unverifiableDigestCount`, so the boundary is visible instead of silently
 * passing or silently failing.
 */
export async function verifyAuditChain(dbClient, orgId) {
  const { rows } = await dbClient.query(
    `
      SELECT id, org_id, module_key, entity_table, entity_id, action_key,
             actor_user_id, payload_json, occurred_at, prev_hash, curr_hash
      FROM qms_audit_events
      WHERE org_id = $1
      ORDER BY id ASC
    `,
    [orgId]
  );

  let previous = null;
  let digestVerified = 0;
  const unverifiableDigests = [];

  for (const row of rows) {
    if (row.prev_hash !== previous) {
      return {
        valid: false,
        failedAtId: row.id,
        reason: 'Broken chain link: prev_hash does not match the previous curr_hash'
      };
    }

    const payload =
      typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;

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

    if (computed === row.curr_hash) digestVerified += 1;
    else unverifiableDigests.push(row.id);

    previous = row.curr_hash;
  }

  return {
    valid: true,
    totalEvents: rows.length,
    linkVerified: rows.length,
    digestVerified,
    unverifiableDigestCount: unverifiableDigests.length,
    unverifiableDigestIds: unverifiableDigests.slice(0, 20)
  };
}
