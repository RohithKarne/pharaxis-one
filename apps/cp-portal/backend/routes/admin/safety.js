/**
 * Admin Safety Alerts — /api/admin/safety
 * F-13: Safety communications & recall alerts CRUD per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const { notifyPortalUsers } = require('../../utils/notify');
const { autoTranslate } = require('../../utils/translator');
const { validateUploads } = require('../../utils/fileValidation');
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
    const dir = path.join(__dirname, '../../uploads/private/safety', req.params.clientId);
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

// CP-28: shared allow-list sanitizer (replaces the bypassable blocklist).
const { sanitizeHtml: sanitiseHtml } = require('../../utils/sanitizeHtml');
const log = require('../../utils/logger');

const VALID_TYPES     = ['dhcp_letter','product_recall','urgent_safety_restriction','field_safety_notice','other'];
const VALID_SEVERITIES = ['critical','high','medium','informational'];

// GET /api/admin/safety/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM cp_safety_alerts WHERE client_id = ?';
    const params = [req.params.clientId];
    if (status) { query += ' AND status = ?'; params.push(status); }
    query += ' ORDER BY effective_date DESC';
    const [alerts] = await pool.execute(query, params);
    res.json({ alerts });
  } catch (err) {
    log.error('admin.safety.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/safety/:clientId — create with optional PDF attachment
router.post('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  upload.single('attachment')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    // SEC: validate real file content (magic bytes), not the spoofable MIME header.
    if (req.file) {
      const failure = validateUploads([req.file], ALLOWED_MIMES);
      if (failure) return res.status(400).json({ error: failure });
    }

    try {
      const { title, alert_type, severity, product_name, ref_number, body_html, effective_date, target_types, status } = req.body;

      if (!title)     return res.status(400).json({ error: 'title is required.' });
      if (!VALID_TYPES.includes(alert_type))      return res.status(400).json({ error: 'Invalid alert_type.' });
      if (!VALID_SEVERITIES.includes(severity))   return res.status(400).json({ error: 'Invalid severity.' });

      const attachmentPath = req.file ? `/uploads/private/safety/${req.params.clientId}/${req.file.filename}` : null;
      const attachmentName = req.file ? req.file.originalname : null;

      // target_types arrives as a JSON string on this multipart endpoint — validate it
      // so malformed input returns a clean 400 instead of throwing a 500 mid-INSERT.
      let targetTypes = [];
      if (target_types) {
        if (typeof target_types === 'string') {
          try { targetTypes = JSON.parse(target_types); }
          catch { return res.status(400).json({ error: 'target_types must be a JSON array.' }); }
        } else {
          targetTypes = target_types;
        }
      }
      if (!Array.isArray(targetTypes)) return res.status(400).json({ error: 'target_types must be a JSON array.' });

      const [result] = await pool.execute(`
        INSERT INTO cp_safety_alerts
          (client_id, title, alert_type, severity, product_name, ref_number, body_html, effective_date, target_types_json, attachment_path, attachment_name, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        req.params.clientId, title, alert_type, severity,
        product_name || null, ref_number || null,
        sanitiseHtml(body_html),
        effective_date || new Date().toISOString().replace('T', ' ').substring(0, 19),
        JSON.stringify(targetTypes),
        attachmentPath, attachmentName,
        status || 'active',
      ]);

      await audit(req.admin, req.params.clientId, 'CREATE', 'safety_alert', result.insertId, { title });
      if ((status || 'active') === 'active') notifyPortalUsers(req.params.clientId, 'safety', title, result.insertId);
      autoTranslate(req.params.clientId, 'cp_safety_alerts', result.insertId, { title, body_html: sanitiseHtml(body_html) }).catch(() => {});

      const [[alert]] = await pool.execute('SELECT * FROM cp_safety_alerts WHERE id = ?', [result.insertId]);
      res.json({ alert });
    } catch (e) {
      log.error('admin.safety.error', { err: e, route: 'POST /:clientId', path: req.path, request_id: req.requestId || null });
      res.status(500).json({ error: 'Server error.' });
    }
  });
});

// PUT /api/admin/safety/:clientId/:alertId
router.put('/:clientId/:alertId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { title, alert_type, severity, product_name, ref_number, body_html, effective_date, target_types, status, publish_at } = req.body;
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
    if (publish_at !== undefined)     { fields.push('publish_at = ?');         values.push(publish_at || null); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
    fields.push('updated_at = NOW()');
    values.push(req.params.alertId, req.params.clientId);

    await pool.execute(`UPDATE cp_safety_alerts SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`, values);
    await audit(req.admin, req.params.clientId, 'UPDATE', 'safety_alert', req.params.alertId, { fields: Object.keys(req.body) });
    const transFields = {};
    if (title     !== undefined) transFields.title     = title;
    if (body_html !== undefined) transFields.body_html = sanitiseHtml(body_html);
    if (Object.keys(transFields).length) autoTranslate(req.params.clientId, 'cp_safety_alerts', req.params.alertId, transFields).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    log.error('admin.safety.error', { err, route: 'PUT /:clientId/:alertId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/safety/:clientId/:alertId/resolve — mark as resolved
router.patch('/:clientId/:alertId/resolve', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    await pool.execute("UPDATE cp_safety_alerts SET status = 'resolved', updated_at = NOW() WHERE id = ? AND client_id = ?",
      [req.params.alertId, req.params.clientId]);
    await audit(req.admin, req.params.clientId, 'UPDATE', 'safety_alert', req.params.alertId, { status: 'resolved' });
    res.json({ ok: true });
  } catch (err) {
    log.error('admin.safety.error', { err, route: 'PATCH /:clientId/:alertId/resolve', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
