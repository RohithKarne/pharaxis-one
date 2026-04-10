import { createInAppNotification, queueEmailNotification } from './notificationService.js';

function daysUntil(dateValue) {
  const target = new Date(dateValue);
  const now = new Date();
  const diff = target.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0);
  return Math.round(diff / 86400000);
}

export async function runPeriodicAlerts(client, orgId) {
  const alertDays = new Set([90, 60, 30, 7]);
  let totalAlerts = 0;

  const { rows: docs } = await client.query(
    `
      SELECT id, title, owner_user_id, next_review_due_date
      FROM dc_documents
      WHERE org_id = $1
        AND next_review_due_date IS NOT NULL
    `,
    [orgId]
  );

  for (const doc of docs) {
    const days = daysUntil(doc.next_review_due_date);
    if (!alertDays.has(days)) continue;

    await createInAppNotification(client, {
      orgId,
      recipientUserId: doc.owner_user_id,
      eventType: 'DOCUMENT_REVIEW_DUE',
      title: `Document review due in ${days} days`,
      message: `Document "${doc.title}" review is due in ${days} days.`,
      payloadJson: { documentId: doc.id, dueInDays: days }
    });

    await queueEmailNotification(client, {
      orgId,
      recipientEmail: 'owner@pharaxis.local',
      subject: `QMS alert: document review due in ${days} days`,
      body: `Document ${doc.title} requires periodic review in ${days} days.`
    });

    totalAlerts += 1;
  }

  const { rows: systems } = await client.query(
    `
      SELECT id, system_name, system_owner_user_id, next_review_due_date
      FROM vs_system_inventory
      WHERE org_id = $1
        AND next_review_due_date IS NOT NULL
    `,
    [orgId]
  );

  for (const system of systems) {
    const days = daysUntil(system.next_review_due_date);
    if (!alertDays.has(days)) continue;

    await createInAppNotification(client, {
      orgId,
      recipientUserId: system.system_owner_user_id,
      eventType: 'VALIDATION_REVIEW_DUE',
      title: `Validation review due in ${days} days`,
      message: `System "${system.system_name}" periodic validation review is due in ${days} days.`,
      payloadJson: { systemId: system.id, dueInDays: days }
    });

    totalAlerts += 1;
  }

  return { totalAlerts };
}

