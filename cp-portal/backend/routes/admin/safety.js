/**
 * Admin Safety Alerts — /api/admin/safety
 * F-13: Safety communications & recall alerts CRUD per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// SEC-03: allow PDF and standard document types for safety attachments
const ALLOWED_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];
const MAX_SIZE = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(__dirname, '../../uploads/safety', req.params.clientId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PDF and document files are allowed as attachments.'));
  },
});

function sanitiseHtml(dirty) {
  // Blocklist-based sanitizer: strips dangerous tags and attributes
  if (!dirty) return '';
  // Strip script/style/iframe/object/embed tags completely (including content)
  let clean = dirty.replace(/<(script|style|iframe|object|embed|form|input|button)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Remove event handler attributes (on*)
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  // Remove javascript: hrefs
  clean = clean.replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, '');
  // Remove data: URIs in src/href
  clean = clean.replace(/(src|href)\s*=\s*["']\s*data:[^"']*["']/gi, '');
  return clean;
}

const VALID_TYPES     = ['dhcp_letter','product_recall','urgent_safety_restriction','field_safety_notice','other'];
const VALID_SEVERITIES = ['critical','high','medium','informational'];

// GET /api/admin/safety/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM cp_safety_alerts WHERE client_id = ?';
  const params = [req.params.clientId];
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY effective_date DESC';
  res.json({ alerts: db.prepare(query).all(...params) });
});

// POST /api/admin/safety/:clientId — create with optional PDF attachment
router.post('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  upload.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const { title, alert_type, severity, product_name, ref_number, body_html, effective_date, target_types, status } = req.body;

    if (!title)     return res.status(400).json({ error: 'title is required.' });
    if (!VALID_TYPES.includes(alert_type))      return res.status(400).json({ error: 'Invalid alert_type.' });
    if (!VALID_SEVERITIES.includes(severity))   return res.status(400).json({ error: 'Invalid severity.' });

    const attachmentPath = req.file ? `/uploads/safety/${req.params.clientId}/${req.file.filename}` : null;
    const attachmentName = req.file ? req.file.originalname : null;

    const result = db.prepare(`
      INSERT INTO cp_safety_alerts
        (client_id, title, alert_type, severity, product_name, ref_number, body_html, effective_date, target_types_json, attachment_path, attachment_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.clientId, title, alert_type, severity,
      product_name || null, ref_number || null,
      sanitiseHtml(body_html),
      effective_date || new Date().toISOString(),
      JSON.stringify(target_types ? (typeof target_types === 'string' ? JSON.parse(target_types) : target_types) : []),
      attachmentPath, attachmentName,
      status || 'active',
    );

    res.json({ alert: db.prepare('SELECT * FROM cp_safety_alerts WHERE id = ?').get(result.lastInsertRowid) });
  });
});

// PUT /api/admin/safety/:clientId/:alertId
router.put('/:clientId/:alertId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { title, alert_type, severity, product_name, ref_number, body_html, effective_date, target_types, status } = req.body;
  const fields = [], values = [];

  if (req.body.alert_type && !VALID_TYPES.includes(req.body.alert_type)) {
    return res.status(400).json({ error: `Invalid alert_type. Must be one of: ${VALID_TYPES.join(', ')}` });
  }
  if (req.body.severity && !VALID_SEVERITIES.includes(req.body.severity)) {
    return res.status(400).json({ error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}` });
  }

  if (title !== undefined)          { fields.push('title = ?');              values.push(title); }
  if (alert_type !== undefined)     { fields.push('alert_type = ?');         values.push(alert_type); }
  if (severity !== undefined)       { fields.push('severity = ?');           values.push(severity); }
  if (product_name !== undefined)   { fields.push('product_name = ?');       values.push(product_name); }
  if (ref_number !== undefined)     { fields.push('ref_number = ?');         values.push(ref_number); }
  if (body_html !== undefined)      { fields.push('body_html = ?');          values.push(sanitiseHtml(body_html)); }
  if (effective_date !== undefined) { fields.push('effective_date = ?');     values.push(effective_date); }
  if (target_types !== undefined)   { fields.push('target_types_json = ?'); values.push(JSON.stringify(target_types)); }
  if (status !== undefined)         { fields.push('status = ?');             values.push(status); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  fields.push("updated_at = datetime('now')");
  values.push(req.params.alertId, req.params.clientId);

  db.prepare(`UPDATE cp_safety_alerts SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`).run(...values);
  res.json({ ok: true });
});

// PATCH /api/admin/safety/:clientId/:alertId/resolve — mark as resolved
router.patch('/:clientId/:alertId/resolve', authenticateAdmin, requireClientAccess, (req, res) => {
  db.prepare("UPDATE cp_safety_alerts SET status = 'resolved', updated_at = datetime('now') WHERE id = ? AND client_id = ?")
    .run(req.params.alertId, req.params.clientId);
  res.json({ ok: true });
});

module.exports = router;
