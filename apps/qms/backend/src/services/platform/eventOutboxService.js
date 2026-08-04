import { randomUUID } from 'crypto';

export async function queueOutboxEvent(client, params) {
  const id = randomUUID();
  await client.query(
    `
      INSERT INTO qms_event_outbox (
        id,
        org_id,
        topic_key,
        payload_json
      ) VALUES ($1, $2, $3, $4)
    `,
    [id, params.orgId, params.topicKey, JSON.stringify(params.payloadJson || {})]
  );
  const { rows } = await client.query(
    'SELECT * FROM qms_event_outbox WHERE id = $1 AND org_id = $2',
    [id, params.orgId]
  );
  return rows[0];
}

export async function markOutboxPublished(client, orgId, outboxId) {
  await client.query(
    `
      UPDATE qms_event_outbox
      SET publish_status = 'Published', published_at = CURRENT_TIMESTAMP(3)
      WHERE id = $1 AND org_id = $2
    `,
    [outboxId, orgId]
  );
  const { rows } = await client.query(
    'SELECT * FROM qms_event_outbox WHERE id = $1 AND org_id = $2',
    [outboxId, orgId]
  );
  return rows[0] || null;
}

export async function markOutboxFailed(client, orgId, outboxId, errorMessage) {
  await client.query(
    `
      UPDATE qms_event_outbox
      SET
        publish_status = 'Failed',
        retry_count = retry_count + 1,
        last_error = $2
      WHERE id = $1 AND org_id = $3
    `,
    [outboxId, errorMessage || null, orgId]
  );
  const { rows } = await client.query(
    'SELECT * FROM qms_event_outbox WHERE id = $1 AND org_id = $2',
    [outboxId, orgId]
  );
  return rows[0] || null;
}

export async function retryOutboxEvent(client, orgId, outboxId) {
  await client.query(
    `
      UPDATE qms_event_outbox
      SET
        publish_status = 'Queued',
        last_error = NULL
      WHERE id = $1 AND org_id = $2
    `,
    [outboxId, orgId]
  );
  const { rows } = await client.query(
    'SELECT * FROM qms_event_outbox WHERE id = $1 AND org_id = $2',
    [outboxId, orgId]
  );
  return rows[0] || null;
}
