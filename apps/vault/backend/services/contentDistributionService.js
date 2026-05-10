const cron = require('node-cron')
const { pool } = require('../database/db')
const auditService = require('./auditService')
const { logError, logInfo } = require('./logger')
const { assertSafeOutboundUrl } = require('./networkGuard')
const { runWithDbLock } = require('./distributedLock')

async function deliverToChannel({ content, channel, action }) {
  if (!channel.webhook_url) {
    return {
      status: 'sent',
      message: `${action} recorded for ${channel.app_name}; no webhook configured`,
      error: null
    }
  }

  let safeWebhookUrl
  try {
    safeWebhookUrl = await assertSafeOutboundUrl(channel.webhook_url)
  } catch (error) {
    return {
      status: 'failed',
      message: `${action} failed for ${channel.app_name}`,
      error: error.message || 'Webhook URL blocked by outbound policy'
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number(process.env.DISTRIBUTION_WEBHOOK_TIMEOUT_MS || 5000))

  try {
    const response = await fetch(safeWebhookUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Pharaxis-Vault-Distribution/1.0'
      },
      signal: controller.signal,
      body: JSON.stringify({
        action,
        content: {
          id: content.id,
          doc_number: content.doc_number,
          title: content.title,
          lifecycle_state: content.lifecycle_state,
          version_number: content.version_number || null
        },
        channel: {
          id: channel.id,
          app_name: channel.app_name
        },
        sent_at: new Date().toISOString()
      })
    })
    if (!response.ok) {
      return {
        status: 'failed',
        message: `${action} failed for ${channel.app_name}`,
        error: `Webhook returned HTTP ${response.status}`
      }
    }
    return {
      status: action === 'withdraw' ? 'withdrawn' : 'sent',
      message: `${action} delivered to ${channel.app_name}`,
      error: null
    }
  } catch (error) {
    return {
      status: 'failed',
      message: `${action} failed for ${channel.app_name}`,
      error: error.message || 'Webhook delivery failed'
    }
  } finally {
    clearTimeout(timer)
  }
}

async function enqueueRetry(orgId, eventId, errorMessage) {
  await pool.execute(
    `INSERT INTO content_distribution_retry_queue
     (org_id, content_distribution_event_id, attempt_count, status, next_attempt_at, last_error)
     VALUES (?, ?, 0, 'pending', DATE_ADD(NOW(), INTERVAL 5 MINUTE), ?)`,
    [orgId, eventId, errorMessage || null]
  )
}

async function recordDistributionEvent({ orgId, userId, ip, content, channel, action }) {
  const delivery = await deliverToChannel({ content, channel, action })
  const [result] = await pool.execute(
    `INSERT INTO content_distribution_events
     (org_id, content_id, content_channel_id, action, status, message, error_message, created_by, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [orgId, content.id, channel.id, action, delivery.status, delivery.message, delivery.error, userId]
  )

  if (delivery.status === 'failed') {
    await enqueueRetry(orgId, result.insertId, delivery.error)
  }

  await auditService.log(
    orgId,
    userId,
    'org_user',
    `content_distribution_${action}`,
    'content_distribution_event',
    result.insertId,
    ip,
    null,
    {
      content_id: content.id,
      content_channel_id: channel.id,
      status: delivery.status,
      message: delivery.message,
      error_message: delivery.error
    },
    'Content distribution event recorded'
  )

  return {
    id: result.insertId,
    status: delivery.status,
    message: delivery.message,
    error_message: delivery.error
  }
}

async function runDistributionRetryJob() {
  const [rows] = await pool.execute(
    `SELECT q.id AS queue_id, q.attempt_count, q.max_attempts,
            e.id AS event_id, e.org_id, e.content_id, e.content_channel_id, e.created_by,
            vc.doc_number, vc.title, vc.lifecycle_state, vv.version_number,
            ch.app_name, ch.webhook_url, ch.status AS channel_status
       FROM content_distribution_retry_queue q
       JOIN content_distribution_events e
         ON e.id = q.content_distribution_event_id
        AND e.org_id = q.org_id
       JOIN vault_content vc
         ON vc.id = e.content_id
        AND vc.org_id = e.org_id
       LEFT JOIN vault_versions vv
         ON vv.id = vc.current_version_id
        AND vv.org_id = vc.org_id
       JOIN content_channels ch
         ON ch.id = e.content_channel_id
        AND ch.org_id = e.org_id
       WHERE q.status = 'pending'
         AND q.next_attempt_at <= NOW()
       ORDER BY q.next_attempt_at ASC
       LIMIT 10`
  )

  for (const row of rows) {
    try {
      const result = await recordDistributionEvent({
        orgId: row.org_id,
        userId: row.created_by,
        ip: null,
        content: {
          id: row.content_id,
          doc_number: row.doc_number,
          title: row.title,
          lifecycle_state: row.lifecycle_state,
          version_number: row.version_number
        },
        channel: {
          id: row.content_channel_id,
          app_name: row.app_name,
          webhook_url: row.webhook_url,
          status: row.channel_status
        },
        action: 'retry'
      })

      const nextAttempt = Number(row.attempt_count) + 1
      const exhausted = nextAttempt >= Number(row.max_attempts)
      await pool.execute(
        `UPDATE content_distribution_retry_queue
         SET attempt_count = ?,
             status = ?,
             next_attempt_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
             last_error = ?
         WHERE id = ?`,
        [
          nextAttempt,
          result.status === 'sent' ? 'sent' : (exhausted ? 'failed' : 'pending'),
          Math.min(60, 5 * (nextAttempt + 1)),
          result.error_message || null,
          row.queue_id
        ]
      )
    } catch (error) {
      logError('content_distribution_retry_failed', { error, queue_id: row.queue_id })
    }
  }

  return rows.length
}

function registerDistributionRetryCron() {
  if (process.env.DISABLE_CRON === 'true') return null
  return cron.schedule('*/5 * * * *', async () => {
    try {
      const lockRun = await runWithDbLock('vault:cron:distribution-retry', 1, runDistributionRetryJob)
      if (lockRun.skipped) return
      const processed = lockRun.result
      if (processed) logInfo('content_distribution_retry_processed', { processed })
    } catch (error) {
      logError('content_distribution_retry_cron_failed', { error })
    }
  })
}

module.exports = {
  recordDistributionEvent,
  runDistributionRetryJob,
  registerDistributionRetryCron
}
