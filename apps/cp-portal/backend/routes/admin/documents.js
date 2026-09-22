/**
 * Admin Documents — /api/admin/documents
 * F-04: Medical document library — upload, manage, categories
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');

// S4-8: Approval workflow transitions for documents
const DOC_TRANSITIONS = {
  draft:     ['review'],
  review:    ['approved', 'draft'],
  approved:  ['published', 'scheduled', 'draft'],
  published: ['archived'],
  scheduled: ['published', 'archived'],
  archived:  ['draft'],
};
const PUBLISH_ROLES = ['superadmin', 'admin'];
const APPROVE_ROLES = ['superadmin', 'admin', 'reviewer'];
const SUBMIT_ROLES  = ['superadmin', 'admin', 'content_manager'];
const DOC_STATUS_ROLES = {
  review:    SUBMIT_ROLES,
  approved:  APPROVE_ROLES,
  published: PUBLISH_ROLES,
  scheduled: PUBLISH_ROLES,
  archived:  PUBLISH_ROLES,
  draft:     APPROVE_ROLES,
};

// CPPM-31: how long an approval stands before the document must be looked at
// again, and how far ahead the screen warns. Both are placeholders — the review
// period is Vasu's (CCO) call, not engineering's.
const DEFAULT_REVIEW_MONTHS = 12;
const REVIEW_WARNING_DAYS   = 30;

const { audit } = require('../../utils/audit');
const { notifyPortalUsers } = require('../../utils/notify');
const { sendEmail } = require('../../utils/mailer');
const { autoTranslate } = require('../../utils/translator');
const { validateContent, inspectDangerousContent } = require('../../utils/fileValidation');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const log = require('../../utils/logger');

// SEC-03: only allow safe document MIME types
const ALLOWED_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // SEC-04: store documents under private/ so direct URL access is blocked by server.js
    const dir = path.join(__dirname, '../../uploads/private/docs', req.params.clientId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PDF and DOCX files are allowed.'));
  },
});

// CPPM-31: freeze the certified facts of the version being retired or replaced,
// so a superseded version stays readable after the live document has moved on.
// A document that was never approved has nothing certified to keep, so nothing
// is written. This deliberately does not swallow its errors: a version history
// that silently loses a row is worse than a request that fails loudly.
async function recordSupersededVersion(doc, admin, reason) {
  if (!doc || !doc.approved_at) return false;
  await pool.execute(`
    INSERT INTO cp_document_versions
      (document_id, client_id, version, title, file_path, file_name, status,
       approved_by, approved_by_name, approved_at, review_due_at, expires_at,
       superseded_by_name, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [doc.id, doc.client_id, doc.version || null, doc.title, doc.file_path || null,
      doc.file_name || null, doc.status, doc.approved_by || null, doc.approved_by_name || null,
      doc.approved_at, doc.review_due_at || null, doc.expires_at || null,
      admin?.name || 'unknown', reason]);
  return true;
}

// ── CATEGORIES ────────────────────────────────────────────────

// GET /api/admin/documents/:clientId/categories
router.get('/:clientId/categories', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_document_categories WHERE client_id = ? ORDER BY sort_order ASC', [req.params.clientId]);
    res.json({ categories: rows });
  } catch (err) {
    log.error('admin.documents.error', { err, route: 'GET /:clientId/categories', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/documents/:clientId/categories
router.post('/:clientId/categories', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    try {
      const [result] = await pool.execute('INSERT INTO cp_document_categories (client_id, name, sort_order) VALUES (?, ?, ?)', [req.params.clientId, name.trim(), sort_order || 0]);
      const [[category]] = await pool.execute('SELECT * FROM cp_document_categories WHERE id = ?', [result.insertId]);
      await audit(req.admin, req.params.clientId, 'CREATE', 'document_category', result.insertId, { name: name.trim() });
      res.json({ category });
    } catch {
      res.status(409).json({ error: 'Category already exists.' });
    }
  } catch (err) {
    log.error('admin.documents.error', { err, route: 'POST /:clientId/categories', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/documents/:clientId/categories/:catId
router.put('/:clientId/categories/:catId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    const fields = [], values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
    values.push(req.params.catId, req.params.clientId);
    await pool.execute(`UPDATE cp_document_categories SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`, values);
    await audit(req.admin, req.params.clientId, 'UPDATE', 'document_category', Number(req.params.catId), { fields: Object.keys(req.body) });
    res.json({ ok: true });
  } catch (err) {
    log.error('admin.documents.error', { err, route: 'PUT /:clientId/categories/:catId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/documents/:clientId/categories/:catId
router.delete('/:clientId/categories/:catId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    await pool.execute('DELETE FROM cp_document_categories WHERE id = ? AND client_id = ?', [req.params.catId, req.params.clientId]);
    await audit(req.admin, req.params.clientId, 'DELETE', 'document_category', Number(req.params.catId), {});
    res.json({ ok: true });
  } catch (err) {
    log.error('admin.documents.error', { err, route: 'DELETE /:clientId/categories/:catId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── EXPIRY ALERTS ──────────────────────────────────────────────

// GET /api/admin/documents/:clientId/expiring — docs expiring within 30 days or already expired
router.get('/:clientId/expiring', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT id, title, expires_at, status, category
      FROM cp_documents
      WHERE client_id = ? AND is_active = 1
        AND expires_at IS NOT NULL
        AND DATE(expires_at) <= DATE(DATE_ADD(NOW(), INTERVAL 30 DAY))
      ORDER BY expires_at ASC
    `, [req.params.clientId]);
    res.json({ expiring: rows });
  } catch (err) {
    log.error('admin.documents.error', { err, route: 'GET /:clientId/expiring', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/documents/:clientId/review-due — CPPM-31: approved documents
// whose next review falls within 30 days, or is already past. Same shape as
// /expiring above so the screen can show both warnings the same way.
router.get('/:clientId/review-due', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT id, title, status, category, approved_by_name, approved_at, review_due_at
      FROM cp_documents
      WHERE client_id = ? AND is_active = 1
        AND retired_at IS NULL
        AND review_due_at IS NOT NULL
        AND DATE(review_due_at) <= DATE(DATE_ADD(NOW(), INTERVAL ${REVIEW_WARNING_DAYS} DAY))
      ORDER BY review_due_at ASC
    `, [req.params.clientId]);
    res.json({ reviewDue: rows });
  } catch (err) {
    log.error('admin.documents.error', { err, route: 'GET /:clientId/review-due', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/documents/:clientId/expiry-alerts/send — email alert to client admins
router.post('/:clientId/expiry-alerts/send', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { clientId } = req.params;

    const [expiring] = await pool.execute(`
      SELECT id, title, expires_at, status
      FROM cp_documents
      WHERE client_id = ? AND is_active = 1
        AND expires_at IS NOT NULL
        AND DATE(expires_at) <= DATE(DATE_ADD(NOW(), INTERVAL 30 DAY))
      ORDER BY expires_at ASC
    `, [clientId]);

    if (expiring.length === 0) return res.json({ message: 'No expiring documents found. No email sent.' });

    // Find all active admins scoped to this client (or superadmins if none)
    let [admins] = await pool.execute(`SELECT email, name FROM cp_admin_users WHERE client_id = ? AND is_active = 1`, [clientId]);
    if (admins.length === 0) {
      [admins] = await pool.execute(`SELECT email, name FROM cp_admin_users WHERE role = 'superadmin' AND is_active = 1`);
    }
    if (admins.length === 0) return res.status(400).json({ error: 'No admin email addresses found for this client.' });

    const today = new Date().toISOString().slice(0, 10);
    const rows = expiring.map(d => {
      const isExpired = d.expires_at.slice(0, 10) < today;
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB">${d.title}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB">${d.expires_at.slice(0, 10)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;color:${isExpired ? '#DC2626' : '#D97706'};font-weight:600">${isExpired ? 'EXPIRED' : 'Expiring Soon'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB">${d.status}</td>
      </tr>`;
    }).join('');

    const html = `
      <h2 style="font-family:sans-serif;color:#1A1A2E">Document Expiry Alert</h2>
      <p style="font-family:sans-serif;color:#374151">The following documents require your attention:</p>
      <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
        <thead><tr style="background:#F3F4F6">
          <th style="padding:8px 12px;text-align:left">Title</th>
          <th style="padding:8px 12px;text-align:left">Expiry Date</th>
          <th style="padding:8px 12px;text-align:left">Status</th>
          <th style="padding:8px 12px;text-align:left">Workflow</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-family:sans-serif;color:#6B7280;font-size:12px;margin-top:24px">Please log in to the CP Portal Admin Console to update these documents.</p>
    `;

    let sent = 0;
    for (const admin of admins) {
      try {
        await sendEmail(Number(clientId), { to: admin.email, subject: `Document Expiry Alert — ${expiring.length} document(s) require attention`, html });
        sent++;
      } catch { /* skip failed individual sends */ }
    }

    await audit(req.admin, clientId, 'EXPIRY_ALERT_SENT', 'document', null, { count: expiring.length, recipients: sent });
    if (sent === 0) return res.status(502).json({ error: 'Email config not active or send failed. Check Email Settings.' });
    res.json({ message: `Alert sent to ${sent} admin(s) for ${expiring.length} document(s).` });
  } catch (err) {
    log.error('admin.documents.error', { err, route: 'POST /:clientId/expiry-alerts/send', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/documents/:clientId/bulk — bulk action on multiple documents
router.post('/:clientId/bulk', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { ids, action } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required.' });
    if (!['publish', 'archive', 'delete'].includes(action)) return res.status(400).json({ error: 'action must be publish, archive, or delete.' });
    if (!PUBLISH_ROLES.includes(req.admin.role)) return res.status(403).json({ error: 'Only admins can perform bulk actions.' });

    const placeholders = ids.map(() => '?').join(',');
    const [selected] = await pool.execute(
      `SELECT * FROM cp_documents WHERE id IN (${placeholders}) AND client_id=?`,
      [...ids, req.params.clientId]
    );

    if (action === 'publish') {
      // CPPM-31: the single-document route refuses an unapproved publish, and so
      // must this one — otherwise ticking the boxes is the way around the control.
      // The whole batch is refused rather than part of it, so nobody is left
      // believing all the selected documents went live.
      const unapproved = selected.filter(d => !d.approved_at);
      if (unapproved.length > 0) {
        return res.status(400).json({
          error: `Nothing was published. ${unapproved.length} of ${selected.length} selected document(s) have not been approved: ${unapproved.map(d => d.title).join(', ')}.`,
        });
      }
      await pool.execute(`UPDATE cp_documents SET status='published', retired_at=NULL, updated_at=NOW() WHERE id IN (${placeholders}) AND client_id=?`, [...ids, req.params.clientId]);
    } else if (action === 'archive') {
      // Retiring a certified document keeps a copy of what was certified.
      for (const doc of selected) await recordSupersededVersion(doc, req.admin, 'retired');
      await pool.execute(`UPDATE cp_documents SET status='archived', retired_at=NOW(), updated_at=NOW() WHERE id IN (${placeholders}) AND client_id=?`, [...ids, req.params.clientId]);
    } else {
      // Same as the single delete: leaving the library retires the document, and
      // what was certified is kept first.
      for (const doc of selected) await recordSupersededVersion(doc, req.admin, 'retired');
      await pool.execute(`UPDATE cp_documents SET is_active=0, retired_at=NOW(), updated_at=NOW() WHERE id IN (${placeholders}) AND client_id=?`, [...ids, req.params.clientId]);
    }
    await audit(req.admin, req.params.clientId, `BULK_${action.toUpperCase()}`, 'document', null, { ids });
    res.json({ ok: true, affected: ids.length });
  } catch (err) {
    log.error('admin.documents.error', { err, route: 'POST /:clientId/bulk', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── DOCUMENTS ─────────────────────────────────────────────────

// GET /api/admin/documents/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_documents WHERE client_id = ? ORDER BY created_at DESC', [req.params.clientId]);
    res.json({ documents: rows });
  } catch (err) {
    log.error('admin.documents.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/documents/:clientId/:docId/versions — CPPM-31: the superseded
// versions of one document, newest first, exactly as they were certified.
router.get('/:clientId/:docId/versions', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM cp_document_versions WHERE document_id = ? AND client_id = ? ORDER BY id DESC',
      [req.params.docId, req.params.clientId]
    );
    res.json({ versions: rows });
  } catch (err) {
    log.error('admin.documents.error', { err, route: 'GET /:clientId/:docId/versions', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/documents/:clientId — upload
router.post('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'File is required.' });

    // SEC: validate real file content (magic bytes), not the spoofable MIME header.
    const checked = validateContent(req.file.path, req.file.mimetype, ALLOWED_MIMES);
    if (checked.ok !== true) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      return res.status(400).json({ error: 'File content is not a valid PDF or Office document.' });
    }
    // CPPM-12: this document is published to every doctor on the portal, so refuse
    // macros, PDF scripts and embedded programs even from an administrator.
    const danger = inspectDangerousContent(req.file.path, checked.signature);
    if (!danger.ok) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      log.warn('admin.documents.upload_blocked', { client_id: req.params.clientId, reason: danger.reason, file: req.file.originalname });
      return res.status(400).json({ error: `This file was not accepted because ${danger.reason}.` });
    }

    const { title, category, doc_type, visible_to, source, status, version, expires_at } = req.body;
    if (!title) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'title is required.' });
    }

    // S4-8: content_manager can only upload as draft or review
    if (!SUBMIT_ROLES.includes(req.admin.role)) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Insufficient permissions to upload documents.' });
    }
    const docStatus = status || 'draft';
    if (!PUBLISH_ROLES.includes(req.admin.role) && !['draft', 'review'].includes(docStatus)) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: `Your role cannot upload documents with status '${docStatus}'.` });
    }
    // CPPM-31: a brand new file has been approved by nobody, so it cannot start
    // life on the portal. It has to be approved first, by a named person.
    if (['published', 'scheduled'].includes(docStatus)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'A document must be approved before it can be published.' });
    }

    try {
      const visible_to_json = visible_to ? JSON.stringify(typeof visible_to === 'string' ? JSON.parse(visible_to) : visible_to) : '[]';
      const filePath = `/uploads/private/docs/${req.params.clientId}/${req.file.filename}`;

      // CPPM-31: an upload that arrives already approved records who approved it
      // and when it is next due for review, exactly as the approve action does.
      const approving = docStatus === 'approved';

      const [result] = await pool.execute(`
        INSERT INTO cp_documents (client_id, title, category, doc_type, file_path, file_name, file_size, mime_type, visible_to_json, source, status, version, expires_at, approved_by, approved_by_name, approved_at, review_due_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ${approving ? 'NOW()' : 'NULL'},
                ${approving ? `DATE_ADD(NOW(), INTERVAL ${DEFAULT_REVIEW_MONTHS} MONTH)` : 'NULL'})
      `, [req.params.clientId, title, category || null, doc_type || 'other', filePath, req.file.originalname, req.file.size, req.file.mimetype, visible_to_json, source || 'manual', docStatus, version || null, expires_at || null, approving ? (req.admin.adminId || null) : null, approving ? (req.admin.name || null) : null]);

      const [[doc]] = await pool.execute('SELECT * FROM cp_documents WHERE id = ?', [result.insertId]);
      await audit(req.admin, req.params.clientId, 'UPLOAD', 'document', doc.id, { title: doc.title });
      if (approving) await audit(req.admin, req.params.clientId, 'APPROVE', 'document', doc.id, { title: doc.title, version: doc.version, review_due_at: doc.review_due_at });
      if (docStatus === 'published') notifyPortalUsers(req.params.clientId, 'document', title, doc.id);
      autoTranslate(req.params.clientId, 'cp_documents', doc.id, { title }).catch(() => {});
      res.json({ document: doc });
    } catch (e) {
      log.error('admin.documents.error', { err: e, route: 'POST /:clientId', path: req.path, request_id: req.requestId || null });
      res.status(500).json({ error: 'Server error.' });
    }
  });
});

// PUT /api/admin/documents/:clientId/:docId — update metadata (no file re-upload)
router.put('/:clientId/:docId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { title, category, doc_type, visible_to, source, is_active, status, expires_at, version, publish_at, review_due_at } = req.body;
    const fields = [], values = [];
    let current = null;        // the row as it stands before this update
    let lifecycleAction = null; // APPROVE | PUBLISH | RETIRE, audited below

    // S4-8: validate status transition + role permission
    if (status !== undefined) {
      [[current]] = await pool.execute('SELECT * FROM cp_documents WHERE id = ? AND client_id = ?', [req.params.docId, req.params.clientId]);
      if (!current) return res.status(404).json({ error: 'Document not found.' });
      if (current.status !== status) {
        const allowed = DOC_TRANSITIONS[current.status] || [];
        if (!allowed.includes(status)) {
          return res.status(400).json({ error: `Invalid transition: ${current.status} → ${status}.` });
        }
        const requiredRoles = DOC_STATUS_ROLES[status] || PUBLISH_ROLES;
        if (!requiredRoles.includes(req.admin.role)) {
          return res.status(403).json({ error: `Your role cannot set status to '${status}'.` });
        }

        // CPPM-31: the certified lifecycle.
        if (status === 'published' || status === 'scheduled') {
          if (!current.approved_at) {
            return res.status(400).json({ error: 'A document must be approved before it can be published.' });
          }
          lifecycleAction = 'PUBLISH';
          fields.push('retired_at = NULL');
        } else if (status === 'approved') {
          // A fresh approval replaces any earlier one, so the version it
          // supersedes is written to the history before it is overwritten.
          await recordSupersededVersion(current, req.admin, 'replaced');
          lifecycleAction = 'APPROVE';
          fields.push('approved_by = ?');      values.push(req.admin.adminId || null);
          fields.push('approved_by_name = ?'); values.push(req.admin.name || null);
          fields.push('approved_at = NOW()');
          fields.push(`review_due_at = COALESCE(?, DATE_ADD(NOW(), INTERVAL ${DEFAULT_REVIEW_MONTHS} MONTH))`);
          values.push(review_due_at || null);
          fields.push('retired_at = NULL');
        } else if (status === 'archived') {
          await recordSupersededVersion(current, req.admin, 'retired');
          lifecycleAction = 'RETIRE';
          fields.push('retired_at = NOW()');
        }
      }
      fields.push('status = ?'); values.push(status);
    }

    // CPPM-31 (Rohith and Vasu, 23 Sep 2026): an approved document that is edited
    // must become a new version and be approved again. Otherwise the approval
    // stamp — a named person, dated — would silently certify wording they never
    // saw. Housekeeping fields (active flag, publish date, review date) are not
    // certified content and do not unpick an approval.
    const CERTIFIED_FIELDS = { title, category, doc_type, version, expires_at,
      visible_to: visible_to === undefined ? undefined : JSON.stringify(visible_to) };
    if (current === null && Object.values(CERTIFIED_FIELDS).some(v => v !== undefined)) {
      [[current]] = await pool.execute('SELECT * FROM cp_documents WHERE id = ? AND client_id = ?', [req.params.docId, req.params.clientId]);
      if (!current) return res.status(404).json({ error: 'Document not found.' });
    }
    let requiresReapproval = false;
    if (current?.approved_at && status !== 'approved') {
      const changed = Object.entries(CERTIFIED_FIELDS).filter(([key, value]) => {
        if (value === undefined) return false;
        const before = key === 'visible_to' ? (current.visible_to_json || null)
          : key === 'expires_at' ? (current.expires_at ? new Date(current.expires_at).toISOString().slice(0, 10) : null)
          : (current[key] ?? null);
        const after = key === 'expires_at' ? (value ? String(value).slice(0, 10) : null) : (value ?? null);
        return String(before ?? '') !== String(after ?? '');
      }).map(([key]) => key);
      if (changed.length) {
        requiresReapproval = true;
        // Keep what was certified before, then take the approval off this row.
        await recordSupersededVersion(current, req.admin, 'edited');
        fields.push('approved_by = NULL', 'approved_by_name = NULL', 'approved_at = NULL', 'review_due_at = NULL');
        if (status === undefined) { fields.push('status = ?'); values.push('draft'); }
        await audit(req.admin, req.params.clientId, 'DOCUMENT_REOPENED', 'document', req.params.docId, { changed });
      }
    }

    if (title !== undefined)      { fields.push('title = ?');           values.push(title); }
    if (category !== undefined)   { fields.push('category = ?');        values.push(category); }
    if (doc_type !== undefined)   { fields.push('doc_type = ?');        values.push(doc_type); }
    if (visible_to !== undefined) { fields.push('visible_to_json = ?'); values.push(JSON.stringify(visible_to)); }
    if (source !== undefined)     { fields.push('source = ?');          values.push(source); }
    if (is_active !== undefined)  { fields.push('is_active = ?');       values.push(is_active ? 1 : 0); }
    if (expires_at !== undefined)  { fields.push('expires_at = ?');      values.push(expires_at || null); }
    if (version !== undefined)     { fields.push('version = ?');         values.push(version || null); }
    if (publish_at !== undefined)  { fields.push('publish_at = ?');      values.push(publish_at || null); }
    // CPPM-31: an approval sets the review date itself, so only take it from the
    // body when this request is not an approval.
    if (review_due_at !== undefined && lifecycleAction !== 'APPROVE') { fields.push('review_due_at = ?'); values.push(review_due_at || null); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
    fields.push('updated_at = NOW()');
    values.push(req.params.docId, req.params.clientId);
    await pool.execute(`UPDATE cp_documents SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`, values);
    await audit(req.admin, req.params.clientId, 'UPDATE', 'document', req.params.docId, { fields: Object.keys(req.body) });
    // CPPM-31: the lifecycle step gets its own audit entry, so approve, publish
    // and retire are findable in the trail without reading every UPDATE.
    if (lifecycleAction) {
      await audit(req.admin, req.params.clientId, lifecycleAction, 'document', req.params.docId, {
        title: current.title, version: current.version, from: current.status, to: status,
      });
    }
    if (req.body.title) autoTranslate(req.params.clientId, 'cp_documents', req.params.docId, { title: req.body.title }).catch(() => {});
    res.json({
      ok: true,
      requires_reapproval: requiresReapproval,
      ...(requiresReapproval ? { message: 'Saved. This document was approved, so the change created a new version — it must be approved again before it can be published.' } : {}),
    });
  } catch (err) {
    log.error('admin.documents.error', { err, route: 'PUT /:clientId/:docId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/documents/:clientId/:docId — soft delete (sets is_active = 0)
router.delete('/:clientId/:docId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    // CPPM-31: taking a certified document out of the library retires it, and
    // what was certified is kept in the version history first.
    const [[current]] = await pool.execute('SELECT * FROM cp_documents WHERE id = ? AND client_id = ?', [req.params.docId, req.params.clientId]);
    await recordSupersededVersion(current, req.admin, 'retired');
    await pool.execute("UPDATE cp_documents SET is_active = 0, retired_at = NOW(), updated_at = NOW() WHERE id = ? AND client_id = ?", [req.params.docId, req.params.clientId]);
    await audit(req.admin, req.params.clientId, 'DELETE', 'document', req.params.docId, {});
    if (current?.approved_at) await audit(req.admin, req.params.clientId, 'RETIRE', 'document', req.params.docId, { title: current.title, version: current.version });
    res.json({ ok: true });
  } catch (err) {
    log.error('admin.documents.error', { err, route: 'DELETE /:clientId/:docId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
