const cron = require('node-cron')
const { pool } = require('../database/db')
const auditService = require('./auditService')

async function runWorkflowEscalationJob() {
  const [rows] = await pool.execute(
    `SELECT
       wt.id,
       wt.org_id,
       wt.content_id,
       wt.assignee_user_id,
       wt.workflow_instance_id,
       wt.due_at,
       vc.doc_number
     FROM workflow_tasks wt
     JOIN workflow_instances wi
       ON wi.id = wt.workflow_instance_id
      AND wi.org_id = wt.org_id
     JOIN vault_content vc
       ON vc.id = wt.content_id
      AND vc.org_id = wt.org_id
     WHERE wt.status = 'pending'
       AND wt.activation_status = 'ready'
       AND wt.due_at IS NOT NULL
       AND wt.due_at < NOW()
       AND wt.escalated_at IS NULL
       AND wi.status = 'active'`
  )

  if (!rows.length) {
    return { escalatedCount: 0 }
  }

  const [adminRows] = await pool.execute(
    `SELECT org_id, id AS admin_user_id
     FROM users
     WHERE role = 'admin'
       AND is_active = 1
     ORDER BY id ASC`
  )
  const adminByOrg = new Map()
  for (const row of adminRows) {
    if (!adminByOrg.has(row.org_id)) {
      adminByOrg.set(row.org_id, row.admin_user_id)
    }
  }

  const escalatedAt = new Date()
  for (const row of rows) {
    const escalationOwnerUserId = adminByOrg.get(row.org_id) || row.assignee_user_id
    const shouldReassignToEscalationOwner = Number(escalationOwnerUserId) !== Number(row.assignee_user_id)

    await pool.execute(
      `UPDATE workflow_tasks
       SET escalated_at = ?,
           escalation_level = 1,
           escalation_owner_user_id = ?,
           reassigned_from_user_id = CASE WHEN ? THEN assignee_user_id ELSE reassigned_from_user_id END,
           reassigned_at = CASE WHEN ? THEN ? ELSE reassigned_at END,
           assignee_user_id = CASE WHEN ? THEN ? ELSE assignee_user_id END
       WHERE id = ? AND org_id = ? AND escalated_at IS NULL`,
      [
        escalatedAt,
        escalationOwnerUserId,
        shouldReassignToEscalationOwner ? 1 : 0,
        shouldReassignToEscalationOwner ? 1 : 0,
        escalatedAt,
        shouldReassignToEscalationOwner ? 1 : 0,
        escalationOwnerUserId,
        row.id,
        row.org_id
      ]
    )

    await auditService.log(
      row.org_id,
      escalationOwnerUserId,
      'org_user',
      'workflow_task_escalated',
      'workflow_task',
      row.id,
      null,
      { escalated_at: null, escalation_level: 0 },
      {
        escalated_at: escalatedAt,
        escalation_level: 1,
        escalation_owner_user_id: escalationOwnerUserId,
        reassigned_from_user_id: shouldReassignToEscalationOwner ? row.assignee_user_id : null,
        doc_number: row.doc_number
      },
      shouldReassignToEscalationOwner
        ? 'Task due date breached, escalated and reassigned to admin owner'
        : 'Task due date breached and escalation marker set'
    )
  }

  return { escalatedCount: rows.length }
}

function registerWorkflowEscalationCron() {
  const timezone = process.env.WORKFLOW_ESCALATION_TZ || process.env.EXPIRY_ALERT_TZ || 'UTC'

  return cron.schedule(
    '*/30 * * * *',
    async () => {
      try {
        const result = await runWorkflowEscalationJob()
        if (result.escalatedCount > 0) {
          console.log(`Workflow escalation job complete: escalated ${result.escalatedCount} task(s)`) // eslint-disable-line no-console
        }
      } catch (error) {
        console.error('Workflow escalation job failed:', error)
      }
    },
    { timezone }
  )
}

module.exports = {
  registerWorkflowEscalationCron,
  runWorkflowEscalationJob
}
