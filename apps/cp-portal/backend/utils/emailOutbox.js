'use strict';

/**
 * emailOutbox.js — durable transactional email (CPPM-36).
 *
 * Replaces the in-memory job queue for customer-facing email. Each message is
 * written to cp_email_outbox first, then sent. A restart cannot lose it, the
 * scheduler retries it with backoff, and after the last attempt it is marked
 * 'failed' — visible to an administrator and resendable — instead of vanishing
 * into a log line.
 */

const { pool } = require('../database/db');
const { sendEmail } = require('./mailer');
const log = require('./logger');

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 15, 60];   // wait after attempts 1..4

// Record an email and try it straight away. Never throws — the caller's
// request has already succeeded and must not fail because mail is down.
// sensitive: the body carries a live sign-in or reset link. Its content is wiped
// once the message is sent or has finally failed, so the outbox never becomes a
// store of usable tokens; the person simply requests a new link.
async function queueEmail(clientId, { to, subject, html, text, attachments }, { kind, relatedType = null, relatedId = null, sensitive = false } = {}) {
  try {
    const [r] = await pool.execute(
      `INSERT INTO cp_email_outbox (client_id, kind, to_email, subject, html, text_body, attachments_json, related_type, related_id, is_sensitive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clientId, kind, to, subject, html || null, text || null,
       attachments ? JSON.stringify(attachments) : null, relatedType, relatedId, sensitive ? 1 : 0]
    );
    attemptSend(r.insertId).catch(() => {});
    return r.insertId;
  } catch (err) {
    log.error('email.outbox.record_failed', { err, kind, clientId });
    return null;
  }
}

// One delivery attempt. Outcome is always written back to the row.
async function attemptSend(id) {
  const [[row]] = await pool.execute(`SELECT * FROM cp_email_outbox WHERE id = ? AND status = 'pending'`, [id]);
  if (!row) return;
  try {
    await sendEmail(row.client_id, {
      to: row.to_email,
      subject: row.subject,
      html: row.html || undefined,
      text: row.text_body || undefined,
      attachments: row.attachments_json ? JSON.parse(row.attachments_json) : undefined,
    });
    await pool.execute(
      `UPDATE cp_email_outbox SET status='sent', attempts=attempts+1, sent_at=UTC_TIMESTAMP(), last_error=NULL WHERE id=?`, [id]);
    if (row.is_sensitive) await wipeBody(id);
  } catch (err) {
    const attempts = row.attempts + 1;
    const finalAttempt = attempts >= MAX_ATTEMPTS;
    const waitMin = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1];
    await pool.execute(
      `UPDATE cp_email_outbox
          SET attempts = ?, last_error = ?, status = ?,
              next_attempt_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
        WHERE id = ?`,
      [attempts, String(err.message || err).slice(0, 1000), finalAttempt ? 'failed' : 'pending', waitMin, id]);
    if (finalAttempt && row.is_sensitive) await wipeBody(id);
    log[finalAttempt ? 'error' : 'warn'](finalAttempt ? 'email.outbox.failed' : 'email.outbox.retry', { id, kind: row.kind, attempts });
  }
}

async function wipeBody(id) {
  await pool.execute(`UPDATE cp_email_outbox SET html=NULL, text_body=NULL, attachments_json=NULL WHERE id=?`, [id]);
}

// Called by the scheduler: send everything that is due.
async function retryDueEmails() {
  const [due] = await pool.execute(
    `SELECT id FROM cp_email_outbox WHERE status='pending' AND next_attempt_at <= UTC_TIMESTAMP() ORDER BY id LIMIT 50`);
  for (const { id } of due) await attemptSend(id);
  return due.length;
}

// Admin: put a failed email back in the queue and try it now.
async function resendEmail(clientId, id) {
  // A wiped sensitive email cannot be resent — the person requests a fresh link.
  const [r] = await pool.execute(
    `UPDATE cp_email_outbox SET status='pending', attempts=0, next_attempt_at=UTC_TIMESTAMP()
      WHERE id = ? AND client_id = ? AND status = 'failed' AND is_sensitive = 0`, [id, clientId]);
  if (!r.affectedRows) return false;
  await attemptSend(id);
  return true;
}

module.exports = { queueEmail, attemptSend, retryDueEmails, resendEmail, MAX_ATTEMPTS };
