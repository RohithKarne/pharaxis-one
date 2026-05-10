const cron = require('node-cron')
const crypto = require('crypto')
const { pool } = require('../database/db')
const { runWithDbLock } = require('./distributedLock')

const DEFAULT_MAX_ATTEMPTS = Math.max(1, Number(process.env.WORKFLOW_WEBHOOK_MAX_ATTEMPTS || 5))
const BASE_DELAY_MINUTES = Math.max(1, Number(process.env.WORKFLOW_WEBHOOK_BASE_DELAY_MINUTES || 5))
const MAX_DELAY_MINUTES = Math.max(BASE_DELAY_MINUTES, Number(process.env.WORKFLOW_WEBHOOK_MAX_DELAY_MINUTES || 360))

function buildWebhookPayload(payload) {
  return {
    event: 'workflow_task_reminder',
    org_id: payload.orgId,
    workflow_task_notification_id: payload.notificationId,
    workflow_task_id: payload.taskId,
    content_id: payload.contentId,
    doc_number: payload.docNumber,
    title: payload.title,
    assignee_user_id: payload.assigneeUserId,
    assignee_name: payload.assigneeName,
    assignee_email: payload.assigneeEmail,
    notification_type: payload.notificationType,
    due_at: payload.dueAt,
    message: payload.message,
    emitted_at: new Date().toISOString()
  }
}

function computeSignature(bodyJson, secret) {
  if (!secret) return null
  const digest = crypto.createHmac('sha256', secret).update(bodyJson).digest('hex')
  return `sha256=${digest}`
}

function nextAttemptDate(nextAttemptCount) {
  const minutes = Math.min(MAX_DELAY_MINUTES, BASE_DELAY_MINUTES * (2 ** Math.max(0, nextAttemptCount - 1)))
  const next = new Date()
  next.setMinutes(next.getMinutes() + minutes)
  return next
}

async function postWebhook(url, bodyJson, signature, queueId) {
  const timeoutMs = Number(process.env.WORKFLOW_WEBHOOK_TIMEOUT_MS || 4000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Vault-Event': 'workflow_task_reminder',
      'X-Vault-Delivery-Id': String(queueId)
    }
    if (signature) {
      headers['X-Vault-Signature'] = signature
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyJson,
      signal: controller.signal
    })
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` }
    }
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: error.message || 'Webhook request failed' }
  } finally {
    clearTimeout(timeout)
  }
}

async function syncNotificationWebhookStatus(notificationId) {
  const [rows] = await pool.execute(
    `SELECT status, last_error
     FROM workflow_webhook_retry_queue
     WHERE workflow_task_notification_id = ?`,
    [notificationId]
  )
  if (!rows.length) return

  const hasPending = rows.some(row => row.status === 'pending')
  const hasFailed = rows.some(row => row.status === 'failed')
  const hasSent = rows.some(row => row.status === 'sent')

  let webhookStatus = 'failed'
  let deliveryError = null
  if (hasSent && !hasPending && !hasFailed) {
    webhookStatus = 'sent'
  } else if (!hasSent && !hasFailed && !hasPending) {
    webhookStatus = 'skipped'
  } else if (hasPending) {
    webhookStatus = hasSent ? 'sent' : 'failed'
  }

  if (webhookStatus !== 'sent') {
    const failures = rows
      .filter(row => row.status === 'failed' && row.last_error)
      .map(row => row.last_error)
    if (failures.length) deliveryError = failures.join(' | ')
  }

  await pool.execute(
    `UPDATE workflow_task_notifications
     SET webhook_delivery_status = ?,
         delivery_error = CASE
           WHEN ? IS NULL THEN delivery_error
           WHEN delivery_error IS NULL OR delivery_error = '' THEN ?
           ELSE CONCAT(delivery_error, ' || ', ?)
         END,
         delivered_at = CASE
           WHEN ? = 'sent' THEN COALESCE(delivered_at, NOW())
           ELSE delivered_at
         END
     WHERE id = ?`,
    [
      webhookStatus,
      deliveryError,
      deliveryError,
      deliveryError,
      webhookStatus,
      notificationId
    ]
  )
}

async function processQueueRow(row) {
  const bodyJson = typeof row.request_body_json === 'string'
    ? row.request_body_json
    : JSON.stringify(row.request_body_json)
  const signature = computeSignature(bodyJson, row.signature_secret || '')

  const result = await postWebhook(row.webhook_url, bodyJson, signature, row.id)
  const nextCount = Number(row.attempt_count || 0) + 1
  const exhausted = nextCount >= Number(row.max_attempts || DEFAULT_MAX_ATTEMPTS)

  if (result.ok) {
    await pool.execute(
      `UPDATE workflow_webhook_retry_queue
       SET status = 'sent',
           attempt_count = ?,
           last_error = NULL,
           last_attempt_at = NOW(),
           delivered_at = NOW(),
           next_attempt_at = NOW()
       WHERE id = ?`,
      [nextCount, row.id]
    )
    await syncNotificationWebhookStatus(row.workflow_task_notification_id)
    return { sent: 1, failed: 0, pending: 0 }
  }

  const nextStatus = exhausted ? 'failed' : 'pending'
  const nextAttemptAt = exhausted ? new Date() : nextAttemptDate(nextCount)
  await pool.execute(
    `UPDATE workflow_webhook_retry_queue
     SET status = ?,
         attempt_count = ?,
         last_error = ?,
         last_attempt_at = NOW(),
         next_attempt_at = ?
     WHERE id = ?`,
    [nextStatus, nextCount, result.error || 'Webhook request failed', nextAttemptAt, row.id]
  )
  await syncNotificationWebhookStatus(row.workflow_task_notification_id)
  return {
    sent: 0,
    failed: exhausted ? 1 : 0,
    pending: exhausted ? 0 : 1
  }
}

async function processDueWebhookRetries(limit = 50) {
  const [rows] = await pool.execute(
    `SELECT
       id,
       workflow_task_notification_id,
       webhook_url,
       request_body_json,
       signature_secret,
       attempt_count,
       max_attempts,
       status
     FROM workflow_webhook_retry_queue
     WHERE status = 'pending'
       AND next_attempt_at <= NOW()
     ORDER BY next_attempt_at ASC, id ASC
     LIMIT ${Math.min(500, Math.max(1, Number(limit || 50)))}`,
    []
  )

  if (!rows.length) return { processed: 0, sent: 0, failed: 0, pending: 0 }

  const summary = { processed: 0, sent: 0, failed: 0, pending: 0 }
  for (const row of rows) {
    const result = await processQueueRow(row)
    summary.processed += 1
    summary.sent += result.sent
    summary.failed += result.failed
    summary.pending += result.pending
  }
  return summary
}

async function enqueueWebhookRetriesForNotification(payload) {
  const [channels] = await pool.execute(
    `SELECT id, app_name, webhook_url, api_key
     FROM content_channels
     WHERE org_id = ?
       AND status = 'active'
       AND webhook_url IS NOT NULL
       AND webhook_url <> ''`,
    [payload.orgId]
  )

  if (!channels.length) {
    return {
      status: 'skipped',
      error: 'No active webhook channels',
      queuedCount: 0,
      sentCount: 0,
      failedCount: 0
    }
  }

  const body = buildWebhookPayload(payload)
  const requestBodyJson = JSON.stringify(body)
  const maxAttempts = DEFAULT_MAX_ATTEMPTS

  const queueIds = []
  for (const channel of channels) {
    const [insert] = await pool.execute(
      `INSERT INTO workflow_webhook_retry_queue
         (org_id, workflow_task_notification_id, content_channel_id, channel_name, webhook_url,
          request_body_json, signature_secret, attempt_count, max_attempts, status, next_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', NOW())`,
      [
        payload.orgId,
        payload.notificationId,
        channel.id,
        channel.app_name || null,
        channel.webhook_url,
        requestBodyJson,
        channel.api_key || process.env.WORKFLOW_WEBHOOK_SIGNING_SECRET || '',
        maxAttempts
      ]
    )
    queueIds.push(insert.insertId)
  }

  const [queueRows] = await pool.query(
    `SELECT
       id,
       workflow_task_notification_id,
       webhook_url,
       request_body_json,
       signature_secret,
       attempt_count,
       max_attempts,
       status
     FROM workflow_webhook_retry_queue
     WHERE id IN (?)`,
    [queueIds]
  )

  const summary = { sent: 0, failed: 0, pending: 0 }
  for (const row of queueRows) {
    const result = await processQueueRow(row)
    summary.sent += result.sent
    summary.failed += result.failed
    summary.pending += result.pending
  }

  const hasPendingOrFailed = summary.pending > 0 || summary.failed > 0
  return {
    status: hasPendingOrFailed ? 'failed' : 'sent',
    error: hasPendingOrFailed
      ? `Webhook retries queued/pending for ${summary.pending + summary.failed} channel(s)`
      : null,
    queuedCount: queueRows.length,
    sentCount: summary.sent,
    failedCount: summary.failed + summary.pending
  }
}

module.exports = {
  registerWorkflowWebhookRetryCron,
  enqueueWebhookRetriesForNotification,
  processDueWebhookRetries
}

function registerWorkflowWebhookRetryCron() {
  const timezone = process.env.WORKFLOW_WEBHOOK_RETRY_TZ || process.env.WORKFLOW_REMINDER_TZ || 'UTC'
  return cron.schedule(
    '*/5 * * * *',
    async () => {
      try {
        const lockRun = await runWithDbLock(
          'vault:cron:workflow-webhook-retry',
          1,
          () => processDueWebhookRetries(100)
        )
        if (lockRun.skipped) return
        const result = lockRun.result
        if (result.processed > 0) {
          // eslint-disable-next-line no-console
          console.log(`Workflow webhook retry job: processed=${result.processed} sent=${result.sent} failed=${result.failed} pending=${result.pending}`)
        }
      } catch (error) {
        console.error('Workflow webhook retry job failed:', error)
      }
    },
    { timezone }
  )
}
