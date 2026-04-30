const crypto = require('crypto')
const express = require('express')
const bcrypt = require('bcrypt')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')
const {
  getWorkflowRbacPolicy,
  setWorkflowRbacPolicy,
  isWorkflowActionAllowed,
  DEFAULT_ACTION_ROLE_MATRIX
} = require('../services/workflowRbacService')

const router = express.Router()

const ALLOWED_TASK_TYPES = ['review', 'approval', 'signature']
const ALLOWED_SIGNATURE_MEANINGS = ['reviewed', 'approved', 'rejected', 'acknowledged']
const ALLOWED_TASK_STATUSES = ['pending', 'completed', 'rejected', 'cancelled']
const ALLOWED_ROLES = ['admin', 'author', 'reviewer', 'approver', 'viewer']

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Allowed roles: ${allowedRoles.join(', ')}` })
    }
    next()
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' })
  }
  next()
}

function buildSnapshotHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function parseDueDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function buildDueDateFromHours(hours) {
  if (!Number.isInteger(hours) || hours <= 0) return null
  const due = new Date()
  due.setHours(due.getHours() + hours)
  return due
}

function clampAnalyticsWindowDays(rawValue) {
  const value = Number.parseInt(rawValue || '30', 10)
  if (!Number.isInteger(value)) return 30
  return Math.min(180, Math.max(7, value))
}

function toRoundedNumber(value, precision = 2) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Number(numeric.toFixed(precision))
}

function computeMedian(values) {
  if (!values.length) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function computePercentile(values, percentile) {
  if (!values.length) return null
  if (percentile <= 0) return values[0]
  if (percentile >= 100) return values[values.length - 1]
  const sorted = values.slice().sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))]
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const raw = String(value)
  if (!/[,"\n]/.test(raw)) return raw
  return `"${raw.replace(/"/g, '""')}"`
}

function toCsv(headers, rows) {
  const output = [headers.join(',')]
  for (const row of rows) {
    output.push(row.map(entry => csvEscape(entry)).join(','))
  }
  return `${output.join('\n')}\n`
}

async function ensureWorkflowRolePermission(req, res, action) {
  const access = await isWorkflowActionAllowed(req.user.orgId, req.user.role, action)
  if (access.allowed) return true

  res.status(403).json({
    error: `Role "${req.user.role}" is not permitted for action "${action}"`,
    action,
    allowed_roles: access.allowed_roles,
    policy_version: access.policy_version
  })
  return false
}

async function buildWorkflowAdminAnalytics(orgId, windowDays) {
  const safeWindowDays = clampAnalyticsWindowDays(windowDays)
  const windowIntervalSql = `INTERVAL ${safeWindowDays} DAY`

  const [[taskKpis]] = await pool.execute(
    `SELECT
       COUNT(*) AS created_total,
       SUM(CASE WHEN wt.status = 'completed' THEN 1 ELSE 0 END) AS completed_total,
       SUM(CASE WHEN wt.status = 'pending' THEN 1 ELSE 0 END) AS open_total,
       SUM(CASE WHEN wt.status = 'pending' AND wt.due_at IS NOT NULL AND wt.due_at < NOW() THEN 1 ELSE 0 END) AS overdue_open_total,
       SUM(CASE
         WHEN wt.status = 'completed'
          AND wt.due_at IS NOT NULL
          AND wt.completed_at IS NOT NULL
          AND wt.completed_at > wt.due_at
         THEN 1 ELSE 0 END) AS completed_sla_breach_total
     FROM workflow_tasks wt
     WHERE wt.org_id = ?
       AND wt.created_at >= DATE_SUB(NOW(), ${windowIntervalSql})`,
    [orgId]
  )

  const [durationRows] = await pool.execute(
    `SELECT TIMESTAMPDIFF(HOUR, wt.created_at, wt.completed_at) AS completion_hours
     FROM workflow_tasks wt
     WHERE wt.org_id = ?
       AND wt.status = 'completed'
       AND wt.completed_at IS NOT NULL
       AND wt.completed_at >= DATE_SUB(NOW(), ${windowIntervalSql})`,
    [orgId]
  )

  const completionHours = durationRows
    .map(row => Number(row.completion_hours))
    .filter(value => Number.isFinite(value) && value >= 0)

  const [bottleneckRows] = await pool.execute(
    `SELECT
       wt.step_order,
       wt.task_type,
       COUNT(*) AS total_tasks,
       SUM(CASE WHEN wt.status = 'pending' THEN 1 ELSE 0 END) AS pending_total,
       SUM(CASE WHEN wt.status = 'pending' AND wt.due_at IS NOT NULL AND wt.due_at < NOW() THEN 1 ELSE 0 END) AS overdue_open_total,
       AVG(CASE WHEN wt.status = 'completed' AND wt.completed_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, wt.created_at, wt.completed_at) END) AS avg_completion_hours,
       AVG(CASE WHEN wt.status = 'pending' AND wt.due_at IS NOT NULL AND wt.due_at < NOW() THEN TIMESTAMPDIFF(HOUR, wt.due_at, NOW()) END) AS avg_overdue_hours
     FROM workflow_tasks wt
     WHERE wt.org_id = ?
       AND wt.created_at >= DATE_SUB(NOW(), ${windowIntervalSql})
     GROUP BY wt.step_order, wt.task_type
     ORDER BY overdue_open_total DESC, pending_total DESC, avg_completion_hours DESC
     LIMIT 8`,
    [orgId]
  )

  const [assigneeLoadRows] = await pool.execute(
    `SELECT
       u.id AS user_id,
       u.name,
       u.role,
       SUM(CASE WHEN wt.status = 'pending' THEN 1 ELSE 0 END) AS pending_total,
       SUM(CASE WHEN wt.status = 'pending' AND wt.due_at IS NOT NULL AND wt.due_at < NOW() THEN 1 ELSE 0 END) AS overdue_open_total,
       AVG(CASE
         WHEN wt.status = 'completed'
          AND wt.completed_at IS NOT NULL
          AND wt.completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         THEN TIMESTAMPDIFF(HOUR, wt.created_at, wt.completed_at)
         ELSE NULL
       END) AS avg_completion_hours_30d
     FROM users u
     LEFT JOIN workflow_tasks wt
       ON wt.assignee_user_id = u.id
      AND wt.org_id = u.org_id
     WHERE u.org_id = ?
       AND u.is_active = 1
     GROUP BY u.id, u.name, u.role
     HAVING pending_total > 0 OR overdue_open_total > 0 OR avg_completion_hours_30d IS NOT NULL
     ORDER BY overdue_open_total DESC, pending_total DESC, u.name ASC
     LIMIT 15`,
    [orgId]
  )

  const [createdTrendRows] = await pool.execute(
    `SELECT DATE_FORMAT(wt.created_at, '%Y-%m-%d') AS day_key, COUNT(*) AS created_total
     FROM workflow_tasks wt
     WHERE wt.org_id = ?
       AND wt.created_at >= DATE_SUB(NOW(), ${windowIntervalSql})
     GROUP BY day_key
     ORDER BY day_key ASC`,
    [orgId]
  )

  const [completedTrendRows] = await pool.execute(
    `SELECT DATE_FORMAT(wt.completed_at, '%Y-%m-%d') AS day_key, COUNT(*) AS completed_total
     FROM workflow_tasks wt
     WHERE wt.org_id = ?
       AND wt.status = 'completed'
       AND wt.completed_at IS NOT NULL
       AND wt.completed_at >= DATE_SUB(NOW(), ${windowIntervalSql})
     GROUP BY day_key
     ORDER BY day_key ASC`,
    [orgId]
  )

  const [deliveryRows] = await pool.execute(
    `SELECT
       COUNT(*) AS notification_total,
       SUM(CASE WHEN n.email_delivery_status = 'sent' THEN 1 ELSE 0 END) AS email_sent_total,
       SUM(CASE WHEN n.webhook_delivery_status = 'sent' THEN 1 ELSE 0 END) AS webhook_sent_total,
       SUM(CASE WHEN n.email_delivery_status = 'failed' OR n.webhook_delivery_status = 'failed' THEN 1 ELSE 0 END) AS delivery_failed_total
     FROM workflow_task_notifications n
     WHERE n.org_id = ?
       AND n.created_at >= DATE_SUB(NOW(), ${windowIntervalSql})`,
    [orgId]
  )

  const trendMap = new Map()
  for (const row of createdTrendRows) {
    trendMap.set(row.day_key, {
      day: row.day_key,
      created_total: Number(row.created_total || 0),
      completed_total: 0
    })
  }
  for (const row of completedTrendRows) {
    if (!trendMap.has(row.day_key)) {
      trendMap.set(row.day_key, {
        day: row.day_key,
        created_total: 0,
        completed_total: Number(row.completed_total || 0)
      })
      continue
    }
    trendMap.get(row.day_key).completed_total = Number(row.completed_total || 0)
  }

  const createdTotal = Number(taskKpis.created_total || 0)
  const completedTotal = Number(taskKpis.completed_total || 0)
  const completionRate = createdTotal > 0 ? (completedTotal / createdTotal) * 100 : 0
  const openTotal = Number(taskKpis.open_total || 0)
  const overdueOpenTotal = Number(taskKpis.overdue_open_total || 0)
  const completedSlaBreachTotal = Number(taskKpis.completed_sla_breach_total || 0)
  const slaBreachRate = completedTotal > 0 ? (completedSlaBreachTotal / completedTotal) * 100 : 0
  const notificationTotal = Number(deliveryRows[0]?.notification_total || 0)
  const emailSentTotal = Number(deliveryRows[0]?.email_sent_total || 0)
  const webhookSentTotal = Number(deliveryRows[0]?.webhook_sent_total || 0)
  const deliveryFailedTotal = Number(deliveryRows[0]?.delivery_failed_total || 0)

  return {
    window_days: safeWindowDays,
    generated_at: new Date().toISOString(),
    kpis: {
      created_total: createdTotal,
      completed_total: completedTotal,
      open_total: openTotal,
      overdue_open_total: overdueOpenTotal,
      completed_sla_breach_total: completedSlaBreachTotal,
      completion_rate_pct: toRoundedNumber(completionRate, 2),
      completed_sla_breach_rate_pct: toRoundedNumber(slaBreachRate, 2),
      median_completion_hours: toRoundedNumber(computeMedian(completionHours), 2),
      p95_completion_hours: toRoundedNumber(computePercentile(completionHours, 95), 2)
    },
    delivery: {
      notification_total: notificationTotal,
      email_sent_total: emailSentTotal,
      webhook_sent_total: webhookSentTotal,
      delivery_failed_total: deliveryFailedTotal
    },
    bottlenecks: bottleneckRows.map(row => ({
      step_order: Number(row.step_order || 0),
      task_type: row.task_type || '-',
      total_tasks: Number(row.total_tasks || 0),
      pending_total: Number(row.pending_total || 0),
      overdue_open_total: Number(row.overdue_open_total || 0),
      avg_completion_hours: toRoundedNumber(row.avg_completion_hours, 2),
      avg_overdue_hours: toRoundedNumber(row.avg_overdue_hours, 2)
    })),
    assignee_load: assigneeLoadRows.map(row => ({
      user_id: Number(row.user_id || 0),
      name: row.name || '-',
      role: row.role || '-',
      pending_total: Number(row.pending_total || 0),
      overdue_open_total: Number(row.overdue_open_total || 0),
      avg_completion_hours_30d: toRoundedNumber(row.avg_completion_hours_30d, 2)
    })),
    trend: Array.from(trendMap.values()).sort((a, b) => a.day.localeCompare(b.day))
  }
}

function normalizeTemplateSteps(rawSteps = []) {
  if (!Array.isArray(rawSteps) || !rawSteps.length) {
    return { ok: false, error: 'At least one step is required' }
  }

  const normalizedSteps = []
  for (const [index, step] of rawSteps.entries()) {
    const stepOrder = Number.isInteger(step.step_order) && step.step_order > 0
      ? step.step_order
      : index + 1
    const taskType = String(step.task_type || '').trim()
    const assigneeRole = String(step.assignee_role || '').trim()
    const dueInHours = step.due_in_hours === undefined || step.due_in_hours === null || step.due_in_hours === ''
      ? null
      : Number(step.due_in_hours)

    if (!ALLOWED_TASK_TYPES.includes(taskType)) {
      return { ok: false, error: `Invalid task_type at step ${index + 1}` }
    }
    if (!ALLOWED_ROLES.includes(assigneeRole)) {
      return { ok: false, error: `Invalid assignee_role at step ${index + 1}` }
    }
    if (dueInHours !== null && (!Number.isInteger(dueInHours) || dueInHours <= 0)) {
      return { ok: false, error: `due_in_hours must be a positive integer at step ${index + 1}` }
    }

    normalizedSteps.push({
      step_order: stepOrder,
      task_type: taskType,
      assignee_role: assigneeRole,
      due_in_hours: dueInHours,
      require_signature: step.require_signature === undefined ? 1 : (step.require_signature ? 1 : 0)
    })
  }

  const duplicateStepOrders = new Set()
  for (const step of normalizedSteps) {
    if (duplicateStepOrders.has(step.step_order)) {
      return { ok: false, error: 'step_order values must be unique within a template' }
    }
    duplicateStepOrders.add(step.step_order)
  }

  return {
    ok: true,
    steps: normalizedSteps.sort((a, b) => a.step_order - b.step_order)
  }
}

async function getContentForWorkflow(connection, orgId, contentId) {
  const [[content]] = await connection.execute(
    `SELECT id, org_id, title, doc_number, lifecycle_state, current_version_id
     FROM vault_content
     WHERE id = ? AND org_id = ? FOR UPDATE`,
    [contentId, orgId]
  )
  return content
}

async function getActiveUserInOrgById(connection, orgId, userId) {
  const [[user]] = await connection.execute(
    `SELECT id, org_id, name, email, role, is_active
     FROM users
     WHERE id = ? AND org_id = ?`,
    [userId, orgId]
  )
  if (!user || Number(user.is_active) !== 1) return null
  return user
}

async function getActiveUserInOrgByRole(connection, orgId, role) {
  const [[user]] = await connection.execute(
    `SELECT id, org_id, name, email, role, is_active
     FROM users
     WHERE org_id = ?
       AND role = ?
       AND is_active = 1
     ORDER BY id ASC
     LIMIT 1`,
    [orgId, role]
  )
  return user || null
}

async function activateNextWaitingTask(connection, orgId, workflowInstanceId) {
  const [[nextTask]] = await connection.execute(
    `SELECT id
     FROM workflow_tasks
     WHERE org_id = ?
       AND workflow_instance_id = ?
       AND status = 'pending'
       AND activation_status = 'waiting'
     ORDER BY step_order ASC, id ASC
     LIMIT 1`,
    [orgId, workflowInstanceId]
  )

  if (!nextTask) return null

  await connection.execute(
    `UPDATE workflow_tasks
     SET activation_status = 'ready'
     WHERE id = ? AND org_id = ?`,
    [nextTask.id, orgId]
  )

  return nextTask.id
}

async function closeWorkflowIfNoPending(connection, orgId, workflowInstanceId) {
  const [[pendingCountRow]] = await connection.execute(
    `SELECT COUNT(*) AS pending_count
     FROM workflow_tasks
     WHERE workflow_instance_id = ?
       AND org_id = ?
       AND status = 'pending'`,
    [workflowInstanceId, orgId]
  )

  if (Number(pendingCountRow.pending_count) > 0) return false

  await connection.execute(
    `UPDATE workflow_instances
     SET status = 'completed', completed_at = NOW()
     WHERE id = ? AND org_id = ?`,
    [workflowInstanceId, orgId]
  )

  return true
}

router.get('/templates', authenticate, async (req, res) => {
  try {
    const [templates] = await pool.execute(
      `SELECT id, org_id, name, description, is_active, created_by, created_at
       FROM workflow_templates
       WHERE org_id = ?
       ORDER BY created_at DESC`,
      [req.user.orgId]
    )

    if (!templates.length) {
      return res.json([])
    }

    const templateIds = templates.map(template => template.id)
    const [steps] = await pool.query(
      `SELECT id, template_id, org_id, step_order, task_type, assignee_role, due_in_hours, require_signature, created_at
       FROM workflow_template_steps
       WHERE org_id = ?
         AND template_id IN (?)
       ORDER BY template_id ASC, step_order ASC`,
      [req.user.orgId, templateIds]
    )

    const stepsByTemplate = new Map()
    for (const step of steps) {
      if (!stepsByTemplate.has(step.template_id)) stepsByTemplate.set(step.template_id, [])
      stepsByTemplate.get(step.template_id).push(step)
    }

    const payload = templates.map(template => ({
      ...template,
      steps: stepsByTemplate.get(template.id) || []
    }))

    res.json(payload)
  } catch (error) {
    console.error('List workflow templates error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/templates', authenticate, requireAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim()
  const description = req.body.description ? String(req.body.description) : null
  const normalizeResult = normalizeTemplateSteps(Array.isArray(req.body.steps) ? req.body.steps : [])

  if (!name) return res.status(400).json({ error: 'Template name is required' })
  if (!normalizeResult.ok) return res.status(400).json({ error: normalizeResult.error })
  const normalizedSteps = normalizeResult.steps

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [templateResult] = await connection.execute(
      `INSERT INTO workflow_templates (org_id, name, description, is_active, created_by)
       VALUES (?, ?, ?, 1, ?)`,
      [req.user.orgId, name, description, req.user.userId]
    )

    for (const step of normalizedSteps) {
      await connection.execute(
        `INSERT INTO workflow_template_steps
           (template_id, org_id, step_order, task_type, assignee_role, due_in_hours, require_signature)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          templateResult.insertId,
          req.user.orgId,
          step.step_order,
          step.task_type,
          step.assignee_role,
          step.due_in_hours,
          step.require_signature
        ]
      )
    }

    await connection.commit()

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'workflow_template_created',
      'workflow_template',
      templateResult.insertId,
      req.ip,
      null,
      {
        name,
        description,
        step_count: normalizedSteps.length
      },
      'Workflow template created'
    )

    res.status(201).json({
      id: templateResult.insertId,
      name,
      description,
      step_count: normalizedSteps.length
    })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Template name already exists in this organization' })
    }
    console.error('Create workflow template error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    if (connection) connection.release()
  }
})

router.put('/templates/:id', authenticate, requireAdmin, async (req, res) => {
  const templateId = Number(req.params.id)
  const name = String(req.body.name || '').trim()
  const description = req.body.description ? String(req.body.description) : null
  const normalizeResult = normalizeTemplateSteps(Array.isArray(req.body.steps) ? req.body.steps : [])

  if (!Number.isInteger(templateId) || templateId <= 0) {
    return res.status(400).json({ error: 'Invalid template id' })
  }
  if (!name) return res.status(400).json({ error: 'Template name is required' })
  if (!normalizeResult.ok) return res.status(400).json({ error: normalizeResult.error })
  const normalizedSteps = normalizeResult.steps

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [[existingTemplate]] = await connection.execute(
      `SELECT id, org_id, name, description, is_active
       FROM workflow_templates
       WHERE id = ? AND org_id = ? FOR UPDATE`,
      [templateId, req.user.orgId]
    )
    if (!existingTemplate) {
      await connection.rollback()
      return res.status(404).json({ error: 'Template not found' })
    }

    await connection.execute(
      `UPDATE workflow_templates
       SET name = ?, description = ?
       WHERE id = ? AND org_id = ?`,
      [name, description, templateId, req.user.orgId]
    )

    await connection.execute(
      `DELETE FROM workflow_template_steps
       WHERE template_id = ? AND org_id = ?`,
      [templateId, req.user.orgId]
    )

    for (const step of normalizedSteps) {
      await connection.execute(
        `INSERT INTO workflow_template_steps
           (template_id, org_id, step_order, task_type, assignee_role, due_in_hours, require_signature)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          templateId,
          req.user.orgId,
          step.step_order,
          step.task_type,
          step.assignee_role,
          step.due_in_hours,
          step.require_signature
        ]
      )
    }

    await connection.commit()

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'workflow_template_updated',
      'workflow_template',
      templateId,
      req.ip,
      {
        name: existingTemplate.name,
        description: existingTemplate.description
      },
      {
        name,
        description,
        step_count: normalizedSteps.length
      },
      'Workflow template updated'
    )

    res.json({
      message: 'Workflow template updated',
      id: templateId,
      step_count: normalizedSteps.length
    })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Template name already exists in this organization' })
    }
    console.error('Update workflow template error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    if (connection) connection.release()
  }
})

router.patch('/templates/:id/status', authenticate, requireAdmin, async (req, res) => {
  const templateId = Number(req.params.id)
  const isActive = req.body.is_active

  if (!Number.isInteger(templateId) || templateId <= 0) {
    return res.status(400).json({ error: 'Invalid template id' })
  }
  if (isActive === undefined) {
    return res.status(400).json({ error: 'is_active is required' })
  }
  const normalizedStatus = isActive ? 1 : 0

  try {
    const [[before]] = await pool.execute(
      `SELECT id, org_id, is_active
       FROM workflow_templates
       WHERE id = ? AND org_id = ?`,
      [templateId, req.user.orgId]
    )
    if (!before) return res.status(404).json({ error: 'Template not found' })

    await pool.execute(
      `UPDATE workflow_templates
       SET is_active = ?
       WHERE id = ? AND org_id = ?`,
      [normalizedStatus, templateId, req.user.orgId]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'workflow_template_status_updated',
      'workflow_template',
      templateId,
      req.ip,
      { is_active: before.is_active },
      { is_active: normalizedStatus },
      'Workflow template status updated'
    )

    res.json({
      message: 'Workflow template status updated',
      id: templateId,
      is_active: normalizedStatus
    })
  } catch (error) {
    console.error('Update workflow template status error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/templates/:id/start', authenticate, requireRole(['admin', 'author', 'reviewer', 'approver']), async (req, res) => {
  if (!(await ensureWorkflowRolePermission(req, res, 'task_start_from_template'))) return

  const templateId = Number(req.params.id)
  const contentId = Number(req.body.content_id)
  const assigneeOverrides = req.body.assignee_overrides && typeof req.body.assignee_overrides === 'object'
    ? req.body.assignee_overrides
    : {}

  if (!Number.isInteger(templateId) || templateId <= 0) {
    return res.status(400).json({ error: 'Invalid template id' })
  }
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Valid content_id is required' })
  }

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [[template]] = await connection.execute(
      `SELECT id, org_id, name, is_active
       FROM workflow_templates
       WHERE id = ? AND org_id = ? FOR UPDATE`,
      [templateId, req.user.orgId]
    )
    if (!template || Number(template.is_active) !== 1) {
      await connection.rollback()
      return res.status(404).json({ error: 'Active workflow template not found' })
    }

    const [steps] = await connection.execute(
      `SELECT id, template_id, step_order, task_type, assignee_role, due_in_hours, require_signature
       FROM workflow_template_steps
       WHERE template_id = ? AND org_id = ?
       ORDER BY step_order ASC, id ASC`,
      [templateId, req.user.orgId]
    )
    if (!steps.length) {
      await connection.rollback()
      return res.status(409).json({ error: 'Template has no steps configured' })
    }

    const content = await getContentForWorkflow(connection, req.user.orgId, contentId)
    if (!content) {
      await connection.rollback()
      return res.status(404).json({ error: 'Content not found' })
    }

    const [instanceResult] = await connection.execute(
      `INSERT INTO workflow_instances (org_id, content_id, status, started_by)
       VALUES (?, ?, 'active', ?)`,
      [req.user.orgId, contentId, req.user.userId]
    )

    const createdTaskIds = []
    for (const [index, step] of steps.entries()) {
      const roleKey = String(step.assignee_role)
      const overrideUserId = assigneeOverrides[roleKey] === undefined ? null : Number(assigneeOverrides[roleKey])

      let assignee = null
      if (overrideUserId && Number.isInteger(overrideUserId) && overrideUserId > 0) {
        assignee = await getActiveUserInOrgById(connection, req.user.orgId, overrideUserId)
        if (!assignee || assignee.role !== roleKey) {
          await connection.rollback()
          return res.status(400).json({ error: `Invalid assignee override for role ${roleKey}` })
        }
      }

      if (!assignee) {
        assignee = await getActiveUserInOrgByRole(connection, req.user.orgId, roleKey)
      }
      if (!assignee) {
        await connection.rollback()
        return res.status(409).json({ error: `No active user found for role ${roleKey}` })
      }

      const dueAt = buildDueDateFromHours(Number(step.due_in_hours))
      const activationStatus = index === 0 ? 'ready' : 'waiting'

      const [taskResult] = await connection.execute(
        `INSERT INTO workflow_tasks
           (workflow_instance_id, step_order, org_id, content_id, assignee_user_id, assigned_by, task_type, status, activation_status, due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          instanceResult.insertId,
          Number(step.step_order),
          req.user.orgId,
          contentId,
          assignee.id,
          req.user.userId,
          String(step.task_type),
          activationStatus,
          dueAt
        ]
      )

      createdTaskIds.push(taskResult.insertId)
    }

    if (content.lifecycle_state === 'draft') {
      await connection.execute(
        `UPDATE vault_content
         SET lifecycle_state = 'in_review', updated_at = NOW()
         WHERE id = ? AND org_id = ?`,
        [contentId, req.user.orgId]
      )
    }

    await connection.commit()

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'workflow_started_from_template',
      'workflow_instance',
      instanceResult.insertId,
      req.ip,
      null,
      {
        template_id: template.id,
        template_name: template.name,
        content_id: contentId,
        content_doc_number: content.doc_number,
        task_ids: createdTaskIds
      },
      'Template-based workflow instance created'
    )

    res.status(201).json({
      workflow_instance_id: instanceResult.insertId,
      template_id: template.id,
      task_ids: createdTaskIds,
      status: 'active'
    })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Start workflow from template error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    if (connection) connection.release()
  }
})

router.post('/start', authenticate, requireRole(['admin', 'author', 'reviewer', 'approver']), async (req, res) => {
  if (!(await ensureWorkflowRolePermission(req, res, 'task_start'))) return

  const contentId = Number(req.body.content_id)
  const assigneeUserId = Number(req.body.assignee_user_id)
  const taskType = String(req.body.task_type || 'approval').trim()
  const dueAt = parseDueDate(req.body.due_at)

  if (!Number.isInteger(contentId) || contentId <= 0 || !Number.isInteger(assigneeUserId) || assigneeUserId <= 0) {
    return res.status(400).json({ error: 'Valid content_id and assignee_user_id are required' })
  }
  if (!ALLOWED_TASK_TYPES.includes(taskType)) {
    return res.status(400).json({ error: 'task_type must be review/approval/signature' })
  }

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const content = await getContentForWorkflow(connection, req.user.orgId, contentId)
    if (!content) {
      await connection.rollback()
      return res.status(404).json({ error: 'Content not found' })
    }

    const assignee = await getActiveUserInOrgById(connection, req.user.orgId, assigneeUserId)
    if (!assignee) {
      await connection.rollback()
      return res.status(404).json({ error: 'Assignee not found or inactive in this organization' })
    }

    const [instanceResult] = await connection.execute(
      `INSERT INTO workflow_instances (org_id, content_id, status, started_by)
       VALUES (?, ?, 'active', ?)`,
      [req.user.orgId, contentId, req.user.userId]
    )

    const [taskResult] = await connection.execute(
      `INSERT INTO workflow_tasks
         (workflow_instance_id, step_order, org_id, content_id, assignee_user_id, assigned_by, task_type, status, activation_status, due_at)
       VALUES (?, 1, ?, ?, ?, ?, ?, 'pending', 'ready', ?)`,
      [instanceResult.insertId, req.user.orgId, contentId, assigneeUserId, req.user.userId, taskType, dueAt]
    )

    if (content.lifecycle_state === 'draft') {
      await connection.execute(
        `UPDATE vault_content
         SET lifecycle_state = 'in_review', updated_at = NOW()
         WHERE id = ? AND org_id = ?`,
        [contentId, req.user.orgId]
      )
    }

    await connection.commit()

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'workflow_started',
      'workflow_instance',
      instanceResult.insertId,
      req.ip,
      null,
      {
        content_id: contentId,
        content_doc_number: content.doc_number,
        task_id: taskResult.insertId,
        task_type: taskType,
        assignee_user_id: assigneeUserId
      },
      'Workflow instance created'
    )

    res.status(201).json({
      workflow_instance_id: instanceResult.insertId,
      task_id: taskResult.insertId,
      status: 'active'
    })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Start workflow error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    if (connection) connection.release()
  }
})

router.get('/tasks/my', authenticate, async (req, res) => {
  const status = req.query.status ? String(req.query.status) : ''
  const params = [req.user.orgId, req.user.userId]
  const where = ['wt.org_id = ?', 'wt.assignee_user_id = ?']

  if (status) {
    if (!ALLOWED_TASK_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status filter' })
    }
    where.push('wt.status = ?')
    params.push(status)
    if (status === 'pending') {
      where.push("wt.activation_status = 'ready'")
    }
  } else {
    where.push("(wt.status <> 'pending' OR wt.activation_status = 'ready')")
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         wt.id,
         wt.workflow_instance_id,
         wt.step_order,
         wt.content_id,
         wt.assignee_user_id,
         wt.task_type,
         wt.status,
         wt.activation_status,
         wt.escalated_at,
         wt.escalation_level,
         wt.escalation_owner_user_id,
         wt.reassigned_from_user_id,
         wt.delegated_from_user_id,
         wt.reassigned_at,
         wt.delegated_at,
         wt.due_at,
         wt.completed_at,
         wt.comments,
         wt.signature_id,
         wt.created_at,
         vc.doc_number,
         vc.title,
         vc.lifecycle_state,
         assigner.name AS assigned_by_name,
         escalation_owner.name AS escalation_owner_name,
         reassigned_from.name AS reassigned_from_name,
         delegated_from.name AS delegated_from_name
       FROM workflow_tasks wt
       JOIN vault_content vc
         ON vc.id = wt.content_id
        AND vc.org_id = wt.org_id
       LEFT JOIN users assigner
         ON assigner.id = wt.assigned_by
        AND assigner.org_id = wt.org_id
       LEFT JOIN users escalation_owner
         ON escalation_owner.id = wt.escalation_owner_user_id
        AND escalation_owner.org_id = wt.org_id
       LEFT JOIN users reassigned_from
         ON reassigned_from.id = wt.reassigned_from_user_id
        AND reassigned_from.org_id = wt.org_id
       LEFT JOIN users delegated_from
         ON delegated_from.id = wt.delegated_from_user_id
        AND delegated_from.org_id = wt.org_id
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE WHEN wt.status = 'pending' THEN 0 ELSE 1 END,
         wt.step_order ASC,
         wt.due_at IS NULL,
         wt.due_at ASC,
         wt.created_at DESC`,
      params
    )

    res.json(rows)
  } catch (error) {
    console.error('List my workflow tasks error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/admin/queue', authenticate, requireAdmin, async (req, res) => {
  const status = req.query.status ? String(req.query.status) : ''
  const params = [req.user.orgId]
  const where = ['wt.org_id = ?']

  if (status) {
    if (!ALLOWED_TASK_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status filter' })
    }
    where.push('wt.status = ?')
    params.push(status)
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         wt.id,
         wt.workflow_instance_id,
         wt.step_order,
         wt.assignee_user_id,
         wt.task_type,
         wt.status,
         wt.activation_status,
         wt.escalated_at,
         wt.escalation_level,
         wt.escalation_owner_user_id,
         wt.reassigned_from_user_id,
         wt.delegated_from_user_id,
         wt.reassigned_at,
         wt.delegated_at,
         wt.due_at,
         wt.completed_at,
         wt.created_at,
         vc.id AS content_id,
         vc.doc_number,
         vc.title,
         vc.lifecycle_state,
         assignee.name AS assignee_name,
         assignee.role AS assignee_role,
         starter.name AS assigned_by_name,
         escalation_owner.name AS escalation_owner_name,
         reassigned_from.name AS reassigned_from_name,
         delegated_from.name AS delegated_from_name
       FROM workflow_tasks wt
       JOIN vault_content vc
         ON vc.id = wt.content_id
        AND vc.org_id = wt.org_id
       LEFT JOIN users assignee
         ON assignee.id = wt.assignee_user_id
        AND assignee.org_id = wt.org_id
       LEFT JOIN users starter
         ON starter.id = wt.assigned_by
        AND starter.org_id = wt.org_id
       LEFT JOIN users escalation_owner
         ON escalation_owner.id = wt.escalation_owner_user_id
        AND escalation_owner.org_id = wt.org_id
       LEFT JOIN users reassigned_from
         ON reassigned_from.id = wt.reassigned_from_user_id
        AND reassigned_from.org_id = wt.org_id
       LEFT JOIN users delegated_from
         ON delegated_from.id = wt.delegated_from_user_id
        AND delegated_from.org_id = wt.org_id
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE WHEN wt.status = 'pending' THEN 0 ELSE 1 END,
         wt.escalated_at IS NULL,
         wt.due_at IS NULL,
         wt.due_at ASC,
         wt.created_at DESC`,
      params
    )

    const [[summary]] = await pool.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN wt.status = 'pending' AND wt.activation_status = 'ready' THEN 1 ELSE 0 END) AS pending_ready,
         SUM(CASE WHEN wt.status = 'pending' AND wt.activation_status = 'waiting' THEN 1 ELSE 0 END) AS pending_waiting,
         SUM(CASE WHEN wt.status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN wt.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
         SUM(CASE WHEN wt.escalated_at IS NOT NULL THEN 1 ELSE 0 END) AS escalated
       FROM workflow_tasks wt
       WHERE wt.org_id = ?`,
      [req.user.orgId]
    )

    res.json({
      summary: {
        total: Number(summary.total || 0),
        pending_ready: Number(summary.pending_ready || 0),
        pending_waiting: Number(summary.pending_waiting || 0),
        completed: Number(summary.completed || 0),
        rejected: Number(summary.rejected || 0),
        escalated: Number(summary.escalated || 0)
      },
      results: rows
    })
  } catch (error) {
    console.error('Admin workflow queue error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/tasks/:id/reassign', authenticate, async (req, res) => {
  if (!(await ensureWorkflowRolePermission(req, res, 'task_reassign'))) return

  const taskId = Number(req.params.id)
  const newAssigneeUserId = Number(req.body.assignee_user_id)
  const reason = req.body.reason ? String(req.body.reason) : null

  if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: 'Invalid task id' })
  if (!Number.isInteger(newAssigneeUserId) || newAssigneeUserId <= 0) {
    return res.status(400).json({ error: 'Valid assignee_user_id is required' })
  }

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [[task]] = await connection.execute(
      `SELECT id, org_id, workflow_instance_id, content_id, assignee_user_id, assigned_by, status
       FROM workflow_tasks
       WHERE id = ? AND org_id = ? FOR UPDATE`,
      [taskId, req.user.orgId]
    )
    if (!task) {
      await connection.rollback()
      return res.status(404).json({ error: 'Workflow task not found' })
    }
    if (task.status !== 'pending') {
      await connection.rollback()
      return res.status(409).json({ error: `Only pending tasks can be reassigned (current=${task.status})` })
    }

    const isAdmin = req.user.role === 'admin'
    const isCurrentAssignee = Number(task.assignee_user_id) === Number(req.user.userId)
    if (!isAdmin && !isCurrentAssignee) {
      await connection.rollback()
      return res.status(403).json({ error: 'Only admin or current assignee can reassign this task' })
    }

    const nextAssignee = await getActiveUserInOrgById(connection, req.user.orgId, newAssigneeUserId)
    if (!nextAssignee) {
      await connection.rollback()
      return res.status(404).json({ error: 'New assignee not found or inactive in this organization' })
    }

    if (Number(nextAssignee.id) === Number(task.assignee_user_id)) {
      await connection.rollback()
      return res.status(409).json({ error: 'Task is already assigned to this user' })
    }

    const reassignedAt = new Date()
    await connection.execute(
      `UPDATE workflow_tasks
       SET assignee_user_id = ?,
           reassigned_from_user_id = ?,
           reassigned_at = ?,
           delegated_from_user_id = NULL,
           delegated_at = NULL,
           assigned_by = ?,
           escalation_owner_user_id = CASE
             WHEN escalation_owner_user_id IS NOT NULL THEN ?
             ELSE escalation_owner_user_id
           END
       WHERE id = ? AND org_id = ?`,
      [
        nextAssignee.id,
        task.assignee_user_id,
        reassignedAt,
        req.user.userId,
        nextAssignee.id,
        task.id,
        req.user.orgId
      ]
    )

    if (reason) {
      await connection.execute(
        `INSERT INTO workflow_task_comments
           (org_id, workflow_task_id, content_id, user_id, comment_text)
         VALUES (?, ?, ?, ?, ?)`,
        [req.user.orgId, task.id, task.content_id, req.user.userId, reason]
      )
    }

    await connection.commit()

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'workflow_task_reassigned',
      'workflow_task',
      task.id,
      req.ip,
      { assignee_user_id: task.assignee_user_id },
      {
        assignee_user_id: nextAssignee.id,
        reassigned_from_user_id: task.assignee_user_id,
        reassigned_at: reassignedAt
      },
      reason || 'Workflow task reassigned'
    )

    res.json({
      message: 'Workflow task reassigned',
      task_id: task.id,
      assignee_user_id: nextAssignee.id,
      reassigned_from_user_id: task.assignee_user_id
    })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Reassign workflow task error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    if (connection) connection.release()
  }
})

router.post('/tasks/:id/delegate', authenticate, async (req, res) => {
  if (!(await ensureWorkflowRolePermission(req, res, 'task_delegate'))) return

  const taskId = Number(req.params.id)
  const delegateToUserId = Number(req.body.delegate_to_user_id)
  const reason = req.body.reason ? String(req.body.reason) : null

  if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: 'Invalid task id' })
  if (!Number.isInteger(delegateToUserId) || delegateToUserId <= 0) {
    return res.status(400).json({ error: 'Valid delegate_to_user_id is required' })
  }

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [[task]] = await connection.execute(
      `SELECT id, org_id, workflow_instance_id, content_id, assignee_user_id, assigned_by, status
       FROM workflow_tasks
       WHERE id = ? AND org_id = ? FOR UPDATE`,
      [taskId, req.user.orgId]
    )
    if (!task) {
      await connection.rollback()
      return res.status(404).json({ error: 'Workflow task not found' })
    }
    if (task.status !== 'pending') {
      await connection.rollback()
      return res.status(409).json({ error: `Only pending tasks can be delegated (current=${task.status})` })
    }

    const isAdmin = req.user.role === 'admin'
    const isCurrentAssignee = Number(task.assignee_user_id) === Number(req.user.userId)
    if (!isAdmin && !isCurrentAssignee) {
      await connection.rollback()
      return res.status(403).json({ error: 'Only admin or current assignee can delegate this task' })
    }

    const nextAssignee = await getActiveUserInOrgById(connection, req.user.orgId, delegateToUserId)
    if (!nextAssignee) {
      await connection.rollback()
      return res.status(404).json({ error: 'Delegate user not found or inactive in this organization' })
    }
    if (Number(nextAssignee.id) === Number(task.assignee_user_id)) {
      await connection.rollback()
      return res.status(409).json({ error: 'Task is already assigned to this user' })
    }

    const delegatedAt = new Date()
    await connection.execute(
      `UPDATE workflow_tasks
       SET assignee_user_id = ?,
           delegated_from_user_id = ?,
           delegated_at = ?,
           assigned_by = ?,
           escalation_owner_user_id = CASE
             WHEN escalation_owner_user_id IS NOT NULL THEN ?
             ELSE escalation_owner_user_id
           END
       WHERE id = ? AND org_id = ?`,
      [
        nextAssignee.id,
        task.assignee_user_id,
        delegatedAt,
        req.user.userId,
        nextAssignee.id,
        task.id,
        req.user.orgId
      ]
    )

    const commentText = reason
      ? `Delegation reason: ${reason}`
      : `Task delegated to ${nextAssignee.name} (${nextAssignee.role})`
    await connection.execute(
      `INSERT INTO workflow_task_comments
         (org_id, workflow_task_id, content_id, user_id, comment_text)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.orgId, task.id, task.content_id, req.user.userId, commentText]
    )

    await connection.commit()

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'workflow_task_delegated',
      'workflow_task',
      task.id,
      req.ip,
      { assignee_user_id: task.assignee_user_id },
      {
        assignee_user_id: nextAssignee.id,
        delegated_from_user_id: task.assignee_user_id,
        delegated_at: delegatedAt
      },
      reason || 'Workflow task delegated'
    )

    res.json({
      message: 'Workflow task delegated',
      task_id: task.id,
      assignee_user_id: nextAssignee.id,
      delegated_from_user_id: task.assignee_user_id
    })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Delegate workflow task error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    if (connection) connection.release()
  }
})

router.get('/admin/rbac-policy', authenticate, requireAdmin, async (req, res) => {
  try {
    const policy = await getWorkflowRbacPolicy(req.user.orgId)
    res.json({
      ...policy,
      default_action_role_matrix: DEFAULT_ACTION_ROLE_MATRIX
    })
  } catch (error) {
    console.error('Get workflow RBAC policy error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/admin/rbac-policy', authenticate, requireAdmin, async (req, res) => {
  try {
    const policy = await setWorkflowRbacPolicy(req.user.orgId, req.body || {})
    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'workflow_rbac_policy_updated',
      'org_config',
      null,
      req.ip,
      null,
      policy,
      'Workflow RBAC policy updated'
    )
    res.json(policy)
  } catch (error) {
    console.error('Update workflow RBAC policy error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/admin/insights', authenticate, requireAdmin, async (req, res) => {
  try {
    const [[taskSummary]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_tasks,
         SUM(CASE WHEN wt.status = 'pending' THEN 1 ELSE 0 END) AS pending_total,
         SUM(CASE WHEN wt.status = 'pending' AND wt.due_at IS NOT NULL AND wt.due_at < NOW() THEN 1 ELSE 0 END) AS overdue_total,
         SUM(CASE WHEN wt.status = 'pending' AND wt.due_at IS NOT NULL AND wt.due_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) AS due_24h_total,
         SUM(CASE WHEN wt.status = 'pending' AND wt.escalated_at IS NOT NULL THEN 1 ELSE 0 END) AS escalated_pending_total,
         SUM(CASE WHEN wt.reassigned_at IS NOT NULL AND wt.reassigned_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS reassigned_30d_total,
         SUM(CASE WHEN wt.delegated_at IS NOT NULL AND wt.delegated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS delegated_30d_total
       FROM workflow_tasks wt
       WHERE wt.org_id = ?`,
      [req.user.orgId]
    )

    const [[completionStats]] = await pool.execute(
      `SELECT AVG(TIMESTAMPDIFF(HOUR, wt.created_at, wt.completed_at)) AS avg_completion_hours_30d
       FROM workflow_tasks wt
       WHERE wt.org_id = ?
         AND wt.status = 'completed'
         AND wt.completed_at IS NOT NULL
         AND wt.completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [req.user.orgId]
    )

    const [[notificationStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS notifications_24h,
         SUM(CASE WHEN notification_type = 'overdue' THEN 1 ELSE 0 END) AS overdue_notifications_24h,
         SUM(CASE WHEN notification_type = 'due_soon' THEN 1 ELSE 0 END) AS due_soon_notifications_24h
       FROM workflow_task_notifications
       WHERE org_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [req.user.orgId]
    )

    res.json({
      pending_total: Number(taskSummary.pending_total || 0),
      overdue_total: Number(taskSummary.overdue_total || 0),
      due_24h_total: Number(taskSummary.due_24h_total || 0),
      escalated_pending_total: Number(taskSummary.escalated_pending_total || 0),
      reassigned_30d_total: Number(taskSummary.reassigned_30d_total || 0),
      delegated_30d_total: Number(taskSummary.delegated_30d_total || 0),
      avg_completion_hours_30d: completionStats.avg_completion_hours_30d === null
        ? null
        : Number(Number(completionStats.avg_completion_hours_30d).toFixed(2)),
      notifications_24h: Number(notificationStats.notifications_24h || 0),
      overdue_notifications_24h: Number(notificationStats.overdue_notifications_24h || 0),
      due_soon_notifications_24h: Number(notificationStats.due_soon_notifications_24h || 0)
    })
  } catch (error) {
    console.error('Workflow admin insights error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/admin/analytics', authenticate, requireAdmin, async (req, res) => {
  const windowDays = clampAnalyticsWindowDays(req.query.window_days)
  try {
    const payload = await buildWorkflowAdminAnalytics(req.user.orgId, windowDays)
    res.json(payload)
  } catch (error) {
    console.error('Workflow analytics error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/admin/analytics/export.csv', authenticate, requireAdmin, async (req, res) => {
  const windowDays = clampAnalyticsWindowDays(req.query.window_days)
  try {
    const payload = await buildWorkflowAdminAnalytics(req.user.orgId, windowDays)

    const headerRows = [
      ['Metric', 'Value'],
      ['Window (days)', payload.window_days],
      ['Generated At (UTC)', payload.generated_at],
      ['Created Tasks', payload.kpis.created_total],
      ['Completed Tasks', payload.kpis.completed_total],
      ['Open Tasks', payload.kpis.open_total],
      ['Overdue Open Tasks', payload.kpis.overdue_open_total],
      ['Completion Rate %', payload.kpis.completion_rate_pct ?? ''],
      ['Completed SLA Breach Total', payload.kpis.completed_sla_breach_total],
      ['Completed SLA Breach Rate %', payload.kpis.completed_sla_breach_rate_pct ?? ''],
      ['Median Completion Hours', payload.kpis.median_completion_hours ?? ''],
      ['P95 Completion Hours', payload.kpis.p95_completion_hours ?? ''],
      ['Notifications', payload.delivery.notification_total],
      ['Email Delivered', payload.delivery.email_sent_total],
      ['Webhook Delivered', payload.delivery.webhook_sent_total],
      ['Delivery Failed', payload.delivery.delivery_failed_total]
    ]

    const bottleneckColumns = ['Step', 'Task Type', 'Total', 'Pending', 'Overdue Open', 'Avg Completion Hours', 'Avg Overdue Hours']
    const bottleneckData = payload.bottlenecks.map(row => [
      row.step_order,
      row.task_type,
      row.total_tasks,
      row.pending_total,
      row.overdue_open_total,
      row.avg_completion_hours ?? '',
      row.avg_overdue_hours ?? ''
    ])

    const assigneeColumns = ['User', 'Role', 'Pending', 'Overdue Open', 'Avg Completion Hours (30d)', 'User ID']
    const assigneeData = payload.assignee_load.map(row => [
      row.name,
      row.role,
      row.pending_total,
      row.overdue_open_total,
      row.avg_completion_hours_30d ?? '',
      row.user_id
    ])

    const trendColumns = ['Day', 'Created', 'Completed']
    const trendData = payload.trend.map(row => [row.day, row.created_total, row.completed_total])

    const csv = [
      toCsv(['Metric', 'Value'], headerRows.slice(1)),
      toCsv(bottleneckColumns, bottleneckData),
      toCsv(assigneeColumns, assigneeData),
      toCsv(trendColumns, trendData)
    ].join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=\"workflow-analytics-${payload.window_days}d.csv\"`)
    res.send(csv)
  } catch (error) {
    console.error('Workflow analytics export error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/admin/notifications', authenticate, requireAdmin, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit || '50', 10)))
  try {
    const [rows] = await pool.execute(
      `SELECT
         n.id,
         n.org_id,
         n.workflow_task_id,
         n.content_id,
         n.assignee_user_id,
         u.name AS assignee_name,
         n.notification_type,
         n.due_at,
         n.message,
         n.email_delivery_status,
         n.webhook_delivery_status,
         n.delivery_error,
         n.delivered_at,
         n.created_at,
         vc.doc_number,
         vc.title
       FROM workflow_task_notifications n
       LEFT JOIN users u
         ON u.id = n.assignee_user_id
        AND u.org_id = n.org_id
       LEFT JOIN vault_content vc
         ON vc.id = n.content_id
        AND vc.org_id = n.org_id
       WHERE n.org_id = ?
       ORDER BY n.created_at DESC
       LIMIT ${limit}`,
      [req.user.orgId]
    )

    res.json(rows)
  } catch (error) {
    console.error('Workflow notification feed error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/notifications/my', authenticate, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit || '50', 10)))
  try {
    const [rows] = await pool.execute(
      `SELECT
         n.id,
         n.org_id,
         n.workflow_task_id,
         n.content_id,
         n.assignee_user_id,
         n.notification_type,
         n.due_at,
         n.message,
         n.email_delivery_status,
         n.webhook_delivery_status,
         n.delivery_error,
         n.delivered_at,
         n.created_at,
         wt.status AS task_status,
         wt.activation_status,
         vc.doc_number,
         vc.title
       FROM workflow_task_notifications n
       JOIN workflow_tasks wt
         ON wt.id = n.workflow_task_id
        AND wt.org_id = n.org_id
       LEFT JOIN vault_content vc
         ON vc.id = n.content_id
        AND vc.org_id = n.org_id
       WHERE n.org_id = ?
         AND n.assignee_user_id = ?
       ORDER BY n.created_at DESC
       LIMIT ${limit}`,
      [req.user.orgId, req.user.userId]
    )

    const summary = {
      total: rows.length,
      overdue: rows.filter(row => row.notification_type === 'overdue').length,
      due_soon: rows.filter(row => row.notification_type === 'due_soon').length,
      pending_tasks: rows.filter(row => row.task_status === 'pending').length
    }

    res.json({ summary, results: rows })
  } catch (error) {
    console.error('Workflow user notification feed error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/tasks/:id/comments', authenticate, async (req, res) => {
  if (!(await ensureWorkflowRolePermission(req, res, 'task_comment_view'))) return

  const taskId = Number(req.params.id)
  if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: 'Invalid task id' })

  try {
    const [[task]] = await pool.execute(
      `SELECT id, org_id, assignee_user_id, assigned_by
       FROM workflow_tasks
       WHERE id = ? AND org_id = ?`,
      [taskId, req.user.orgId]
    )
    if (!task) return res.status(404).json({ error: 'Workflow task not found' })

    const canAccess = req.user.role === 'admin' ||
      Number(task.assignee_user_id) === Number(req.user.userId) ||
      Number(task.assigned_by) === Number(req.user.userId)
    if (!canAccess) return res.status(403).json({ error: 'Not authorized to view comments for this task' })

    const [rows] = await pool.execute(
      `SELECT
         c.id,
         c.org_id,
         c.workflow_task_id,
         c.content_id,
         c.user_id,
         u.name AS user_name,
         u.role AS user_role,
         c.comment_text,
         c.created_at
       FROM workflow_task_comments c
       LEFT JOIN users u
         ON u.id = c.user_id
        AND u.org_id = c.org_id
       WHERE c.org_id = ?
         AND c.workflow_task_id = ?
       ORDER BY c.created_at ASC, c.id ASC`,
      [req.user.orgId, taskId]
    )

    res.json(rows)
  } catch (error) {
    console.error('List workflow task comments error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/tasks/:id/comments', authenticate, async (req, res) => {
  if (!(await ensureWorkflowRolePermission(req, res, 'task_comment_create'))) return

  const taskId = Number(req.params.id)
  const commentText = String(req.body.comment_text || '').trim()
  if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: 'Invalid task id' })
  if (!commentText) return res.status(400).json({ error: 'comment_text is required' })

  try {
    const [[task]] = await pool.execute(
      `SELECT id, org_id, content_id, assignee_user_id, assigned_by
       FROM workflow_tasks
       WHERE id = ? AND org_id = ?`,
      [taskId, req.user.orgId]
    )
    if (!task) return res.status(404).json({ error: 'Workflow task not found' })

    const canAccess = req.user.role === 'admin' ||
      Number(task.assignee_user_id) === Number(req.user.userId) ||
      Number(task.assigned_by) === Number(req.user.userId)
    if (!canAccess) return res.status(403).json({ error: 'Not authorized to comment on this task' })

    const [result] = await pool.execute(
      `INSERT INTO workflow_task_comments
         (org_id, workflow_task_id, content_id, user_id, comment_text)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.orgId, taskId, task.content_id, req.user.userId, commentText]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'workflow_task_comment_added',
      'workflow_task',
      taskId,
      req.ip,
      null,
      { comment_id: result.insertId },
      'Workflow task comment added'
    )

    res.status(201).json({
      id: result.insertId,
      workflow_task_id: taskId,
      comment_text: commentText
    })
  } catch (error) {
    console.error('Add workflow task comment error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/tasks/:id/sign', authenticate, async (req, res) => {
  if (!(await ensureWorkflowRolePermission(req, res, 'task_sign'))) return

  const taskId = Number(req.params.id)
  const password = String(req.body.password || '')
  const signatureMeaning = String(req.body.signature_meaning || '').trim()
  const signatureComment = req.body.signature_comment ? String(req.body.signature_comment) : null

  if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: 'Invalid task id' })
  if (!password) return res.status(400).json({ error: 'Password is required for signature re-verification' })
  if (!ALLOWED_SIGNATURE_MEANINGS.includes(signatureMeaning)) {
    return res.status(400).json({ error: 'signature_meaning must be reviewed/approved/rejected/acknowledged' })
  }

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [[task]] = await connection.execute(
      `SELECT id, workflow_instance_id, org_id, content_id, assignee_user_id, status, task_type, activation_status
       FROM workflow_tasks
       WHERE id = ? AND org_id = ? FOR UPDATE`,
      [taskId, req.user.orgId]
    )

    if (!task) {
      await connection.rollback()
      return res.status(404).json({ error: 'Workflow task not found' })
    }
    if (Number(task.assignee_user_id) !== Number(req.user.userId)) {
      await connection.rollback()
      return res.status(403).json({ error: 'Only assignee can sign this task' })
    }
    if (task.status !== 'pending' || task.activation_status !== 'ready') {
      await connection.rollback()
      return res.status(409).json({ error: `Task is not signable (status=${task.status}, activation=${task.activation_status})` })
    }

    const [[user]] = await connection.execute(
      `SELECT id, password_hash
       FROM users
       WHERE id = ? AND org_id = ? AND is_active = 1`,
      [req.user.userId, req.user.orgId]
    )
    if (!user) {
      await connection.rollback()
      return res.status(404).json({ error: 'Active user not found' })
    }

    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      await connection.rollback()
      return res.status(401).json({ error: 'Password verification failed' })
    }

    const content = await getContentForWorkflow(connection, req.user.orgId, task.content_id)
    if (!content) {
      await connection.rollback()
      return res.status(404).json({ error: 'Linked content not found' })
    }

    const signedAt = new Date()
    const snapshotHash = buildSnapshotHash({
      org_id: req.user.orgId,
      content_id: content.id,
      doc_number: content.doc_number,
      current_version_id: content.current_version_id,
      lifecycle_state: content.lifecycle_state,
      signature_meaning: signatureMeaning,
      signer_user_id: req.user.userId,
      signed_at: signedAt.toISOString()
    })

    const [signatureResult] = await connection.execute(
      `INSERT INTO vault_signatures
         (org_id, content_id, workflow_task_id, signer_user_id, signature_meaning, signature_comment, password_reverified, hash_snapshot, signed_at, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        req.user.orgId,
        content.id,
        task.id,
        req.user.userId,
        signatureMeaning,
        signatureComment,
        snapshotHash,
        signedAt,
        req.ip || null
      ]
    )

    const nextTaskStatus = signatureMeaning === 'rejected' ? 'rejected' : 'completed'
    await connection.execute(
      `UPDATE workflow_tasks
       SET status = ?, completed_at = NOW(), comments = ?, signature_id = ?
       WHERE id = ? AND org_id = ?`,
      [nextTaskStatus, signatureComment, signatureResult.insertId, task.id, req.user.orgId]
    )

    let nextActivatedTaskId = null
    if (signatureMeaning === 'rejected') {
      await connection.execute(
        `UPDATE workflow_tasks
         SET status = 'cancelled'
         WHERE workflow_instance_id = ?
           AND org_id = ?
           AND status = 'pending'
           AND id <> ?`,
        [task.workflow_instance_id, req.user.orgId, task.id]
      )

      await connection.execute(
        `UPDATE workflow_instances
         SET status = 'cancelled', completed_at = NOW()
         WHERE id = ? AND org_id = ?`,
        [task.workflow_instance_id, req.user.orgId]
      )

      await connection.execute(
        `UPDATE vault_content
         SET lifecycle_state = 'draft', updated_at = NOW()
         WHERE id = ? AND org_id = ?`,
        [content.id, req.user.orgId]
      )
    } else {
      nextActivatedTaskId = await activateNextWaitingTask(connection, req.user.orgId, task.workflow_instance_id)
      const workflowClosed = await closeWorkflowIfNoPending(connection, req.user.orgId, task.workflow_instance_id)

      if (signatureMeaning === 'approved' && workflowClosed) {
        await connection.execute(
          `UPDATE vault_content
           SET lifecycle_state = 'approved', updated_at = NOW()
           WHERE id = ? AND org_id = ?`,
          [content.id, req.user.orgId]
        )
      }
    }

    await connection.commit()

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'workflow_task_signed',
      'workflow_task',
      task.id,
      req.ip,
      { status: 'pending' },
      {
        status: nextTaskStatus,
        signature_id: signatureResult.insertId,
        signature_meaning: signatureMeaning,
        next_activated_task_id: nextActivatedTaskId
      },
      'Workflow task signed with password re-verification'
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'signature_captured',
      'vault_signature',
      signatureResult.insertId,
      req.ip,
      null,
      {
        content_id: content.id,
        workflow_task_id: task.id,
        signature_meaning: signatureMeaning,
        hash_snapshot: snapshotHash
      },
      'Electronic signature recorded'
    )

    res.json({
      message: 'Task signed successfully',
      task_id: task.id,
      signature_id: signatureResult.insertId,
      signature_meaning: signatureMeaning,
      hash_snapshot: snapshotHash,
      next_activated_task_id: nextActivatedTaskId
    })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Sign workflow task error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    if (connection) connection.release()
  }
})

router.get('/signatures/:id', authenticate, async (req, res) => {
  const signatureId = Number(req.params.id)
  if (!Number.isInteger(signatureId) || signatureId <= 0) {
    return res.status(400).json({ error: 'Invalid signature id' })
  }

  try {
    const [[row]] = await pool.execute(
      `SELECT
         vs.id,
         vs.org_id,
         vs.content_id,
         vs.workflow_task_id,
         vs.signer_user_id,
         signer.name AS signer_name,
         signer.email AS signer_email,
         vs.signature_meaning,
         vs.signature_comment,
         vs.password_reverified,
         vs.hash_snapshot,
         vs.signed_at,
         vs.ip_address,
         vc.doc_number,
         vc.title,
         vc.lifecycle_state
       FROM vault_signatures vs
       JOIN vault_content vc
         ON vc.id = vs.content_id
        AND vc.org_id = vs.org_id
       LEFT JOIN users signer
         ON signer.id = vs.signer_user_id
        AND signer.org_id = vs.org_id
       WHERE vs.id = ?
         AND vs.org_id = ?`,
      [signatureId, req.user.orgId]
    )

    if (!row) return res.status(404).json({ error: 'Signature manifest not found' })
    res.json(row)
  } catch (error) {
    console.error('Get signature manifest error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
