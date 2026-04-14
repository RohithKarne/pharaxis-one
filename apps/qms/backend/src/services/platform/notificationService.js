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

export async function markEmailNotificationSent(client, notificationId) {
  const { rows } = await client.query(
    `
      UPDATE qms_email_notifications
      SET delivery_status = 'Sent', sent_at = now(), last_error = NULL
      WHERE id = $1
      RETURNING *
    `,
    [notificationId]
  );
  return rows[0] || null;
}

export async function markEmailNotificationFailed(client, notificationId, errorMessage) {
  const { rows } = await client.query(
    `
      UPDATE qms_email_notifications
      SET
        delivery_status = 'Failed',
        retry_count = retry_count + 1,
        last_error = $2
      WHERE id = $1
      RETURNING *
    `,
    [notificationId, errorMessage || null]
  );
  return rows[0] || null;
}

export async function retryEmailNotification(client, notificationId) {
  const { rows } = await client.query(
    `
      UPDATE qms_email_notifications
      SET
        delivery_status = 'Queued',
        last_error = NULL
      WHERE id = $1
      RETURNING *
    `,
    [notificationId]
  );
  return rows[0] || null;
}
