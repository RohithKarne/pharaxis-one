/**
 * routes/admin/emailConfig.js — Email Service Settings per client
 *
 * GET  /api/admin/email-config/:clientId         — load config (password masked)
 * PATCH /api/admin/email-config/:clientId        — save config
 * POST  /api/admin/email-config/:clientId/test   — send test email
 */

const express = require('express')
const router = express.Router()
const { pool } = require('../../database/db')
const { authenticateAdmin, requireClientAccess, requireRole } = require('../../middleware/auth')
const { audit } = require('../../utils/audit')
const { sendEmail } = require('../../utils/mailer')

// GET /api/admin/email-config/:clientId — returns config, never the real password
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { clientId } = req.params
    const [[row]] = await pool.execute(`
      SELECT id, client_id, smtp_host, smtp_port, smtp_encryption,
             smtp_username, from_email, from_name, is_active, updated_at,
             CASE WHEN smtp_password IS NOT NULL AND smtp_password != '' THEN 1 ELSE 0 END AS has_password
      FROM cp_email_config WHERE client_id = ?
    `, [clientId])

    // Return empty defaults if not yet configured
    res.json({
      config: row || {
        smtp_host: '', smtp_port: 587, smtp_encryption: 'STARTTLS',
        smtp_username: '', from_email: '', from_name: '', is_active: 0, has_password: 0,
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Server error.' })
  }
})

// PATCH /api/admin/email-config/:clientId — upsert SMTP config
router.patch('/:clientId', authenticateAdmin, requireClientAccess, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { clientId } = req.params
    const { smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password, from_email, from_name, is_active } = req.body

    const [[existing]] = await pool.execute('SELECT id FROM cp_email_config WHERE client_id = ?', [clientId])

    if (existing) {
      // Build dynamic update — only touch password if a new value was sent
      const updates = [
        'smtp_host = ?', 'smtp_port = ?', 'smtp_encryption = ?',
        'smtp_username = ?', 'from_email = ?', 'from_name = ?',
        'is_active = ?', 'updated_at = NOW()',
      ]
      const params = [
        smtp_host || null, smtp_port || 587, smtp_encryption || 'STARTTLS',
        smtp_username || null, from_email || null, from_name || null,
        is_active ? 1 : 0,
      ]
      if (smtp_password) {
        updates.splice(3, 0, 'smtp_password = ?')
        params.splice(3, 0, smtp_password)
      }
      params.push(clientId)
      await pool.execute(`UPDATE cp_email_config SET ${updates.join(', ')} WHERE client_id = ?`, params)
    } else {
      await pool.execute(`
        INSERT INTO cp_email_config
          (client_id, smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password, from_email, from_name, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        clientId, smtp_host || null, smtp_port || 587, smtp_encryption || 'STARTTLS',
        smtp_username || null, smtp_password || null, from_email || null, from_name || null,
        is_active ? 1 : 0,
      ])
    }

    await audit(req.admin, clientId, 'UPDATE', 'email_config', Number(clientId), { smtp_host, smtp_username, is_active })
    res.json({ message: 'Email settings saved.' })
  } catch (err) {
    res.status(500).json({ error: 'Server error.' })
  }
})

// POST /api/admin/email-config/:clientId/test — send a test email via the saved config
router.post('/:clientId/test', authenticateAdmin, requireClientAccess, requireRole('superadmin', 'admin'), async (req, res) => {
  const { clientId } = req.params
  const { to } = req.body
  if (!to) return res.status(400).json({ error: 'Recipient email address (to) is required.' })

  try {
    await sendEmail(Number(clientId), {
      to,
      subject: 'CP Portal — Test Email',
      html: `<p>This is a test email from <strong>CP Portal</strong>.</p><p>Your email service is configured correctly.</p>`,
      text: 'This is a test email from CP Portal. Your email service is configured correctly.',
    })
    await audit(req.admin, clientId, 'TEST_EMAIL', 'email_config', Number(clientId), { to })
    res.json({ message: `Test email sent to ${to}.` })
  } catch (err) {
    res.status(502).json({ error: `Failed to send: ${err.message}` })
  }
})

module.exports = router
