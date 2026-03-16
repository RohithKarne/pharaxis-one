/**
 * routes/inbox.js — Inbox Route
 * Returns real IMAP-ingested inquiries from DB only. No seed/dummy data.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../database/db');

function audit(userId, userName, action, entity, entityId, details) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, userName, action, entity, entityId, JSON.stringify(details || {}));
  } catch (_) {
    // audit is best-effort; do not block inbox updates
  }
}

// GET /api/inbox — returns persisted inquiries from DB (real emails only)
router.get('/', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT id, sender, recipient, subject, body, received_at, status,
           is_locked, locked_by, color, attachments_count, source_tag, is_read,
           assigned_to, priority, due_date
    FROM inquiries
    ORDER BY datetime(received_at) DESC, created_at DESC
    LIMIT 500
  `).all();

  const inquiries = rows.map(r => ({
    id: r.id,
    sender: r.sender,
    recipient: r.recipient,
    subject: r.subject,
    body: r.body,
    received_at: r.received_at,
    status: r.status || 'inbox',
    is_locked: !!r.is_locked,
    locked_by: r.locked_by || null,
    color: r.color || null,
    attachments_count: r.attachments_count || 0,
    source_tag: r.source_tag || 'Email',
    is_read: !!r.is_read,
    assigned_to: r.assigned_to || null,
    priority: r.priority || null,
    due_date: r.due_date || null,
  }));

  res.json({ source: 'db', inquiries, total: inquiries.length });
});

// GET /api/inbox/users — list active users for assign dropdown (F1)
router.get('/users', authenticate, (_req, res) => {
  const rows = db.prepare(`SELECT id, name, email, role FROM users WHERE is_active = 1 ORDER BY name ASC`).all();
  res.json({ users: rows });
});

// GET /api/inbox/templates — list active reply templates (F3)
router.get('/templates', authenticate, (_req, res) => {
  const rows = db.prepare(`SELECT id, name, subject, body FROM reply_templates WHERE is_active = 1 ORDER BY name ASC`).all();
  res.json({ templates: rows });
});

// POST /api/inbox/templates — create reply template
router.post('/templates', authenticate, (req, res) => {
  const { name, subject, body } = req.body;
  if (!name || !body) return res.status(400).json({ error: 'name and body are required.' });
  const info = db.prepare(`INSERT INTO reply_templates (name, subject, body, created_by) VALUES (?, ?, ?, ?)`)
    .run(name, subject || null, body, req.user?.userId || null);
  res.json({ id: info.lastInsertRowid, message: 'Template created.' });
});

// PATCH /api/inbox/templates/:tid — update reply template
router.patch('/templates/:tid', authenticate, (req, res) => {
  const { tid } = req.params;
  const { name, subject, body, is_active } = req.body;
  const updates = [], params = [];
  if (name !== undefined)      { updates.push('name = ?');      params.push(name); }
  if (subject !== undefined)   { updates.push('subject = ?');   params.push(subject); }
  if (body !== undefined)      { updates.push('body = ?');       params.push(body); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
  updates.push(`updated_at = datetime('now')`);
  params.push(tid);
  db.prepare(`UPDATE reply_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ message: 'Updated.' });
});

// DELETE /api/inbox/templates/:tid — soft-delete reply template
router.delete('/templates/:tid', authenticate, (req, res) => {
  db.prepare(`UPDATE reply_templates SET is_active = 0 WHERE id = ?`).run(req.params.tid);
  res.json({ message: 'Deleted.' });
});

// POST /api/inbox/fetch — trigger immediate IMAP ingest for all active inbound accounts
// Accessible to any authenticated user (not admin-only)
router.post('/fetch', authenticate, async (req, res) => {
  try {
    const { ingestAccount } = require('../services/emailPoller');
    const { logService } = require('../services/serviceLogger');
    const accounts = db.prepare(`
      SELECT * FROM email_accounts
      WHERE is_active = 1 AND direction IN ('Inbound', 'Both')
        AND imap_host IS NOT NULL AND imap_port IS NOT NULL
        AND imap_username IS NOT NULL AND imap_password IS NOT NULL
    `).all();

    let totalIngested = 0;
    for (const account of accounts) {
      const runStartedAt = new Date().toISOString();
      try {
        const sinceDt = account.last_ingest_at
          ? new Date(account.last_ingest_at)
          : new Date(Date.now() - (account.initial_fetch_days || 7) * 24 * 60 * 60 * 1000);
        const n = await ingestAccount(account, sinceDt);
        const runEndedAt = new Date().toISOString();
        db.prepare(`UPDATE email_accounts SET last_ingest_at = ? WHERE id = ?`).run(runEndedAt, account.id);
        totalIngested += n;
        logService({
          source: 'Email Accounts',
          service_type: 'IMAP',
          description: `Manual fetch triggered for "${account.account_name}" — ${n} new email${n !== 1 ? 's' : ''} ingested`,
          status: 'success',
          details: {
            task_name: 'Email Import',
            trigger: 'manual',
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
      } catch (_) {
        // One account failing should not block others
        const runEndedAt = new Date().toISOString();
        logService({
          source: 'Email Accounts',
          service_type: 'IMAP',
          description: `Manual fetch failed for "${account.account_name}"`,
          status: 'failed',
          details: {
            task_name: 'Email Import',
            trigger: 'manual',
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
      }
    }

    res.json({ ingested: totalIngested });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Fetch failed.' });
  }
});

// GET /api/inbox/:id/notes — list internal notes for an inquiry (F5)
router.get('/:id/notes', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT id, user_name, note, created_at FROM inquiry_notes
    WHERE inquiry_id = ? ORDER BY created_at ASC
  `).all(req.params.id);
  res.json({ notes: rows });
});

// POST /api/inbox/:id/notes — add internal note (F5)
router.post('/:id/notes', authenticate, (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  if (!note?.trim()) return res.status(400).json({ error: 'note is required.' });
  const inquiry = db.prepare('SELECT id FROM inquiries WHERE id = ?').get(id);
  if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' });
  const authorRow = req.user?.userId
    ? db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.userId)
    : null;
  const authorName = authorRow?.name || req.user?.email || 'Unknown';
  const createdAt = new Date().toISOString();
  db.prepare(`INSERT INTO inquiry_notes (inquiry_id, user_id, user_name, note, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, req.user?.userId || null, authorName, note.trim(), createdAt);
  audit(req.user?.userId || null, req.user?.email || 'unknown', 'NOTE', 'inquiry', Number(id), { note: note.trim() });
  res.json({ message: 'Note added.', note: { user_name: authorName, note: note.trim(), created_at: createdAt } });
});

// GET /api/inbox/:id/thread — get reply/forward thread for an inquiry (F12)
router.get('/:id/thread', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT id, sender, recipient, subject, body, received_at, status, source_tag
    FROM inquiries WHERE original_inquiry_id = ?
    ORDER BY received_at ASC
  `).all(req.params.id);
  res.json({ thread: rows });
});

// GET /api/inbox/:id/attachments — list attachments for an inquiry
router.get('/:id/attachments', authenticate, (req, res) => {
  const { id } = req.params;
  const rows = db.prepare(`
    SELECT id, filename, mime_type, size_bytes
    FROM inquiry_attachments
    WHERE inquiry_id = ?
    ORDER BY id ASC
  `).all(id);
  res.json({ attachments: rows });
});

// GET /api/inbox/attachments/:aid/download — stream attachment file
router.get('/attachments/:aid/download', authenticate, (req, res) => {
  const { aid } = req.params;
  const row = db.prepare(`SELECT filename, mime_type, storage_path FROM inquiry_attachments WHERE id = ?`).get(aid);
  if (!row) return res.status(404).json({ error: 'Attachment not found.' });
  if (!fs.existsSync(row.storage_path)) return res.status(404).json({ error: 'File not found on server.' });

  res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  fs.createReadStream(row.storage_path).pipe(res);
});

// Helper: resolve the best outbound SMTP account for a given recipient address
function getOutboundAccount(recipientEmail) {
  // Strip display name from RFC-formatted address e.g. "Name" <email@x.com> → email@x.com
  const rawEmail = recipientEmail
    ? (recipientEmail.match(/<([^>]+)>/) || [null, recipientEmail])[1].trim()
    : null;

  // 1. Match by the account that received the email (any direction — SMTP works regardless)
  if (rawEmail) {
    const match = db.prepare(`
      SELECT * FROM email_accounts
      WHERE is_active = 1
        AND smtp_host IS NOT NULL AND smtp_port IS NOT NULL
        AND smtp_username IS NOT NULL AND smtp_password IS NOT NULL
        AND mailbox_email = ?
      LIMIT 1
    `).get(rawEmail);
    if (match) return match;
  }

  // 2. Fall back to the flagged default outbound account
  const def = db.prepare(`
    SELECT * FROM email_accounts
    WHERE is_active = 1
      AND smtp_host IS NOT NULL AND smtp_port IS NOT NULL
      AND smtp_username IS NOT NULL AND smtp_password IS NOT NULL
      AND is_default_outbound = 1
    LIMIT 1
  `).get();
  if (def) return def;

  // 3. Last resort — any active account with SMTP configured
  return db.prepare(`
    SELECT * FROM email_accounts
    WHERE is_active = 1
      AND smtp_host IS NOT NULL AND smtp_port IS NOT NULL
      AND smtp_username IS NOT NULL AND smtp_password IS NOT NULL
    LIMIT 1
  `).get();
}

async function sendViaSmtp(account, { from, to, subject, text }) {
  const nodemailer = require('nodemailer');
  const secure = account.smtp_encryption === 'SSL/TLS';
  const requireTLS = account.smtp_encryption === 'STARTTLS';
  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure,
    requireTLS,
    auth: { user: account.smtp_username, pass: account.smtp_password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
  });
  await transporter.sendMail({ from, to, subject, text });
}

// Helper: insert a sent item into the inquiries table (appears in Sent tab)
function insertSentItem({ from, to, subject, body, sourceTag, originalId }) {
  const sentAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  db.prepare(`
    INSERT INTO inquiries (sender, recipient, subject, body, received_at, status, attachments_count, source_tag, is_locked, locked_by, color, original_inquiry_id)
    VALUES (?, ?, ?, ?, ?, 'outbox', 0, ?, 0, null, null, ?)
  `).run(from, to, subject, body, sentAt, sourceTag, originalId || null);
}

// POST /api/inbox/:id/reply — send reply via SMTP, move inquiry to processed, log to Sent
router.post('/:id/reply', authenticate, async (req, res) => {
  const { id } = req.params;
  const { to, subject, body } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body are required.' });

  const inquiry = db.prepare('SELECT id, recipient FROM inquiries WHERE id = ?').get(id);
  if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' });

  const account = getOutboundAccount(inquiry.recipient);
  if (!account) return res.status(400).json({ error: 'No outbound SMTP account configured.' });

  const fromAddr = account.from_email || account.smtp_username;
  const fromLabel = account.display_name || account.account_name;
  try {
    await sendViaSmtp(account, {
      from: `"${fromLabel}" <${fromAddr}>`,
      to, subject, text: body,
    });
  } catch (err) {
    return res.status(502).json({ error: `Failed to send: ${err.message}` });
  }

  db.prepare(`UPDATE inquiries SET status = 'processed' WHERE id = ?`).run(id);
  insertSentItem({ from: fromAddr, to, subject, body, sourceTag: 'Sent Reply', originalId: Number(id) });
  audit(req.user?.userId || null, req.user?.email || 'unknown', 'REPLY', 'inquiry', Number(id), { to, subject });
  res.json({ message: 'Reply sent. Inquiry moved to Processed.' });
});

// POST /api/inbox/:id/forward — send forward via SMTP (status unchanged), log to Sent
router.post('/:id/forward', authenticate, async (req, res) => {
  const { id } = req.params;
  const { to, subject, body } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body are required.' });

  const inquiry = db.prepare('SELECT id, recipient FROM inquiries WHERE id = ?').get(id);
  if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' });

  const account = getOutboundAccount(inquiry.recipient);
  if (!account) return res.status(400).json({ error: 'No outbound SMTP account configured.' });

  const fromAddr = account.from_email || account.smtp_username;
  const fromLabel = account.display_name || account.account_name;
  try {
    await sendViaSmtp(account, {
      from: `"${fromLabel}" <${fromAddr}>`,
      to, subject, text: body,
    });
  } catch (err) {
    return res.status(502).json({ error: `Failed to send: ${err.message}` });
  }

  insertSentItem({ from: fromAddr, to, subject, body, sourceTag: 'Sent Forward', originalId: Number(id) });
  audit(req.user?.userId || null, req.user?.email || 'unknown', 'FORWARD', 'inquiry', Number(id), { to, subject });
  res.json({ message: 'Email forwarded.' });
});

// PATCH /api/inbox/:id — update status, lock state, or color (DB-backed inquiries only)
router.patch('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const { status, is_locked, locked_by, color, is_read, assigned_to, priority, due_date } = req.body;

  const row = db.prepare('SELECT id, status, is_locked, locked_by, color, is_read, assigned_to, priority, due_date FROM inquiries WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Inquiry not found.' });

  const updates = [];
  const params = [];

  if (status !== undefined)      { updates.push('status = ?');      params.push(status); }
  if (is_locked !== undefined)   { updates.push('is_locked = ?');   params.push(is_locked ? 1 : 0); }
  if (locked_by !== undefined)   { updates.push('locked_by = ?');   params.push(locked_by || null); }
  if (color !== undefined)       { updates.push('color = ?');       params.push(color || null); }
  if (is_read !== undefined)     { updates.push('is_read = ?');     params.push(is_read ? 1 : 0); }
  if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to || null); }
  if (priority !== undefined)    { updates.push('priority = ?');    params.push(priority || null); }
  if (due_date !== undefined)    { updates.push('due_date = ?');    params.push(due_date || null); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  params.push(id);
  db.prepare(`UPDATE inquiries SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const after = {
    status: status !== undefined ? status : row.status,
    is_locked: is_locked !== undefined ? (is_locked ? 1 : 0) : row.is_locked,
    locked_by: locked_by !== undefined ? (locked_by || null) : row.locked_by,
    color: color !== undefined ? (color || null) : row.color,
    assigned_to: assigned_to !== undefined ? (assigned_to || null) : row.assigned_to,
    priority: priority !== undefined ? (priority || null) : row.priority,
    due_date: due_date !== undefined ? (due_date || null) : row.due_date,
  };
  audit(req.user?.userId || null, req.user?.email || 'unknown', 'UPDATE', 'inquiry', Number(id), {
    from: {
      status: row.status,
      is_locked: row.is_locked,
      locked_by: row.locked_by,
      color: row.color,
      assigned_to: row.assigned_to,
      priority: row.priority,
      due_date: row.due_date,
    },
    to: after,
  });
  res.json({ message: 'Updated.' });
});

module.exports = router;
