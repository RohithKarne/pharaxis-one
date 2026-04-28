/**
 * services/emailPoller.js — Email Ingestion Poller (Sprint 4 F1)
 *
 * Polls active inbound email accounts on their configured intervals.
 * Ingests new emails via IMAP and writes them to the persisted `inquiries` table.
 *
 * Owned by: Varun (CTO)
 */

const cron = require('node-cron')
const pool = require('../database/db')
const { logService } = require('./serviceLogger')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { simpleParser } = require('mailparser')
const { emitProcessEvent } = require('./processExplorerService')
const { logger } = require('./logger')

function toMySqlDateTime(input) {
  const dt = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(dt.getTime())) {
    const fallback = new Date()
    return fallback.toISOString().replace('T', ' ').substring(0, 19)
  }
  return dt.toISOString().replace('T', ' ').substring(0, 19)
}

function sanitizeFilename(name) {
  return String(name || 'attachment')
    .replace(/[\\/]/g, '_')
    .replace(/[^\w.\-()+ ]/g, '_')
    .slice(0, 180) || 'attachment'
}

function safeText(s, maxLen) {
  if (!s) return ''
  const str = String(s)
  return str.length > maxLen ? str.slice(0, maxLen) : str
}

function hashFallback({ sender, subject, receivedAt, body }) {
  const h = crypto.createHash('sha1')
  h.update(String(sender || ''))
  h.update('|')
  h.update(String(subject || ''))
  h.update('|')
  h.update(String(receivedAt || ''))
  h.update('|')
  h.update(String(body || '').slice(0, 1024))
  return h.digest('hex')
}

async function ingestAccount(account, sinceDt) {
  const { ImapFlow } = require('imapflow')

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_encryption === 'SSL/TLS',
    auth: {
      user: account.imap_username,
      pass: account.imap_password,
    },
    tls: { rejectUnauthorized: false },
    logger: false,
  })

  let inserted = 0

  try {
    await client.connect()

    const mailbox = account.mailbox_folder || 'INBOX'
    const lock = await client.getMailboxLock(mailbox)

    try {
      // Search for messages since sinceDt; imapflow accepts a Date directly.
      const uids = await client.search({ since: sinceDt }, { uid: true })

      if (!uids || uids.length === 0) return 0

      // Cap per-run to 25 to avoid overloading; dedup (INSERT IGNORE) handles re-fetched overlaps.
      const maxPerRun = 25
      const toFetch = uids.length > maxPerRun ? uids.slice(-maxPerRun) : uids

      for await (const msg of client.fetch(toFetch, { source: true, uid: true, bodyStructure: true }, { uid: true })) {
        let parsedEmail = null
        try {
          parsedEmail = await simpleParser(msg.source)
        } catch (_) {
          parsedEmail = null
        }

        const sender      = parsedEmail?.from?.text || null
        const recipient   = parsedEmail?.to?.text   || account.mailbox_email || null
        const subject     = parsedEmail?.subject    || '(no subject)'
        const receivedAt  = toMySqlDateTime(parsedEmail?.date || new Date())
        const messageId   = parsedEmail?.messageId  || null

        const bodyCandidate = parsedEmail?.text || parsedEmail?.html || ''
        const bodyText = safeText(
          parsedEmail?.text ? bodyCandidate : String(bodyCandidate).replace(/<[^>]+>/g, ' '),
          20000
        )

        // Count attachments from parsedEmail
        const attachments_count = parsedEmail?.attachments?.length || 0

        const message_hash = messageId ? null : hashFallback({ sender, subject, receivedAt, body: bodyText })

        const [result] = await pool.execute(`
          INSERT IGNORE INTO inquiries (
            org_id, email_account_id, message_id, message_hash,
            sender, recipient, subject, body, received_at,
            status, attachments_count, source_tag
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?)
        `, [
          account.org_id || null,
          account.id,
          messageId,
          message_hash,
          sender,
          recipient,
          subject,
          bodyText,
          receivedAt,
          attachments_count,
          'Email'
        ])

        if (result.affectedRows) {
          inserted += 1

          // Save attachments if enabled and present
          if (account.ingest_attachments && parsedEmail?.attachments?.length > 0) {
            const [[inquiry]] = await pool.execute(`
              SELECT id FROM inquiries
              WHERE email_account_id = ?
                AND (
                  (message_id IS NOT NULL AND message_id = ?)
                  OR (message_hash IS NOT NULL AND message_hash = ?)
                )
              ORDER BY id DESC LIMIT 1
            `, [account.id, messageId, message_hash])

            if (inquiry?.id) {
              const maxBytes = (account.max_attachment_mb || 10) * 1024 * 1024
              const baseDir = path.join(__dirname, '..', 'storage', 'email_attachments', String(account.id), String(inquiry.id))
              await fs.promises.mkdir(baseDir, { recursive: true })

              for (const att of parsedEmail.attachments) {
                try {
                  if (att.size && maxBytes && att.size > maxBytes) continue
                  const safeName = sanitizeFilename(att.filename || 'attachment')
                  const destPath = path.join(baseDir, `${Date.now()}-${safeName}`)
                  const buf = att.content
                  await fs.promises.writeFile(destPath, buf)
                  await pool.execute(
                    `INSERT INTO inquiry_attachments (inquiry_id, filename, mime_type, size_bytes, storage_path) VALUES (?, ?, ?, ?, ?)`,
                    [inquiry.id, safeName, att.contentType || null, buf.length, destPath]
                  )
                } catch (e) {
                  logger.warn({ inquiry_id: inquiry.id, error: safeText(e?.message || e, 160) }, 'Attachment save failed');
                }
              }
            }
          }
        }
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (err) {
    try { await client.logout() } catch (_) {}
    throw err
  }

  return inserted
}

let task = null

function startPoller() {
  if (task) return task
  // Master tick: runs every 1 minute, checks which accounts are due based on their interval
  let running = false

  task = cron.schedule('* * * * *', () => {
    // Kick work to the next tick so the cron scheduler itself stays responsive.
    setImmediate(async () => {
      if (running) return
      running = true

      try {
        const [accounts] = await pool.execute(`
          SELECT *
          FROM email_accounts
          WHERE is_active = 1 AND direction IN ('Inbound', 'Both')
            AND imap_host IS NOT NULL AND imap_port IS NOT NULL
            AND imap_username IS NOT NULL AND imap_password IS NOT NULL
        `)

        const now = new Date()

        for (const account of accounts) {
          const lastRun = account.last_ingest_at ? new Date(account.last_ingest_at) : null
          const intervalMs = (account.polling_interval_min || 5) * 60 * 1000
          const isDue = !lastRun || (now - lastRun) >= intervalMs
          if (!isDue) continue

          const sinceDt = lastRun || new Date(now.getTime() - (account.initial_fetch_days || 7) * 24 * 60 * 60 * 1000)
          const runStartedAt = new Date().toISOString()
          logger.info({ account_id: account.id, account_name: account.account_name, since: sinceDt.toISOString() }, 'Email ingest started');

          try {
            const n = await ingestAccount(account, sinceDt)
            const runEndedAt = new Date().toISOString()
            const runEndedAtDb = toMySqlDateTime(runEndedAt)
            await pool.execute(
              `UPDATE email_accounts SET last_ingest_at = ? WHERE id = ?`,
              [runEndedAtDb, account.id]
            )
            logger.info({ account_id: account.id, account_name: account.account_name, inserted: n }, 'Email ingest completed');
            logService({
              source: 'Email Accounts',
              service_type: 'IMAP',
              description: `Ingest completed for "${account.account_name}" — ${n} new email${n !== 1 ? 's' : ''} ingested`,
              status: 'success',
              details: {
                task_name: 'Email Import',
                account_id: account.id,
                account_name: account.account_name,
                start_at: runStartedAt,
                end_at: runEndedAt,
                total_count: n,
                error_count: 0,
                warning_count: 0,
                current_count: n,
                last_activity_at: runEndedAt,
                last_poll_at: runEndedAt,
              },
            })
            await emitProcessEvent({
              orgId: account.org_id || null,
              sourceModule: 'Background Jobs',
              method: 'JOB',
              path: '/jobs/email-poller',
              statusCode: 200,
              durationMs: Math.max(0, new Date(runEndedAt).getTime() - new Date(runStartedAt).getTime()),
              eventType: 'job_success',
              entityType: 'email_account',
              entityId: String(account.id),
              summary: `Email poller completed for account ${account.account_name} (${n} new emails)`,
              payload: { account_id: account.id, account_name: account.account_name, inserted: n },
            })
          } catch (err) {
            const runEndedAt = new Date().toISOString()
            logger.error({ account_id: account.id, account_name: account.account_name, error: safeText(err?.message || err, 200) }, 'Email ingest failed');
            logService({
              source: 'Email Accounts',
              service_type: 'IMAP',
              description: `Ingest failed for "${account.account_name}" — ${safeText(err?.message || err, 200)}`,
              status: 'failed',
              details: {
                task_name: 'Email Import',
                account_id: account.id,
                account_name: account.account_name,
                start_at: runStartedAt,
                end_at: runEndedAt,
                total_count: 0,
                error_count: 1,
                warning_count: 0,
                current_count: 0,
                last_activity_at: runEndedAt,
                last_poll_at: runEndedAt,
              },
            })
            await emitProcessEvent({
              orgId: account.org_id || null,
              sourceModule: 'Background Jobs',
              method: 'JOB',
              path: '/jobs/email-poller',
              statusCode: 500,
              durationMs: Math.max(0, new Date(runEndedAt).getTime() - new Date(runStartedAt).getTime()),
              eventType: 'job_failed',
              entityType: 'email_account',
              entityId: String(account.id),
              summary: `Email poller failed for account ${account.account_name}`,
              payload: { account_id: account.id, account_name: account.account_name },
              errorMessage: safeText(err?.message || err, 255),
            })
          }
        }
      } finally {
        running = false
      }
    })
  })

  logger.info('Email poller started — tick every 1 minute (per-account intervals apply)')
  return task
}

function stopPoller() {
  if (!task) return
  try { task.stop() } catch (_) {}
  task = null
}

module.exports = { startPoller, stopPoller, ingestAccount }
