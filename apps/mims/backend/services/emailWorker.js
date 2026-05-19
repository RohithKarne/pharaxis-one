'use strict';
/**
 * emailWorker.js — Async MI response email delivery worker
 *
 * Polls email_job_queue every 15 seconds for pending jobs.
 * Decouples SMTP delivery from the API request path — the PATCH /mi-responses/:id/status
 * route writes a job row and returns immediately; this worker picks it up and sends.
 *
 * Retry: up to max_attempts (default 3) with exponential back-off via scheduled_at.
 * On permanent failure (attempts >= max_attempts): status → 'failed', error logged.
 *
 * Owned by: Varun (CTO)
 */

const pool        = require('../database/db');
const nodemailer  = require('nodemailer');
const { logger }  = require('./logger');
const { logService } = require('./serviceLogger');

const POLL_INTERVAL_MS  = parseInt(process.env.EMAIL_WORKER_POLL_MS   || '15000', 10);
const BATCH_SIZE        = parseInt(process.env.EMAIL_WORKER_BATCH_SIZE || '5',     10);
const SMTP_TIMEOUT_MS   = parseInt(process.env.SMTP_CONNECT_TIMEOUT_MS || '15000', 10);
const SAFE_BATCH_SIZE   = Number.isFinite(BATCH_SIZE) ? Math.min(Math.max(BATCH_SIZE, 1), 100) : 5;

let _timer = null;
let _running = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseJsonSafe(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
}

// ── Core send logic ───────────────────────────────────────────────────────────

async function processJob(job) {
  const p = parseJsonSafe(job.payload, {});
  const {
    response_text, response_body_html, response_subject,
    recipient_email, recipient_name,
    selected_documents, case_number,
    smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
    display_name, from_email,
    enacted_by_user_id, enacted_by_email,
  } = p;

  if (!smtp_host || !recipient_email) {
    throw new Error('emailWorker: missing smtp_host or recipient_email in job payload');
  }

  // Build transporter
  const secure     = smtp_encryption === 'SSL/TLS';
  const requireTLS = smtp_encryption === 'STARTTLS';
  const transporter = nodemailer.createTransport({
    host: smtp_host,
    port: smtp_port,
    secure,
    requireTLS,
    auth: { user: smtp_username, pass: smtp_password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: SMTP_TIMEOUT_MS,
    socketTimeout:     SMTP_TIMEOUT_MS,
  });

  // Resolve document attachments
  let attachments = [];
  const docIds = (parseJsonSafe(selected_documents, []))
    .map((d) => Number(d?.id)).filter(Boolean);
  if (docIds.length) {
    const placeholders = docIds.map(() => '?').join(',');
    const [docs] = await pool.execute(
      `SELECT id, name, file_path, file_name, file_mime FROM cm_documents
        WHERE id IN (${placeholders}) AND file_path IS NOT NULL AND file_name IS NOT NULL`,
      docIds
    );
    attachments = docs.map((doc) => ({
      filename:    doc.file_name || doc.name,
      path:        doc.file_path,
      contentType: doc.file_mime || undefined,
    }));
  }

  const fromLabel = display_name || 'Medical Information';
  const fromAddr  = from_email   || smtp_username;
  const subject   = response_subject || `Medical Information Response — Case ${case_number || job.case_id}`;

  await transporter.sendMail({
    from:        `"${fromLabel}" <${fromAddr}>`,
    to:          recipient_email,
    subject,
    text:        response_text || stripHtml(response_body_html),
    html:        response_body_html || undefined,
    attachments,
  });

  // Update delivery metadata on the response record
  if (job.response_id) {
    await pool.execute(
      `UPDATE case_mi_responses SET delivery_metadata = ? WHERE id = ?`,
      [JSON.stringify({ to: recipient_email, subject, attachment_count: attachments.length, sent_at: new Date().toISOString() }), job.response_id]
    ).catch(() => {});
  }

  // Log success to transmission_audit_trail
  await pool.execute(
    `INSERT INTO transmission_audit_trail
       (case_id, user_id, user_name, target_system, payload_summary, status, response_code)
     VALUES (?, ?, ?, 'MI Email', ?, 'Sent', 200)`,
    [job.case_id, enacted_by_user_id || null, enacted_by_email || null,
     `MI response to ${recipient_email} — Case ${case_number || job.case_id}`]
  ).catch(() => {});

  logger.info({ job_id: job.id, case_id: job.case_id, response_id: job.response_id, to: recipient_email }, 'emailWorker: MI email sent');
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function processBatch() {
  if (_running) return;
  _running = true;
  let conn = null;
  try {
    // Claim a batch atomically inside an explicit transaction.
    // FOR UPDATE SKIP LOCKED only holds the row-lock for the duration of the
    // transaction — using pool.execute() (auto-commit) would release it
    // immediately after the SELECT, letting concurrent workers steal the same jobs.
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `SELECT id, case_id, response_id, job_type, payload, attempts, max_attempts
         FROM email_job_queue
        WHERE status = 'pending'
          AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC
        LIMIT ${SAFE_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED`
    );

    if (!rows.length) {
      await conn.rollback();
      conn.release();
      conn = null;
      return;
    }

    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    await conn.execute(
      `UPDATE email_job_queue SET status = 'processing', attempts = attempts + 1 WHERE id IN (${placeholders})`,
      ids
    );

    await conn.commit();
    conn.release();
    conn = null;

    for (const job of rows) {
      try {
        await processJob(job);
        await pool.execute(
          `UPDATE email_job_queue SET status = 'sent', processed_at = NOW(), error_message = NULL WHERE id = ?`,
          [job.id]
        );
      } catch (err) {
        const newAttempts = (job.attempts || 0) + 1;
        const exhausted   = newAttempts >= (job.max_attempts || 3);
        // Exponential back-off: retry after 2^attempt minutes
        const backoffMs   = Math.min(Math.pow(2, newAttempts) * 60 * 1000, 60 * 60 * 1000);
        const nextAt      = new Date(Date.now() + backoffMs).toISOString().slice(0, 19).replace('T', ' ');

        logger.error({ job_id: job.id, attempt: newAttempts, err: err.message }, 'emailWorker: job failed');

        await pool.execute(
          `UPDATE email_job_queue
              SET status        = ?,
                  error_message = ?,
                  scheduled_at  = ?,
                  processed_at  = IF(? = 1, NOW(), processed_at)
            WHERE id = ?`,
          [exhausted ? 'failed' : 'pending', String(err.message || err).slice(0, 1000), exhausted ? nextAt : nextAt, exhausted ? 1 : 0, job.id]
        ).catch(() => {});

        if (exhausted && job.case_id) {
          // Log permanent failure to transmission_audit_trail
          await pool.execute(
            `INSERT INTO transmission_audit_trail
               (case_id, target_system, payload_summary, status, response_code)
             VALUES (?, 'MI Email', ?, 'Failed', 500)`,
            [job.case_id, `Email job ${job.id} exhausted after ${newAttempts} attempts: ${String(err.message).slice(0, 200)}`]
          ).catch(() => {});
        }
      }
    }
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
      conn.release();
      conn = null;
    }
    logger.error({ err: err.message }, 'emailWorker: batch poll error');
  } finally {
    _running = false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

function startEmailWorker() {
  if (_timer) return;
  _timer = setInterval(processBatch, POLL_INTERVAL_MS);
  // Run immediately on startup to clear any pending jobs from a previous restart
  setImmediate(processBatch);
  logger.info({ poll_interval_ms: POLL_INTERVAL_MS, batch_size: SAFE_BATCH_SIZE }, 'emailWorker started');
}

function stopEmailWorker() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  logger.info('emailWorker stopped');
}

/**
 * enqueueMiEmail(jobData) — called by cases.js SENT transition
 * Writes a job row to email_job_queue and returns immediately.
 *
 * jobData shape:
 *   { orgId, caseId, responseId, caseNumber,
 *     recipientEmail, recipientName, responseText, responseBodyHtml, responseSubject,
 *     selectedDocuments, smtpAccount, enactedByUserId, enactedByEmail }
 */
async function enqueueMiEmail(jobData) {
  const {
    orgId, caseId, responseId, caseNumber,
    recipientEmail, recipientName, responseText, responseBodyHtml, responseSubject,
    selectedDocuments, smtpAccount,
    enactedByUserId, enactedByEmail,
  } = jobData;

  if (!smtpAccount || !recipientEmail) {
    logger.warn({ caseId, responseId }, 'emailWorker.enqueueMiEmail: no SMTP account or recipient — skipping queue');
    return null;
  }

  const payload = {
    response_text:      responseText,
    response_body_html: responseBodyHtml,
    response_subject:   responseSubject,
    recipient_email:    recipientEmail,
    recipient_name:     recipientName,
    selected_documents: JSON.stringify(selectedDocuments || []),
    case_number:        caseNumber,
    smtp_host:          smtpAccount.smtp_host,
    smtp_port:          smtpAccount.smtp_port,
    smtp_encryption:    smtpAccount.smtp_encryption,
    smtp_username:      smtpAccount.smtp_username,
    smtp_password:      smtpAccount.smtp_password,
    display_name:       smtpAccount.display_name || smtpAccount.account_name,
    from_email:         smtpAccount.from_email || smtpAccount.smtp_username,
    enacted_by_user_id: enactedByUserId,
    enacted_by_email:   enactedByEmail,
  };

  const [result] = await pool.execute(
    `INSERT INTO email_job_queue (org_id, case_id, response_id, job_type, payload)
     VALUES (?, ?, ?, 'mi_response', ?)`,
    [orgId || null, caseId, responseId, JSON.stringify(payload)]
  );

  logger.info({ job_id: result.insertId, case_id: caseId, response_id: responseId, to: recipientEmail }, 'emailWorker: MI email job enqueued');
  return result.insertId;
}

module.exports = { startEmailWorker, stopEmailWorker, enqueueMiEmail };
