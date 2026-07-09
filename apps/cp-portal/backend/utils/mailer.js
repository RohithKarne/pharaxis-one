/**
 * utils/mailer.js — CP Portal Outbound Email Utility
 *
 * Sends transactional emails using per-client SMTP configuration.
 *
 * Usage:
 *   const { sendEmail } = require('./mailer')
 *   await sendEmail(clientId, { to, subject, html, text })
 *
 * Non-fatal to callers — throws if no active config or SMTP fails.
 */

const nodemailer = require('nodemailer')
const { pool }   = require('../database/db')
const { decryptSecret } = require('./secretCrypto')

/**
 * Resolve the active SMTP config for a given client.
 * Returns null if none configured or not active.
 */
async function getEmailConfig(clientId) {
  const [[row]] = await pool.execute(`
    SELECT smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
           from_email, from_name
    FROM cp_email_config
    WHERE client_id = ? AND is_active = 1
      AND smtp_host IS NOT NULL AND smtp_username IS NOT NULL AND smtp_password IS NOT NULL
    LIMIT 1
  `, [clientId])
  if (row) row.smtp_password = decryptSecret(row.smtp_password)
  return row || null
}

/**
 * Build a nodemailer transporter from a config row.
 */
function buildTransporter(config) {
  const secure     = config.smtp_encryption === 'SSL/TLS'
  const requireTLS = config.smtp_encryption === 'STARTTLS'
  const allowInvalidCerts = String(process.env.CP_SMTP_ALLOW_INVALID_CERTS || '').toLowerCase() === 'true'
  return nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port,
    secure,
    requireTLS,
    auth: { user: config.smtp_username, pass: config.smtp_password },
    tls: { rejectUnauthorized: !allowInvalidCerts },
    connectionTimeout: 10000,
  })
}

/**
 * sendEmail — send a transactional email for a client.
 *
 * @param {number} clientId
 * @param {{ to: string, subject: string, html?: string, text?: string }} opts
 * @throws if no active email config or SMTP send fails
 */
async function sendEmail(clientId, { to, subject, html, text, attachments }) {
  const config = await getEmailConfig(clientId)
  if (!config) throw new Error('No active email configuration for this client.')

  const transporter = buildTransporter(config)
  const fromAddr = config.from_email || config.smtp_username
  const fromLabel = config.from_name || fromAddr

  await transporter.sendMail({
    from: `"${fromLabel}" <${fromAddr}>`,
    to,
    subject,
    html: html || undefined,
    text: text || undefined,
    attachments: attachments || undefined, // CP-11: e.g. .ics calendar invite
  })
}

module.exports = { sendEmail, getEmailConfig }
