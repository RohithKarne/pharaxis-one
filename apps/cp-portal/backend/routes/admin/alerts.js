/**
 * Admin alerts — /api/admin/alerts (bridge row 2)
 *
 *   GET  /:clientId                    open alerts, the last resolved ones, and who is told
 *   PUT  /:clientId/settings           who is emailed, and how long a safety task may wait
 *   POST /:clientId/:alertId/resolve   an admin marks an alert dealt with
 */
const express = require('express')
const router = express.Router()
const { pool } = require('../../database/db')
const { authenticateAdmin, requireClientAccess, requireRole } = require('../../middleware/auth')
const { audit } = require('../../utils/audit')
const { recipients, splitEmails } = require('../../services/adminAlerts')
const log = require('../../utils/logger')

const COLUMNS = 'id, kind, audience, title, body, link_path, related_type, related_id, emailed_to, created_at, resolved_at, resolved_by'

router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const clientId = Number(req.params.clientId)
    const [open] = await pool.execute(
      `SELECT ${COLUMNS} FROM cp_admin_alerts WHERE client_id = ? AND resolved_at IS NULL ORDER BY id DESC LIMIT 100`, [clientId])
    const [resolved] = await pool.execute(
      `SELECT ${COLUMNS} FROM cp_admin_alerts WHERE client_id = ? AND resolved_at IS NOT NULL ORDER BY resolved_at DESC LIMIT 10`, [clientId])
    const [[settings]] = await pool.execute('SELECT * FROM cp_alert_settings WHERE client_id = ?', [clientId])
    res.json({
      open, resolved,
      settings: {
        integration_emails: settings?.integration_emails || '',
        safety_emails: settings?.safety_emails || '',
        safety_wait_hours: settings?.safety_wait_hours ?? 4,
      },
      // Who would be emailed right now — the named list, or the default when none is set.
      sends_to: { integration: await recipients(clientId, 'integration'), safety: await recipients(clientId, 'safety') },
    })
  } catch (err) {
    log.error('admin.alerts.list_failed', { err, request_id: req.requestId || null })
    res.status(500).json({ error: 'Could not load alerts.' })
  }
})

router.put('/:clientId/settings', authenticateAdmin, requireClientAccess, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const clientId = Number(req.params.clientId)
    const cleaned = {}
    for (const key of ['integration_emails', 'safety_emails']) {
      const raw = String(req.body[key] || '').trim()
      const parts = raw ? raw.split(/[\s,;]+/).filter(Boolean) : []
      const good = splitEmails(raw)
      if (parts.length !== good.length) {
        const bad = parts.filter(p => !good.includes(p.toLowerCase()))
        return res.status(400).json({ error: `Not an email address: ${bad.join(', ')}`, field: key })
      }
      cleaned[key] = good.join(', ') || null
    }
    const hours = Number(req.body.safety_wait_hours)
    if (!Number.isInteger(hours) || hours < 1 || hours > 72) {
      return res.status(400).json({ error: 'The safety wait must be a whole number of hours, from 1 to 72.', field: 'safety_wait_hours' })
    }
    const [[before]] = await pool.execute('SELECT integration_emails, safety_emails, safety_wait_hours FROM cp_alert_settings WHERE client_id = ?', [clientId])
    await pool.execute(
      `INSERT INTO cp_alert_settings (client_id, integration_emails, safety_emails, safety_wait_hours) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE integration_emails = VALUES(integration_emails), safety_emails = VALUES(safety_emails), safety_wait_hours = VALUES(safety_wait_hours)`,
      [clientId, cleaned.integration_emails, cleaned.safety_emails, hours])
    await audit(req.admin, clientId, 'UPDATE', 'alert_settings', clientId, {
      before: before || null, after: { ...cleaned, safety_wait_hours: hours },
    })
    res.json({ ok: true })
  } catch (err) {
    log.error('admin.alerts.settings_failed', { err, request_id: req.requestId || null })
    res.status(500).json({ error: 'Could not save alert settings.' })
  }
})

router.post('/:clientId/:alertId/resolve', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    if (req.admin.role === 'viewer') return res.status(403).json({ error: 'You do not have permission to perform this action.' })
    const clientId = Number(req.params.clientId)
    // Keeps its dedupe key: a dismissed alert does not come back on the next sweep
    // for the same, still-unchanged problem.
    const [r] = await pool.execute(
      `UPDATE cp_admin_alerts SET resolved_at = UTC_TIMESTAMP(), resolved_by = ?
        WHERE id = ? AND client_id = ? AND resolved_at IS NULL`,
      [String(req.admin.name || req.admin.email || `admin #${req.admin.adminId}`).slice(0, 255), req.params.alertId, clientId])
    if (!r.affectedRows) return res.status(404).json({ error: 'That alert is not open.' })
    await audit(req.admin, clientId, 'RESOLVE', 'admin_alert', Number(req.params.alertId), {})
    res.json({ ok: true })
  } catch (err) {
    log.error('admin.alerts.resolve_failed', { err, request_id: req.requestId || null })
    res.status(500).json({ error: 'Could not mark the alert resolved.' })
  }
})

module.exports = router
