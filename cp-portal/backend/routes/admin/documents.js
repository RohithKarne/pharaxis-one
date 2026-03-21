/**
 * Admin Documents — /api/admin/documents
 * F-04: Medical document library — upload, manage, categories
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
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
const { audit } = require('../../utils/audit');
const { notifyPortalUsers } = require('../../utils/notify');
const { sendEmail } = require('../../utils/mailer');
const { autoTranslate } = require('../../utils/translator');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

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

// ── CATEGORIES ────────────────────────────────────────────────

// GET /api/admin/documents/:clientId/categories
router.get('/:clientId/categories', authenticateAdmin, requireClientAccess, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_document_categories WHERE client_id = ? ORDER BY sort_order ASC').all(req.params.clientId);
  res.json({ categories: rows });
});

// POST /api/admin/documents/:clientId/categories
router.post('/:clientId/categories', authenticateAdmin, requireClientAccess, (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  try {
    const result = db.prepare('INSERT INTO cp_document_categories (client_id, name, sort_order) VALUES (?, ?, ?)').run(req.params.clientId, name.trim(), sort_order || 0);
    res.json({ category: db.prepare('SELECT * FROM cp_document_categories WHERE id = ?').get(result.lastInsertRowid) });
  } catch {
    res.status(409).json({ error: 'Category already exists.' });
  }
});

// PUT /api/admin/documents/:clientId/categories/:catId
router.put('/:clientId/categories/:catId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { name, sort_order } = req.body;
  const fields = [], values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
  if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  values.push(req.params.catId, req.params.clientId);
  db.prepare(`UPDATE cp_document_categories SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`).run(...values);
  res.json({ ok: true });
});

// DELETE /api/admin/documents/:clientId/categories/:catId
router.delete('/:clientId/categories/:catId', authenticateAdmin, requireClientAccess, (req, res) => {
  db.prepare('DELETE FROM cp_document_categories WHERE id = ? AND client_id = ?').run(req.params.catId, req.params.clientId);
  res.json({ ok: true });
});

// ── EXPIRY ALERTS ──────────────────────────────────────────────

// GET /api/admin/documents/:clientId/expiring — docs expiring within 30 days or already expired
router.get('/:clientId/expiring', authenticateAdmin, requireClientAccess, (req, res) => {
  const rows = db.prepare(`
    SELECT id, title, expires_at, status, category
    FROM cp_documents
    WHERE client_id = ? AND is_active = 1
      AND expires_at IS NOT NULL
      AND DATE(expires_at) <= DATE('now', '+30 days')
    ORDER BY expires_at ASC
  `).all(req.params.clientId)
  res.json({ expiring: rows })
})

// POST /api/admin/documents/:clientId/expiry-alerts/send — email alert to client admins
router.post('/:clientId/expiry-alerts/send', authenticateAdmin, requireClientAccess, async (req, res) => {
  const { clientId } = req.params

  const expiring = db.prepare(`
    SELECT id, title, expires_at, status
    FROM cp_documents
    WHERE client_id = ? AND is_active = 1
      AND expires_at IS NOT NULL
      AND DATE(expires_at) <= DATE('now', '+30 days')
    ORDER BY expires_at ASC
  `).all(clientId)

  if (expiring.length === 0) return res.json({ message: 'No expiring documents found. No email sent.' })

  // Find all active admins scoped to this client (or superadmins if none)
  let admins = db.prepare(`SELECT email, name FROM cp_admin_users WHERE client_id = ? AND is_active = 1`).all(clientId)
  if (admins.length === 0) {
    admins = db.prepare(`SELECT email, name FROM cp_admin_users WHERE role = 'superadmin' AND is_active = 1`).all()
  }
  if (admins.length === 0) return res.status(400).json({ error: 'No admin email addresses found for this client.' })

  const today = new Date().toISOString().slice(0, 10)
  const rows = expiring.map(d => {
    const isExpired = d.expires_at.slice(0, 10) < today
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB">${d.title}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB">${d.expires_at.slice(0, 10)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;color:${isExpired ? '#DC2626' : '#D97706'};font-weight:600">${isExpired ? 'EXPIRED' : 'Expiring Soon'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB">${d.status}</td>
    </tr>`
  }).join('')

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
  `

  let sent = 0
  for (const admin of admins) {
    try {
      await sendEmail(Number(clientId), { to: admin.email, subject: `Document Expiry Alert — ${expiring.length} document(s) require attention`, html })
      sent++
    } catch { /* skip failed individual sends */ }
  }

  audit(req.admin, clientId, 'EXPIRY_ALERT_SENT', 'document', null, { count: expiring.length, recipients: sent })
  if (sent === 0) return res.status(502).json({ error: 'Email config not active or send failed. Check Email Settings.' })
  res.json({ message: `Alert sent to ${sent} admin(s) for ${expiring.length} document(s).` })
})

// POST /api/admin/documents/:clientId/bulk — bulk action on multiple documents
router.post('/:clientId/bulk', authenticateAdmin, requireClientAccess, (req, res) => {
  const { ids, action } = req.body
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required.' })
  if (!['publish', 'archive', 'delete'].includes(action)) return res.status(400).json({ error: 'action must be publish, archive, or delete.' })
  if (!PUBLISH_ROLES.includes(req.admin.role)) return res.status(403).json({ error: 'Only admins can perform bulk actions.' })

  const placeholders = ids.map(() => '?').join(',')
  if (action === 'publish') {
    db.prepare(`UPDATE cp_documents SET status='published', updated_at=datetime('now') WHERE id IN (${placeholders}) AND client_id=?`).run(...ids, req.params.clientId)
  } else if (action === 'archive') {
    db.prepare(`UPDATE cp_documents SET status='archived', updated_at=datetime('now') WHERE id IN (${placeholders}) AND client_id=?`).run(...ids, req.params.clientId)
  } else {
    db.prepare(`UPDATE cp_documents SET is_active=0, updated_at=datetime('now') WHERE id IN (${placeholders}) AND client_id=?`).run(...ids, req.params.clientId)
  }
  audit(req.admin, req.params.clientId, `BULK_${action.toUpperCase()}`, 'document', null, { ids })
  res.json({ ok: true, affected: ids.length })
})

// ── DOCUMENTS ─────────────────────────────────────────────────

// GET /api/admin/documents/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_documents WHERE client_id = ? ORDER BY created_at DESC').all(req.params.clientId);
  res.json({ documents: rows });
});

// POST /api/admin/documents/:clientId — upload
router.post('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'File is required.' });

    // Re-validate MIME server-side (defense in depth)
    if (!ALLOWED_MIMES.includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Only PDF and DOCX files are allowed.' });
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

    const visible_to_json = visible_to ? JSON.stringify(typeof visible_to === 'string' ? JSON.parse(visible_to) : visible_to) : '[]';
    const filePath = `/uploads/private/docs/${req.params.clientId}/${req.file.filename}`;

    const result = db.prepare(`
      INSERT INTO cp_documents (client_id, title, category, doc_type, file_path, file_name, file_size, mime_type, visible_to_json, source, status, version, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.clientId, title, category || null, doc_type || 'other', filePath, req.file.originalname, req.file.size, req.file.mimetype, visible_to_json, source || 'manual', docStatus, version || null, expires_at || null);

    const doc = db.prepare('SELECT * FROM cp_documents WHERE id = ?').get(result.lastInsertRowid);
    audit(req.admin, req.params.clientId, 'UPLOAD', 'document', doc.id, { title: doc.title });
    if (docStatus === 'published') notifyPortalUsers(req.params.clientId, 'document', title, doc.id);
    autoTranslate(req.params.clientId, 'cp_documents', doc.id, { title }).catch(() => {});
    res.json({ document: doc });
  });
});

// PUT /api/admin/documents/:clientId/:docId — update metadata (no file re-upload)
router.put('/:clientId/:docId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { title, category, doc_type, visible_to, source, is_active, status, expires_at, version, publish_at } = req.body;
  const fields = [], values = [];

  // S4-8: validate status transition + role permission
  if (status !== undefined) {
    const current = db.prepare('SELECT status FROM cp_documents WHERE id = ? AND client_id = ?').get(req.params.docId, req.params.clientId);
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
    }
    fields.push('status = ?'); values.push(status);
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
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  fields.push("updated_at = datetime('now')");
  values.push(req.params.docId, req.params.clientId);
  db.prepare(`UPDATE cp_documents SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`).run(...values);
  audit(req.admin, req.params.clientId, 'UPDATE', 'document', req.params.docId, { fields: Object.keys(req.body) });
  if (req.body.title) autoTranslate(req.params.clientId, 'cp_documents', req.params.docId, { title: req.body.title }).catch(() => {});
  res.json({ ok: true });
});

// DELETE /api/admin/documents/:clientId/:docId — soft delete (sets is_active = 0)
router.delete('/:clientId/:docId', authenticateAdmin, requireClientAccess, (req, res) => {
  db.prepare("UPDATE cp_documents SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND client_id = ?").run(req.params.docId, req.params.clientId);
  audit(req.admin, req.params.clientId, 'DELETE', 'document', req.params.docId, {});
  res.json({ ok: true });
});

module.exports = router;
