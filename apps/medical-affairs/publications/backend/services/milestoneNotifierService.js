const { query, withTransaction } = require('../database/db')
const { sendUserNotification } = require('./notificationService')
const { NOTIFICATION_EVENTS } = require('../utils/constants')

let intervalRef = null

async function listMilestoneRecipients(milestone) {
  const recipientSet = new Set()
  if (milestone.ownerUserId) recipientSet.add(Number(milestone.ownerUserId))
  if (milestone.publicationOwnerId) recipientSet.add(Number(milestone.publicationOwnerId))
  if (milestone.publicationUpdaterId) recipientSet.add(Number(milestone.publicationUpdaterId))

  if (recipientSet.size === 0) {
    const managerRows = await query(
      `
        SELECT id
        FROM pub_users
        WHERE tenant_id = ?
          AND role = 'publications_manager'
          AND is_active = 1
        ORDER BY id ASC
        LIMIT 5
      `,
      [milestone.tenantId]
    )
    for (const row of managerRows) recipientSet.add(Number(row.id))
  }

  return Array.from(recipientSet).filter(Number.isFinite)
}

async function runDeadlineAlertScan() {
  const alertDays = [7, 3, 0]
  let sentAlerts = 0

  for (const daysLeft of alertDays) {
    const rows = await query(
      `
        SELECT
          m.id,
          m.tenant_id AS tenantId,
          m.publication_id AS publicationId,
          m.milestone_name AS milestoneName,
          m.due_date AS dueDate,
          m.owner_user_id AS ownerUserId,
          p.title AS publicationTitle,
          p.created_by AS publicationOwnerId,
          p.updated_by AS publicationUpdaterId
        FROM pub_milestones m
        JOIN pub_publications p ON p.id = m.publication_id
        WHERE m.status <> 'completed'
          AND m.due_date = DATE_ADD(CURRENT_DATE(), INTERVAL ? DAY)
          AND NOT EXISTS (
            SELECT 1
            FROM pub_milestone_deadline_alerts a
            WHERE a.milestone_id = m.id
              AND a.alert_days = ?
          )
        LIMIT 500
      `,
      [daysLeft, daysLeft]
    )

    for (const milestone of rows) {
      const recipients = await listMilestoneRecipients(milestone)
      for (const recipientUserId of recipients) {
        await sendUserNotification({
          tenantId: milestone.tenantId,
          recipientUserId,
          eventKey: NOTIFICATION_EVENTS.MILESTONE_OVERDUE,
          title: `Milestone deadline alert (${daysLeft}d): ${milestone.milestoneName}`,
          body: `Milestone "${milestone.milestoneName}" for "${milestone.publicationTitle}" is due on ${milestone.dueDate} (${daysLeft} day(s) left).`,
          context: {
            milestoneId: milestone.id,
            publicationId: milestone.publicationId,
            dueDate: milestone.dueDate,
            daysLeft
          }
        })
      }

      await withTransaction(async (tx) => {
        await tx.query(
          `
            INSERT INTO pub_milestone_deadline_alerts
            (milestone_id, alert_days)
            VALUES (?, ?)
          `,
          [milestone.id, daysLeft]
        )

        await tx.query(
          `
            INSERT INTO pub_audit_log
            (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
            VALUES (?, NULL, 'milestone.deadline_alert_sent', 'milestone', ?, ?)
          `,
          [milestone.tenantId, String(milestone.id), JSON.stringify({ daysLeft, publicationId: milestone.publicationId })]
        )
      })

      sentAlerts += 1
    }
  }

  return { sentAlerts }
}

async function runOverdueMilestoneScan() {
  const overdue = await query(
    `
      SELECT
        m.id,
        m.tenant_id AS tenantId,
        m.publication_id AS publicationId,
        m.milestone_name AS milestoneName,
        m.due_date AS dueDate,
        m.owner_user_id AS ownerUserId,
        p.title AS publicationTitle,
        p.created_by AS publicationOwnerId,
        p.updated_by AS publicationUpdaterId
      FROM pub_milestones m
      JOIN pub_publications p ON p.id = m.publication_id
      WHERE m.status <> 'completed'
        AND m.due_date < CURRENT_DATE()
        AND m.overdue_notified_at IS NULL
      ORDER BY m.due_date ASC
      LIMIT 500
    `
  )

  let notifiedCount = 0

  for (const milestone of overdue) {
    const recipients = await listMilestoneRecipients(milestone)
    for (const recipientUserId of recipients) {
      await sendUserNotification({
        tenantId: milestone.tenantId,
        recipientUserId,
        eventKey: NOTIFICATION_EVENTS.MILESTONE_OVERDUE,
        title: `Milestone overdue: ${milestone.milestoneName}`,
        body: `Milestone "${milestone.milestoneName}" for publication "${milestone.publicationTitle}" is overdue since ${milestone.dueDate}.`,
        context: {
          milestoneId: milestone.id,
          publicationId: milestone.publicationId,
          dueDate: milestone.dueDate
        }
      })
    }

    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE pub_milestones SET overdue_notified_at = CURRENT_TIMESTAMP(6) WHERE id = ?`,
        [milestone.id]
      )

      await tx.query(
        `
          INSERT INTO pub_audit_log
          (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
          VALUES (?, NULL, 'milestone.overdue_notified', 'milestone', ?, ?)
        `,
        [milestone.tenantId, String(milestone.id), JSON.stringify({ publicationId: milestone.publicationId })]
      )
    })

    notifiedCount += 1
  }

  return {
    scanned: overdue.length,
    notified: notifiedCount
  }
}

function startOverdueMilestoneNotifier() {
  const intervalMinutes = Number(process.env.MILESTONE_OVERDUE_SCAN_MINUTES || 1440)
  const intervalMs = Math.max(intervalMinutes, 1) * 60 * 1000

  if (intervalRef) {
    clearInterval(intervalRef)
    intervalRef = null
  }

  Promise.all([runDeadlineAlertScan(), runOverdueMilestoneScan()]).catch((error) => {
    console.error('[publications-milestone-notifier] initial scan failed', error)
  })

  intervalRef = setInterval(() => {
    Promise.all([runDeadlineAlertScan(), runOverdueMilestoneScan()]).catch((error) => {
      console.error('[publications-milestone-notifier] periodic scan failed', error)
    })
  }, intervalMs)

  return intervalMs
}

module.exports = {
  runDeadlineAlertScan,
  runOverdueMilestoneScan,
  startOverdueMilestoneNotifier
}
