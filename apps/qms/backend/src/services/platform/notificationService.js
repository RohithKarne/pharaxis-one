export async function createInAppNotification(client, params) {
  const { rows } = await client.query(
    `
      INSERT INTO qms_notifications (
        org_id,
        recipient_user_id,
        event_type,
        title,
        message,
        payload_json
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING *
    `,
    [
      params.orgId,
      params.recipientUserId || null,
      params.eventType,
      params.title,
      params.message,
      JSON.stringify(params.payloadJson || {})
    ]
  );
  return rows[0];
}

export async function queueEmailNotification(client, params) {
  const { rows } = await client.query(
    `
      INSERT INTO qms_email_notifications (
        org_id,
        recipient_email,
        subject,
        body
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [params.orgId, params.recipientEmail, params.subject, params.body]
  );
  return rows[0];
}

