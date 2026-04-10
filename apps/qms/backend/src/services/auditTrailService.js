import { createSha256Hex } from '../utils/hash.js';

export async function appendAuditEvent(dbClient, event) {
  const payload = {
    moduleKey: event.moduleKey,
    entityTable: event.entityTable,
    entityId: event.entityId,
    actionKey: event.actionKey,
    actorUserId: event.actorUserId || null,
    payloadJson: event.payloadJson || {}
  };

  const sql = `
    SELECT qms_append_audit_event($1, $2, $3, $4, $5, $6, $7::jsonb) AS event_id
  `;

  const values = [
    event.orgId,
    payload.moduleKey,
    payload.entityTable,
    payload.entityId,
    payload.actionKey,
    payload.actorUserId,
    JSON.stringify(payload.payloadJson)
  ];

  const { rows } = await dbClient.query(sql, values);
  return rows[0]?.event_id;
}

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

  for (const row of rows) {
    if (row.prev_hash !== previous) {
      return { valid: false, failedAtId: row.id, reason: 'Previous hash mismatch' };
    }

    const computed = createSha256Hex(
      `${row.prev_hash || 'GENESIS'}|${row.org_id}|${row.module_key}|${row.entity_table}|${row.entity_id}|${row.action_key}|${row.actor_user_id || 'SYSTEM'}|${JSON.stringify(row.payload_json)}|${row.occurred_at.toISOString()}`
    );

    if (computed !== row.curr_hash) {
      return { valid: false, failedAtId: row.id, reason: 'Current hash mismatch' };
    }

    previous = row.curr_hash;
  }

  return { valid: true, totalEvents: rows.length };
}
