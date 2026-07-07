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
const { emitTelemetryEvent } = require('./telemetryService')
const { logger } = require('./logger')
const { classifyInquiry } = require('./ai/inboxClassifierService')

// P7/F12: mailbox passwords are stored AES-256-GCM encrypted at rest (same scheme as
// SSO secrets). Decrypt at the point the IMAP client consumes them. Tolerant of legacy
// not-yet-encrypted (plaintext) rows so existing accounts keep polling.
//
// Mailbox passwords are written with ssoService.encryptSecret, so the dedicated
// SSO_CONFIG_ENCRYPTION_KEY is the key here too. Fail closed if it is missing — no
// fallback to JWT_SECRET or a hardcoded constant (mirrors getSsoEncryptionKeyMaterial).
function getMailboxEncryptionKeyMaterial() {
  const configured = String(process.env.SSO_CONFIG_ENCRYPTION_KEY || '').trim()
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SSO_CONFIG_ENCRYPTION_KEY must be set in production to decrypt mailbox credentials.'
    )
  }
  throw new Error(
    'SSO_CONFIG_ENCRYPTION_KEY is not set. Add it to your environment (.env) to manage mailbox credentials.'
  )
}

function deriveMailboxSecretKey() {
  return crypto.createHash('sha256').update(getMailboxEncryptionKeyMaterial()).digest()
}

// Read-compatibility only: keys previously used to derive the mailbox secret key
// before a dedicated key was required. Used solely to decrypt legacy DB rows.
// Never includes the removed 'mims-sso' constant — a predictable key is not an
// acceptable fallback.
function legacyMailboxDecryptionKeys() {
  const keys = []
  const seen = new Set()
  const push = (material) => {
    const base = String(material || '').trim()
    if (!base || seen.has(base)) return
    seen.add(base)
    keys.push(crypto.createHash('sha256').update(base).digest())
  }
  push(process.env.JWT_SECRET)
  push(require('../utils/jwtSecret'))
  return keys
}

function decryptWithMailboxKey(key, ivB64, tagB64, encryptedB64) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()])
  return decrypted.toString('utf8')
}

function decryptMailboxSecret(value) {
  const payload = String(value == null ? '' : value).trim()
  if (!payload) return value
  const parts = payload.split('.')
  if (parts.length !== 3) return value // not our envelope → assume legacy plaintext
  const [ivB64, tagB64, encryptedB64] = parts
  if (!ivB64 || !tagB64 || !encryptedB64) return value
  // Dedicated key first, then legacy keys for rows written before it was required.
  // deriveMailboxSecretKey() throws if the dedicated key is missing — fail closed
  // rather than falling back to a predictable constant. The GCM auth tag makes a
  // wrong-key attempt throw, so we advance to the next candidate.
  const candidateKeys = [deriveMailboxSecretKey(), ...legacyMailboxDecryptionKeys()]
  for (const key of candidateKeys) {
    try {
      return decryptWithMailboxKey(key, ivB64, tagB64, encryptedB64)
    } catch (_) { /* wrong key → try next */ }
  }
  return value // no configured key matched → treat as legacy plaintext
}

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

function hashFallback({ sender, recipient, subject, receivedAt, body, attachmentsCount }) {
  // WP3: header-less mail (no Message-ID) is deduped on this fallback hash. Added
  // recipient + attachment count and widened the body window from 1024 → 8192 to cut
  // false collisions — two distinct emails sharing sender/subject/date/first-1KB were
  // colliding and the second was silently dropped (bad in a PV inbox).
  // F24: sha256 (was sha1) for a non-security dedup fingerprint — consistency with the
  // rest of the codebase. Changing the algo changes the hash value going forward; worst
  // case an in-flight email is re-checked once (dedup still holds via INSERT IGNORE).
  const h = crypto.createHash('sha256')
  h.update(String(sender || ''))
  h.update('|')
  h.update(String(recipient || ''))
  h.update('|')
  h.update(String(subject || ''))
  h.update('|')
  h.update(String(receivedAt || ''))
  h.update('|')
  h.update(String(attachmentsCount || 0))
  h.update('|')
  h.update(String(body || '').slice(0, 8192))
  return h.digest('hex')
}

async function ingestAccount(account, sinceDt) {
  const { ImapFlow } = require('imapflow')

  const IMAP_CONNECT_TIMEOUT_MS = parseInt(process.env.IMAP_CONNECT_TIMEOUT_MS || '10000', 10);
  const IMAP_SOCKET_TIMEOUT_MS  = parseInt(process.env.IMAP_SOCKET_TIMEOUT_MS  || '30000', 10);

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_encryption === 'SSL/TLS',
    auth: {
      user: account.imap_username,
      pass: decryptMailboxSecret(account.imap_password),
    },
    tls: { rejectUnauthorized: false },
    logger: false,
    // Explicit timeouts — prevents IMAP hangs from silently stalling the poller
    connectionTimeout: IMAP_CONNECT_TIMEOUT_MS, // max time to establish TCP+TLS
    socketTimeout:     IMAP_SOCKET_TIMEOUT_MS,  // max idle time on open socket
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

        const message_hash = messageId ? null : hashFallback({ sender, recipient, subject, receivedAt, body: bodyText, attachmentsCount: attachments_count })

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
            classifyInquiry(inquiry.id).catch((err) => {
              logger.warn({ inquiry_id: inquiry.id, error: safeText(err?.message || err, 160) }, 'AI inbox classification failed')
            })
          }

          // Save attachments if enabled and present
          if (account.ingest_attachments && parsedEmail?.attachments?.length > 0) {
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
// WP3: promise for the tick currently ingesting, so a graceful shutdown can await it
// instead of killing an in-progress ingest (which interacts badly with the watermark).
let _activeRun = null

/**
 * Per-account IMAP failure backoff.
 * Tracks consecutive failure counts; skips the account for an exponentially
 * increasing window before retrying. Resets to 0 on first success.
 * Map<accountId, { failures: number, retryAfter: Date }>
 */
const _accountBackoff = new Map()
const BACKOFF_BASE_MS  = 60_000   // 1 min
const BACKOFF_MAX_MS   = 1_800_000 // 30 min cap

function _accountCanRetry(accountId) {
  const state = _accountBackoff.get(accountId)
  if (!state) return true
  return Date.now() >= state.retryAfter.getTime()
}

function _recordAccountFailure(accountId) {
  const state   = _accountBackoff.get(accountId) || { failures: 0 }
  const failures = state.failures + 1
  const backoffMs = Math.min(BACKOFF_BASE_MS * Math.pow(2, failures - 1), BACKOFF_MAX_MS)
  _accountBackoff.set(accountId, { failures, retryAfter: new Date(Date.now() + backoffMs) })
  return backoffMs
}

function _recordAccountSuccess(accountId) {
  _accountBackoff.delete(accountId)
}

function startPoller() {
  if (task) return task
  // Master tick: runs every 1 minute, checks which accounts are due based on their interval
  let running = false

  task = cron.schedule('* * * * *', () => {
    // Kick work to the next tick so the cron scheduler itself stays responsive.
    setImmediate(() => {
      if (running) return
      running = true
      _activeRun = (async () => {
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

          // Skip accounts that are in a backoff window due to repeated IMAP failures
          if (!_accountCanRetry(account.id)) {
            const state = _accountBackoff.get(account.id)
            logger.info({ account_id: account.id, retry_after: state.retryAfter.toISOString() }, 'Email poller: account in backoff — skipping')
            continue
          }

          const sinceDt = lastRun || new Date(now.getTime() - (account.initial_fetch_days || 7) * 24 * 60 * 60 * 1000)
          const runStartedAt = new Date().toISOString()
          logger.info({ account_id: account.id, account_name: account.account_name, since: sinceDt.toISOString() }, 'Email ingest started');

          try {
            const n = await ingestAccount(account, sinceDt)
            _recordAccountSuccess(account.id) // clear any failure backoff on success
            const runEndedAt = new Date().toISOString()
            // WP3: persist the watermark captured BEFORE the fetch (runStartedAt), not the
            // run-end time. Setting it to run-end silently dropped any email that arrived
            // during the fetch/parse window — a compliance risk for inbound PV/MI email.
            await pool.execute(
              `UPDATE email_accounts SET last_ingest_at = ? WHERE id = ?`,
              [toMySqlDateTime(runStartedAt), account.id]
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
            await emitTelemetryEvent({
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
            const backoffMs = _recordAccountFailure(account.id) // exponential backoff on repeated failure
            const runEndedAt = new Date().toISOString()
            logger.error({ account_id: account.id, account_name: account.account_name, backoff_ms: backoffMs, error: safeText(err?.message || err, 200) }, 'Email ingest failed');
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
            await emitTelemetryEvent({
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
        _activeRun = null
      }
      })()
    })
  })

  logger.info('Email poller started — tick every 1 minute (per-account intervals apply)')
  return task
}

async function stopPoller() {
  if (!task) return
  try { task.stop() } catch (_) {}
  task = null
  // WP3: let an in-flight ingest finish (and write its watermark) before we exit,
  // capped at 5s so shutdown never hangs.
  if (_activeRun) {
    try { await Promise.race([_activeRun.catch(() => {}), new Promise((r) => setTimeout(r, 5000))]) } catch (_) {}
  }
}

module.exports = { startPoller, stopPoller, ingestAccount }
