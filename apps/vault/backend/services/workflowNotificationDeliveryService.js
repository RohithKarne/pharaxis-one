const nodemailer = require('nodemailer')
const { enqueueWebhookRetriesForNotification } = require('./workflowWebhookQueueService')

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

function buildSubject(notificationType, docNumber) {
  if (notificationType === 'overdue') {
    return `[Vault Workflow] OVERDUE task for ${docNumber}`
  }
  return `[Vault Workflow] Task due soon for ${docNumber}`
}

function buildText(payload) {
  return [
    `Organization: ${payload.orgName || '-'}`,
    `Assignee: ${payload.assigneeName || '-'}`,
    `Document Number: ${payload.docNumber || '-'}`,
    `Document Title: ${payload.title || '-'}`,
    `Reminder Type: ${payload.notificationType}`,
    `Due At: ${payload.dueAt || '-'}`,
    '',
    payload.message
  ].join('\n')
}

async function sendWorkflowReminderEmail(payload) {
  if (!payload.assigneeEmail) {
    return { status: 'skipped', error: 'No assignee email' }
  }

  try {
    const mailer = getTransporter()
    await mailer.sendMail({
      from: process.env.WORKFLOW_NOTIFICATION_FROM || process.env.SMTP_USER || 'vault-workflow@pharaxis.local',
      to: payload.assigneeEmail,
      subject: buildSubject(payload.notificationType, payload.docNumber),
      text: buildText(payload)
    })
    return { status: 'sent', error: null }
  } catch (error) {
    return { status: 'failed', error: `Email delivery failed: ${error.message}` }
  }
}

async function deliverWorkflowReminder(payload) {
  const emailResult = await sendWorkflowReminderEmail(payload)
  const webhookResult = await enqueueWebhookRetriesForNotification(payload)

  const errors = [emailResult.error, webhookResult.error].filter(Boolean)
  const deliveredAt = emailResult.status === 'sent' || webhookResult.status === 'sent'
    ? new Date()
    : null

  return {
    emailStatus: emailResult.status,
    webhookStatus: webhookResult.status,
    deliveryError: errors.length ? errors.join(' || ') : null,
    deliveredAt
  }
}

async function sendWorkflowTestEmail({ toEmail, orgName = 'Pharaxis Vault', requestedBy = 'Admin' }) {
  if (!toEmail) {
    return { status: 'failed', error: 'toEmail is required' }
  }

  const subject = '[Vault Workflow] SMTP test delivery'
  const text = [
    'This is a test workflow notification email.',
    `Organization: ${orgName}`,
    `Requested By: ${requestedBy}`,
    `Timestamp: ${new Date().toISOString()}`
  ].join('\n')

  try {
    const mailer = getTransporter()
    await mailer.sendMail({
      from: process.env.WORKFLOW_NOTIFICATION_FROM || process.env.SMTP_USER || 'vault-workflow@pharaxis.local',
      to: toEmail,
      subject,
      text
    })
    return { status: 'sent', error: null }
  } catch (error) {
    return { status: 'failed', error: `SMTP test email failed: ${error.message}` }
  }
}

module.exports = {
  deliverWorkflowReminder,
  sendWorkflowTestEmail
}
