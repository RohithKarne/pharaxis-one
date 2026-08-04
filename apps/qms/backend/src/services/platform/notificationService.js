import { randomUUID } from 'crypto';

export async function createInAppNotification(client, params) {
  const id = randomUUID();
  await client.query(
    `
      INSERT INTO qms_notifications (
        id,
        org_id,
        recipient_user_id,
        event_type,
        title,
        message,
        payload_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      id,
      params.orgId,
      params.recipientUserId || null,
      params.eventType,
      params.title,
      params.message,
      JSON.stringify(params.payloadJson || {})
    ]
  );
  const { rows } = await client.query(
    'SELECT * FROM qms_notifications WHERE id = $1 AND org_id = $2',
    [id, params.orgId]
  );
  return rows[0];
}

export async function queueEmailNotification(client, params) {
  const id = randomUUID();
  await client.query(
    `
      INSERT INTO qms_email_notifications (
        id,
        org_id,
        recipient_email,
        subject,
        body
      ) VALUES ($1, $2, $3, $4, $5)
    `,
    [id, params.orgId, params.recipientEmail, params.subject, params.body]
  );
  const { rows } = await client.query(
    'SELECT * FROM qms_email_notifications WHERE id = $1 AND org_id = $2',
    [id, params.orgId]
  );
  return rows[0];
}

export async function markEmailNotificationSent(client, orgId, notificationId) {
  await client.query(
    `
      UPDATE qms_email_notifications
      SET delivery_status = 'Sent', sent_at = CURRENT_TIMESTAMP(3), last_error = NULL
      WHERE id = $1 AND org_id = $2
    `,
    [notificationId, orgId]
  );
  const { rows } = await client.query(
    'SELECT * FROM qms_email_notifications WHERE id = $1 AND org_id = $2',
    [notificationId, orgId]
  );
  return rows[0] || null;
}

export async function markEmailNotificationFailed(client, orgId, notificationId, errorMessage) {
  await client.query(
    `
      UPDATE qms_email_notifications
      SET
        delivery_status = 'Failed',
        retry_count = retry_count + 1,
        last_error = $2
      WHERE id = $1 AND org_id = $3
    `,
    [notificationId, errorMessage || null, orgId]
  );
  const { rows } = await client.query(
    'SELECT * FROM qms_email_notifications WHERE id = $1 AND org_id = $2',
    [notificationId, orgId]
  );
  return rows[0] || null;
}

export async function retryEmailNotification(client, orgId, notificationId) {
  await client.query(
    `
      UPDATE qms_email_notifications
      SET
        delivery_status = 'Queued',
        last_error = NULL
      WHERE id = $1 AND org_id = $2
    `,
    [notificationId, orgId]
  );
  const { rows } = await client.query(
    'SELECT * FROM qms_email_notifications WHERE id = $1 AND org_id = $2',
    [notificationId, orgId]
  );
  return rows[0] || null;
}
