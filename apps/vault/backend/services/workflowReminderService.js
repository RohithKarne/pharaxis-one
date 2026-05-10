const cron = require('node-cron')
const { pool } = require('../database/db')
const auditService = require('./auditService')
const { deliverWorkflowReminder } = require('./workflowNotificationDeliveryService')
const { runWithDbLock } = require('./distributedLock')

const DEDUPE_WINDOW_HOURS = 6

async function recentlyNotified(orgId, taskId, notificationType) {
  const [rows] = await pool.execute(
    `SELECT id
     FROM workflow_task_notifications
     WHERE org_id = ?
       AND workflow_task_id = ?
       AND notification_type = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL ${DEDUPE_WINDOW_HOURS} HOUR)
     LIMIT 1`,
    [orgId, taskId, notificationType]
  )
  return rows.length > 0
}

function buildMessage(task) {
  if (task.notification_type === 'overdue') {
    return `Task #${task.id} for ${task.doc_number} is overdue and requires immediate action.`
  }
  return `Task #${task.id} for ${task.doc_number} is due within 6 hours.`
}

async function runWorkflowReminderJob() {
  const [tasks] = await pool.execute(
    `SELECT
       wt.id,
       wt.org_id,
       wt.content_id,
       wt.assignee_user_id,
       wt.due_at,
       u.name AS assignee_name,
       u.email AS assignee_email,
       o.name AS org_name,
       vc.doc_number,
       vc.title,
       CASE
         WHEN wt.due_at < NOW() THEN 'overdue'
         ELSE 'due_soon'
       END AS notification_type
     FROM workflow_tasks wt
     JOIN workflow_instances wi
       ON wi.id = wt.workflow_instance_id
      AND wi.org_id = wt.org_id
     JOIN vault_content vc
       ON vc.id = wt.content_id
      AND vc.org_id = wt.org_id
     JOIN orgs o
       ON o.id = wt.org_id
     LEFT JOIN users u
       ON u.id = wt.assignee_user_id
      AND u.org_id = wt.org_id
     WHERE wt.status = 'pending'
       AND wt.activation_status = 'ready'
       AND wt.due_at IS NOT NULL
       AND wi.status = 'active'
       AND wt.due_at <= DATE_ADD(NOW(), INTERVAL 6 HOUR)`
  )

  let emittedCount = 0
  for (const task of tasks) {
    const skip = await recentlyNotified(task.org_id, task.id, task.notification_type)
    if (skip) continue

    const message = buildMessage(task)
    const [insert] = await pool.execute(
      `INSERT INTO workflow_task_notifications
         (org_id, workflow_task_id, content_id, assignee_user_id, notification_type, due_at, message,
          email_delivery_status, webhook_delivery_status, delivery_error, delivered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.org_id,
        task.id,
        task.content_id,
        task.assignee_user_id,
        task.notification_type,
        task.due_at,
        message,
        'skipped',
        'skipped',
        null,
        null
      ]
    )
    const deliveryResult = await deliverWorkflowReminder({
      notificationId: insert.insertId,
      orgId: task.org_id,
      taskId: task.id,
      contentId: task.content_id,
      assigneeUserId: task.assignee_user_id,
      assigneeName: task.assignee_name,
      assigneeEmail: task.assignee_email,
      orgName: task.org_name,
      docNumber: task.doc_number,
      title: task.title,
      notificationType: task.notification_type,
      dueAt: task.due_at,
      message
    })
    await pool.execute(
      `UPDATE workflow_task_notifications
       SET email_delivery_status = ?,
           webhook_delivery_status = ?,
           delivery_error = ?,
           delivered_at = ?
       WHERE id = ?`,
      [
        deliveryResult.emailStatus,
        deliveryResult.webhookStatus,
        deliveryResult.deliveryError,
        deliveryResult.deliveredAt,
        insert.insertId
      ]
    )

    await auditService.log(
      task.org_id,
      task.assignee_user_id,
      'org_user',
      'workflow_task_notification_emitted',
      'workflow_task_notification',
      insert.insertId,
      null,
      null,
      {
        workflow_task_id: task.id,
        notification_type: task.notification_type,
        due_at: task.due_at,
        email_delivery_status: deliveryResult.emailStatus,
        webhook_delivery_status: deliveryResult.webhookStatus
      },
      message
    )
    emittedCount += 1
  }

  return { emittedCount }
}

function registerWorkflowReminderCron() {
  const timezone = process.env.WORKFLOW_REMINDER_TZ || process.env.WORKFLOW_ESCALATION_TZ || 'UTC'

  return cron.schedule(
    '0 * * * *',
    async () => {
      try {
        const lockRun = await runWithDbLock('vault:cron:workflow-reminder', 1, runWorkflowReminderJob)
        if (lockRun.skipped) return
        const result = lockRun.result
        if (result.emittedCount > 0) {
          // eslint-disable-next-line no-console
          console.log(`Workflow reminder job complete: emitted ${result.emittedCount} notification(s)`)
        }
      } catch (error) {
        console.error('Workflow reminder job failed:', error)
      }
    },
    { timezone }
  )
}

module.exports = {
  registerWorkflowReminderCron,
  runWorkflowReminderJob
}
