const nodemailer = require('nodemailer')
const { query } = require('../database/db')
const { publishToUser } = require('./notificationHub')

let transporter

function getTransporter() {
  if (transporter) return transporter

  const host = process.env.SMTP_HOST
  if (!host) {
    transporter = nodemailer.createTransport({ jsonTransport: true })
    return transporter
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || ''
        }
      : undefined
  })

  return transporter
}

async function isEmailEnabled(userId, eventKey) {
  const rows = await query(
    `
      SELECT email_enabled AS emailEnabled
      FROM pub_user_notification_preferences
      WHERE user_id = ? AND event_key = ?
      LIMIT 1
    `,
    [userId, eventKey]
  )

  if (!rows[0]) return true
  return Boolean(Number(rows[0].emailEnabled))
}

async function listUserPreferences(userId) {
  const rows = await query(
    `
      SELECT event_key AS eventKey, email_enabled AS emailEnabled
      FROM pub_user_notification_preferences
      WHERE user_id = ?
      ORDER BY event_key ASC
    `,
    [userId]
  )

  return rows.map((row) => ({
    eventKey: row.eventKey,
    emailEnabled: Boolean(Number(row.emailEnabled))
  }))
}

async function upsertUserPreference(userId, eventKey, emailEnabled) {
  await query(
    `
      INSERT INTO pub_user_notification_preferences (user_id, event_key, email_enabled)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE email_enabled = VALUES(email_enabled)
    `,
    [userId, eventKey, emailEnabled ? 1 : 0]
  )
}

async function sendUserNotification({ tenantId, recipientUserId, eventKey, title, body, context = {} }) {
  const users = await query(
    `
      SELECT id, email, full_name AS fullName
      FROM pub_users
      WHERE id = ? AND is_active = 1
      LIMIT 1
    `,
    [recipientUserId]
  )

  const user = users[0]
  if (!user) return

  const prefEnabled = await isEmailEnabled(user.id, eventKey)
  const inserted = await query(
    `
      INSERT INTO pub_notifications
      (tenant_id, recipient_user_id, channel, template_key, title, body, status, read_at)
      VALUES (?, ?, 'email', ?, ?, ?, ?, NULL)
    `,
    [tenantId, user.id, eventKey, title, body, prefEnabled ? 'queued' : 'skipped']
  )

  const notificationId = inserted.insertId
  const initialPayload = {
    id: notificationId,
    eventKey,
    title,
    body,
    status: prefEnabled ? 'queued' : 'skipped',
    isRead: false,
    createdAt: new Date().toISOString()
  }

  publishToUser(user.id, {
    type: 'notification.created',
    notification: initialPayload
  })

  if (!prefEnabled) return initialPayload

  try {
    const mail = {
      from: process.env.NOTIFICATION_FROM_EMAIL || 'no-reply@pharaxis.one',
      to: user.email,
      subject: title,
      text: body,
      html: `<p>${String(body).replace(/\n/g, '<br/>')}</p><pre>${JSON.stringify(context || {}, null, 2)}</pre>`
    }

    await getTransporter().sendMail(mail)
    await query(
      `UPDATE pub_notifications SET status = 'sent', sent_at = CURRENT_TIMESTAMP(6) WHERE id = ?`,
      [notificationId]
    )
    publishToUser(user.id, {
      type: 'notification.updated',
      notification: { ...initialPayload, status: 'sent' }
    })
  } catch (error) {
    await query(
      `UPDATE pub_notifications SET status = 'failed' WHERE id = ?`,
      [notificationId]
    )
    publishToUser(user.id, {
      type: 'notification.updated',
      notification: { ...initialPayload, status: 'failed' }
    })
    console.error('[publications-notifications] send failure', error)
  }

  return initialPayload
}

async function sendEmailDirect({ toEmail, title, body, context = {} }) {
  if (!toEmail) return
  const mail = {
    from: process.env.NOTIFICATION_FROM_EMAIL || 'no-reply@pharaxis.one',
    to: toEmail,
    subject: title,
    text: body,
    html: `<p>${String(body).replace(/\n/g, '<br/>')}</p><pre>${JSON.stringify(context || {}, null, 2)}</pre>`
  }

  await getTransporter().sendMail(mail)
}

async function listNotificationsForUser(user) {
  const rows = await query(
    `
      SELECT
        id,
        template_key AS eventKey,
        title,
        body,
        status,
        read_at AS readAt,
        sent_at AS sentAt,
        created_at AS createdAt
      FROM pub_notifications
      WHERE recipient_user_id = ?
      ORDER BY created_at DESC
      LIMIT 200
    `,
    [user.id]
  )

  return rows.map((row) => ({
    ...row,
    isRead: Boolean(row.readAt)
  }))
}

async function markNotificationRead(userId, notificationId) {
  await query(
    `
      UPDATE pub_notifications
      SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP(6))
      WHERE id = ? AND recipient_user_id = ?
    `,
    [notificationId, userId]
  )
}

async function markAllNotificationsRead(userId) {
  await query(
    `
      UPDATE pub_notifications
      SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP(6))
      WHERE recipient_user_id = ?
        AND read_at IS NULL
    `,
    [userId]
  )
}

async function getUnreadCount(userId) {
  const rows = await query(
    `
      SELECT COUNT(*) AS unreadCount
      FROM pub_notifications
      WHERE recipient_user_id = ?
        AND read_at IS NULL
    `,
    [userId]
  )
  return Number(rows[0]?.unreadCount || 0)
}

module.exports = {
  listUserPreferences,
  upsertUserPreference,
  sendUserNotification,
  sendEmailDirect,
  listNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount
}
