const nodemailer = require('nodemailer')
const { query } = require('../database/db')

// Email transporter — built once, reused across requests
// Requires env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
// Falls back to console logging when not configured (dev/test mode)
let _transporter = null

function getTransporter() {
  if (_transporter) return _transporter

  const provider = process.env.EMAIL_PROVIDER || 'console'
  if (provider === 'console') return null

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  })

  return _transporter
}

async function sendEmail({ to, subject, text }) {
  const transporter = getTransporter()

  if (!transporter) {
    // Dev/test mode — log to console only
    console.log('[ieg-backend][email][console]', { to, subject, text })
    return
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@pharaxis.one'

  try {
    await transporter.sendMail({ from, to, subject, text })
  } catch (err) {
    // Log and continue — notification record is already persisted.
    // Email delivery failure must not break the workflow.
    console.error('[ieg-backend][email][error]', { to, subject, error: err.message })
  }
}

async function queueInApp({ recipientUserId, title, body, templateKey = null, context = {} }) {
  const { rows } = await query(
    `
      INSERT INTO ieg_notifications
      (channel, recipient_user_id, template_key, title, body, context, status)
      VALUES ('in_app', $1, $2, $3, $4, $5::jsonb, 'sent')
      RETURNING *
    `,
    [recipientUserId, templateKey, title, body, JSON.stringify(context)]
  )
  return rows[0]
}

async function queueEmail({ recipientExternalUserId, recipientEmail, title, body, templateKey = null, context = {} }) {
  const { rows } = await query(
    `
      INSERT INTO ieg_notifications
      (channel, recipient_external_user_id, template_key, title, body, context, status, sent_at)
      VALUES ('email', $1, $2, $3, $4, $5::jsonb, 'sent', NOW())
      RETURNING *
    `,
    [recipientExternalUserId, templateKey, title, body, JSON.stringify(context)]
  )

  // Send actual email — non-blocking, failure logged not thrown
  const emailAddress = recipientEmail || context?.email
  if (emailAddress) {
    await sendEmail({
      to: emailAddress,
      subject: title,
      text: body
    })
  } else {
    console.log('[ieg-backend][email][no-address]', { recipientExternalUserId, title })
  }

  return rows[0]
}

async function listUserNotifications({ userId, externalUserId }) {
  if (userId) {
    const { rows } = await query(
      `SELECT * FROM ieg_notifications WHERE recipient_user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId]
    )
    return rows
  }

  const { rows } = await query(
    `SELECT * FROM ieg_notifications WHERE recipient_external_user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [externalUserId]
  )
  return rows
}

module.exports = {
  queueInApp,
  queueEmail,
  listUserNotifications
}
