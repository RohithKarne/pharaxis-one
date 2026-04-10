const cron = require('node-cron')
const nodemailer = require('nodemailer')
const { pool } = require('../database/db')
const auditService = require('./auditService')

let transporter = null

function getTransporter() {
  if (transporter) return transporter

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || ''
        }
      : undefined
  })

  return transporter
}

async function sendExpiryAlertEmail({ to, orgName, docNumber, title, expiryDate }) {
  if (!to) return false

  const mailer = getTransporter()
  const subject = `[Vault Alert] Document expiring in 30 days: ${docNumber}`
  const text = [
    `Organization: ${orgName}`,
    `Document: ${title}`,
    `Document Number: ${docNumber}`,
    `Expiry Date: ${expiryDate}`,
    '',
    'Please review and renew the document before expiry.'
  ].join('\n')

  try {
    await mailer.sendMail({
      from: process.env.SMTP_USER || 'vault-alerts@pharaxis.local',
      to,
      subject,
      text
    })
    return true
  } catch (error) {
    console.error('Expiry alert email failed:', error.message)
    return false
  }
}

async function runExpiryAlertJob() {
  const [rows] = await pool.execute(
    `SELECT
       vc.id AS content_id,
       vc.org_id,
       vc.doc_number,
       vc.title,
       vm.expiry_date,
       o.name AS org_name,
       u.id AS owner_user_id,
       u.email AS owner_email
     FROM vault_content vc
     JOIN vault_metadata vm
       ON vm.content_id = vc.id
      AND vm.org_id = vc.org_id
     JOIN orgs o
       ON o.id = vc.org_id
     LEFT JOIN users u
       ON u.id = vc.created_by
      AND u.org_id = vc.org_id
     WHERE vm.expiry_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       AND vc.lifecycle_state <> 'archived'`
  )

  let sentCount = 0
  for (const row of rows) {
    const sent = await sendExpiryAlertEmail({
      to: row.owner_email,
      orgName: row.org_name,
      docNumber: row.doc_number,
      title: row.title,
      expiryDate: row.expiry_date
    })

    if (sent) sentCount += 1

    await auditService.log(
      row.org_id,
      row.owner_user_id || null,
      'org_user',
      'expiry_alert_sent',
      'vault_content',
      row.content_id,
      null,
      null,
      {
        email: row.owner_email,
        expiry_date: row.expiry_date,
        sent
      },
      'Expiry alert service execution'
    )
  }

  return { totalCandidates: rows.length, sentCount }
}

function registerExpiryAlertCron() {
  const timezone = process.env.EXPIRY_ALERT_TZ || 'UTC'

  return cron.schedule(
    '0 8 * * *',
    async () => {
      try {
        const result = await runExpiryAlertJob()
        console.log(`Expiry alert job complete: ${result.sentCount}/${result.totalCandidates}`)
      } catch (error) {
        console.error('Expiry alert job failed:', error)
      }
    },
    {
      timezone
    }
  )
}

module.exports = {
  registerExpiryAlertCron,
  runExpiryAlertJob
}
