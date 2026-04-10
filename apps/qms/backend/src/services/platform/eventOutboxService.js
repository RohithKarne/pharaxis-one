export async function queueOutboxEvent(client, params) {
  const { rows } = await client.query(
    `
      INSERT INTO qms_event_outbox (
        org_id,
        topic_key,
        payload_json
      ) VALUES ($1, $2, $3::jsonb)
      RETURNING *
    `,
    [params.orgId, params.topicKey, JSON.stringify(params.payloadJson || {})]
  );
  return rows[0];
}

export async function markOutboxPublished(client, outboxId) {
  const { rows } = await client.query(
    `
      UPDATE qms_event_outbox
      SET publish_status = 'Published', published_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [outboxId]
  );
  return rows[0] || null;
}

