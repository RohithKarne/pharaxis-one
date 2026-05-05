const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' })
  next()
}

router.use(authenticate, requireAdmin)

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const raw = String(value)
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`
  return raw
}

function rowsToCsv(rows) {
  if (!rows.length) return 'No data\n'
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  rows.forEach(row => {
    lines.push(headers.map(header => csvEscape(row[header])).join(','))
  })
  return `${lines.join('\n')}\n`
}

async function getReportRows(reportKey, orgId) {
  if (reportKey === 'content-status') {
    const [rows] = await pool.execute(
      `SELECT vc.lifecycle_state, ct.name AS content_type_name, COUNT(*) AS total
       FROM vault_content vc
       LEFT JOIN content_types ct ON ct.id = vc.content_type_id AND ct.org_id = vc.org_id
       WHERE vc.org_id = ?
       GROUP BY vc.lifecycle_state, ct.name
       ORDER BY vc.lifecycle_state ASC, ct.name ASC`,
      [orgId]
    )
    return rows
  }
  if (reportKey === 'workflow-sla') {
    const [rows] = await pool.execute(
      `SELECT wi.id, vc.doc_number, vc.title, wi.status, wi.started_at, wi.completed_at,
              TIMESTAMPDIFF(HOUR, wi.started_at, COALESCE(wi.completed_at, NOW())) AS elapsed_hours,
              COUNT(wt.id) AS task_count,
              SUM(wt.status = 'pending') AS pending_tasks,
              SUM(wt.status = 'completed') AS completed_tasks,
              SUM(wt.due_at IS NOT NULL AND wt.status = 'pending' AND wt.due_at < NOW()) AS overdue_tasks
       FROM workflow_instances wi
       JOIN vault_content vc ON vc.id = wi.content_id AND vc.org_id = wi.org_id
       LEFT JOIN workflow_tasks wt ON wt.workflow_instance_id = wi.id AND wt.org_id = wi.org_id
       WHERE wi.org_id = ?
       GROUP BY wi.id, vc.doc_number, vc.title, wi.status, wi.started_at, wi.completed_at
       ORDER BY wi.started_at DESC
       LIMIT 500`,
      [orgId]
    )
    return rows
  }
  if (reportKey === 'expiry-forecast') {
    const [rows] = await pool.execute(
      `SELECT vc.id, vc.doc_number, vc.title, vc.lifecycle_state, vm.expiry_date,
              DATEDIFF(vm.expiry_date, CURDATE()) AS days_remaining, owner.name AS owner_name
       FROM vault_metadata vm
       JOIN vault_content vc ON vc.id = vm.content_id AND vc.org_id = vm.org_id
       LEFT JOIN users owner ON owner.id = vc.created_by AND owner.org_id = vc.org_id
       WHERE vm.org_id = ? AND vm.expiry_date IS NOT NULL
       ORDER BY vm.expiry_date ASC
       LIMIT 500`,
      [orgId]
    )
    return rows
  }
  if (reportKey === 'user-activity') {
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.role, COUNT(al.id) AS audit_events, MAX(al.created_at) AS last_activity_at
       FROM users u
       LEFT JOIN vault_audit_log al ON al.user_id = u.id AND al.org_id = u.org_id AND al.user_type = 'org_user'
       WHERE u.org_id = ?
       GROUP BY u.id, u.name, u.email, u.role
       ORDER BY audit_events DESC, last_activity_at DESC
       LIMIT 500`,
      [orgId]
    )
    return rows
  }
  if (reportKey === 'channel-distribution') {
    const [rows] = await pool.execute(
      `SELECT ch.id AS channel_id, ch.app_name, ch.status AS channel_status,
              COUNT(e.id) AS total_events,
              SUM(e.status = 'sent') AS sent,
              SUM(e.status = 'failed') AS failed,
              SUM(e.status = 'withdrawn') AS withdrawn,
              MAX(e.created_at) AS last_event_at
       FROM content_channels ch
       LEFT JOIN content_distribution_events e ON e.content_channel_id = ch.id AND e.org_id = ch.org_id
       WHERE ch.org_id = ?
       GROUP BY ch.id, ch.app_name, ch.status
       ORDER BY last_event_at DESC, ch.app_name ASC`,
      [orgId]
    )
    return rows
  }
  const error = new Error('Unknown report key')
  error.statusCode = 404
  throw error
}

router.get('/summary', async (req, res) => {
  try {
    const [[content]] = await pool.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(lifecycle_state = 'draft') AS draft,
         SUM(lifecycle_state = 'in_review') AS in_review,
         SUM(lifecycle_state = 'approved') AS approved,
         SUM(lifecycle_state = 'published') AS published,
         SUM(lifecycle_state = 'archived') AS archived
       FROM vault_content
       WHERE org_id = ?`,
      [req.user.orgId]
    )
    const [[workflow]] = await pool.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'active') AS active,
         SUM(status = 'completed') AS completed,
         SUM(status = 'cancelled') AS cancelled
       FROM workflow_instances
       WHERE org_id = ?`,
      [req.user.orgId]
    )
    const [[expiry]] = await pool.execute(
      `SELECT
         SUM(expiry_date < CURDATE()) AS expired,
         SUM(expiry_date >= CURDATE() AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS expiring_30,
         SUM(expiry_date > DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)) AS expiring_90
       FROM vault_metadata
       WHERE org_id = ? AND expiry_date IS NOT NULL`,
      [req.user.orgId]
    )
    const [[distribution]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_events,
         SUM(status = 'sent') AS sent,
         SUM(status = 'failed') AS failed,
         SUM(status = 'withdrawn') AS withdrawn
       FROM content_distribution_events
       WHERE org_id = ?`,
      [req.user.orgId]
    )

    res.json({ content, workflow, expiry, distribution })
  } catch (error) {
    console.error('Reports summary error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/export/:reportKey.csv', async (req, res) => {
  try {
    const rows = await getReportRows(req.params.reportKey, req.user.orgId)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.reportKey}.csv"`)
    res.send(rowsToCsv(rows))
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message })
    console.error('Report CSV export error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/presets', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, report_key, filters_json, schedule_frequency, schedule_recipients, is_active, created_at, updated_at
       FROM report_presets
       WHERE org_id = ? AND user_id = ? AND is_active = 1
       ORDER BY updated_at DESC, created_at DESC`,
      [req.user.orgId, req.user.userId]
    )
    res.json(rows.map(row => ({
      ...row,
      filters: row.filters_json || {}
    })))
  } catch (error) {
    console.error('List report presets error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/presets', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 180)
  const reportKey = String(req.body.report_key || '').trim()
  const frequency = ['none', 'weekly', 'monthly'].includes(req.body.schedule_frequency)
    ? req.body.schedule_frequency
    : 'none'
  if (!name) return res.status(400).json({ error: 'name is required' })
  if (!['content-status', 'workflow-sla', 'expiry-forecast', 'user-activity', 'channel-distribution'].includes(reportKey)) {
    return res.status(400).json({ error: 'Invalid report_key' })
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO report_presets
       (org_id, user_id, name, report_key, filters_json, schedule_frequency, schedule_recipients)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.orgId,
        req.user.userId,
        name,
        reportKey,
        JSON.stringify(req.body.filters || {}),
        frequency,
        req.body.schedule_recipients ? String(req.body.schedule_recipients).slice(0, 1000) : null
      ]
    )
    res.status(201).json({ id: result.insertId, name, report_key: reportKey, schedule_frequency: frequency })
  } catch (error) {
    console.error('Create report preset error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/content-status', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         vc.lifecycle_state,
         ct.name AS content_type_name,
         COUNT(*) AS total
       FROM vault_content vc
       LEFT JOIN content_types ct
         ON ct.id = vc.content_type_id
        AND ct.org_id = vc.org_id
       WHERE vc.org_id = ?
       GROUP BY vc.lifecycle_state, ct.name
       ORDER BY vc.lifecycle_state ASC, ct.name ASC`,
      [req.user.orgId]
    )
    res.json(rows)
  } catch (error) {
    console.error('Content status report error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/workflow-sla', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         wi.id,
         vc.doc_number,
         vc.title,
         wi.status,
         wi.started_at,
         wi.completed_at,
         TIMESTAMPDIFF(HOUR, wi.started_at, COALESCE(wi.completed_at, NOW())) AS elapsed_hours,
         COUNT(wt.id) AS task_count,
         SUM(wt.status = 'pending') AS pending_tasks,
         SUM(wt.status = 'completed') AS completed_tasks,
         SUM(wt.due_at IS NOT NULL AND wt.status = 'pending' AND wt.due_at < NOW()) AS overdue_tasks
       FROM workflow_instances wi
       JOIN vault_content vc
         ON vc.id = wi.content_id
        AND vc.org_id = wi.org_id
       LEFT JOIN workflow_tasks wt
         ON wt.workflow_instance_id = wi.id
        AND wt.org_id = wi.org_id
       WHERE wi.org_id = ?
       GROUP BY wi.id, vc.doc_number, vc.title, wi.status, wi.started_at, wi.completed_at
       ORDER BY wi.started_at DESC
       LIMIT 100`,
      [req.user.orgId]
    )
    res.json(rows)
  } catch (error) {
    console.error('Workflow SLA report error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/expiry-forecast', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         vc.id,
         vc.doc_number,
         vc.title,
         vc.lifecycle_state,
         vm.expiry_date,
         DATEDIFF(vm.expiry_date, CURDATE()) AS days_remaining,
         owner.name AS owner_name
       FROM vault_metadata vm
       JOIN vault_content vc
         ON vc.id = vm.content_id
        AND vc.org_id = vm.org_id
       LEFT JOIN users owner
         ON owner.id = vc.created_by
        AND owner.org_id = vc.org_id
       WHERE vm.org_id = ?
         AND vm.expiry_date IS NOT NULL
       ORDER BY vm.expiry_date ASC
       LIMIT 100`,
      [req.user.orgId]
    )
    res.json(rows)
  } catch (error) {
    console.error('Expiry forecast report error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/user-activity', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.role,
         COUNT(al.id) AS audit_events,
         MAX(al.created_at) AS last_activity_at
       FROM users u
       LEFT JOIN vault_audit_log al
         ON al.user_id = u.id
        AND al.org_id = u.org_id
        AND al.user_type = 'org_user'
       WHERE u.org_id = ?
       GROUP BY u.id, u.name, u.email, u.role
       ORDER BY audit_events DESC, last_activity_at DESC
       LIMIT 100`,
      [req.user.orgId]
    )
    res.json(rows)
  } catch (error) {
    console.error('User activity report error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/channel-distribution', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         ch.id AS channel_id,
         ch.app_name,
         ch.status AS channel_status,
         COUNT(e.id) AS total_events,
         SUM(e.status = 'sent') AS sent,
         SUM(e.status = 'failed') AS failed,
         SUM(e.status = 'withdrawn') AS withdrawn,
         MAX(e.created_at) AS last_event_at
       FROM content_channels ch
       LEFT JOIN content_distribution_events e
         ON e.content_channel_id = ch.id
        AND e.org_id = ch.org_id
       WHERE ch.org_id = ?
       GROUP BY ch.id, ch.app_name, ch.status
       ORDER BY last_event_at DESC, ch.app_name ASC`,
      [req.user.orgId]
    )
    res.json(rows)
  } catch (error) {
    console.error('Channel distribution report error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
