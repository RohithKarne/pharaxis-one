/**
 * Admin Safety Alerts — /api/admin/safety
 * F-13: Safety communications & recall alerts CRUD per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit, changesBetween } = require('../../utils/audit');
const { notifyPortalUsers } = require('../../utils/notify');
const { autoTranslate } = require('../../utils/translator');
const { validateUploads } = require('../../utils/fileValidation');
const { refuseUnlessClean } = require('../../utils/virusScan');
const { confirmationData } = require('../../services/safetyConfirmations'); // CPPM-127, CPPM-137
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
const { parsePublishAt } = require('../../utils/publishAt');

// CPPM-47: 'safety_update' added (Rohith, 29 Sep) — existing alerts already carry it,
// and without it they could not be saved. Keep in step with admin/pages/SafetyPage.jsx.
const VALID_TYPES     = ['dhcp_letter','product_recall','urgent_safety_restriction','field_safety_notice','safety_update','other'];
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

// ── CPPM-127: who has confirmed each high and critical letter ──────────────
// Reading only; nothing here changes a record. The rule lives in the service.

// GET /api/admin/safety/:clientId/confirmations — one line per letter.
router.get('/:clientId/confirmations', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const letters = await confirmationData(req.params.clientId);
    res.json({ letters: letters.map(({ doctors, ...l }) => l) });
  } catch (err) {
    log.error('admin.safety.error', { err, route: 'GET /:clientId/confirmations', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/safety/:clientId/confirmations/:alertId — each doctor, confirmed or not.
router.get('/:clientId/confirmations/:alertId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [letter] = await confirmationData(req.params.clientId, req.params.alertId);
    if (!letter) return res.status(404).json({ error: 'No high or critical letter with that number.' });
    res.json({ letter });
  } catch (err) {
    log.error('admin.safety.error', { err, route: 'GET /:clientId/confirmations/:alertId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/safety/:clientId/confirmations/:alertId/export — the same list as CSV.
// The export is recorded in the audit trail, as the training export is.
router.get('/:clientId/confirmations/:alertId/export', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [letter] = await confirmationData(req.params.clientId, req.params.alertId);
    if (!letter) return res.status(404).json({ error: 'No high or critical letter with that number.' });
    // Quoted, quotes doubled, and a leading = + - @ neutralised (as in training.js).
    const cell = v => {
      const s = String(v ?? '');
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const header = ['Letter', 'Severity', 'Doctor', 'Email', 'Type', 'Confirmed at (UTC)', 'Reminded at (UTC)', 'Note'];
    const lines = letter.doctors.map(d => [
      letter.title, letter.severity, `${d.first_name} ${d.last_name}`, d.email, d.user_type || 'other',
      d.acknowledged_at ? new Date(d.acknowledged_at).toISOString().replace('T', ' ').slice(0, 19) : 'Not yet',
      d.reminded_at ? new Date(d.reminded_at).toISOString().replace('T', ' ').slice(0, 19) : '', // CPPM-137
      d.addressed ? '' : 'No longer active or no longer addressed',
    ].map(cell).join(','));
    await audit(req.admin, req.params.clientId, 'EXPORT', 'safety_confirmations', letter.id, { rows: lines.length });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="safety-confirmations-${req.params.clientId}-${letter.id}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send([header.map(cell).join(','), ...lines].join('\r\n'));
  } catch (err) {
    log.error('admin.safety.error', { err, route: 'GET /:clientId/confirmations/:alertId/export', path: req.path, request_id: req.requestId || null });
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
      // CPPM-39: and against ClamAV's list of known viruses.
      const scanRefusal = await refuseUnlessClean([req.file]);
      if (scanRefusal) return res.status(scanRefusal.status).json({ error: scanRefusal.error });
    }

    try {
      const { title, alert_type, severity, product_name, ref_number, body_html, effective_date, target_types, status } = req.body;

      // CPPM-58: the create form has always offered "Schedule Publish At" and this
      // route never stored it, so every alert went live at once. An alert now carries
      // the moment it goes live: the time given, or now.
      const publishAt = parsePublishAt(req.body.publish_at);
      if (publishAt === undefined) return res.status(400).json({ error: 'The publish time is not a valid date and time.' });
      const nowUtc = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const goesLiveLater = publishAt !== null && publishAt > nowUtc;

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
          (client_id, title, alert_type, severity, product_name, ref_number, body_html, effective_date, target_types_json, attachment_path, attachment_name, status, publish_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        req.params.clientId, title, alert_type, severity,
        product_name || null, ref_number || null,
        sanitiseHtml(body_html),
        // A date, not a moment: the form shows and re-sends only the day, so storing the
        // current second here made every later plain save record an "effective date" change.
        effective_date || nowUtc.substring(0, 10),
        JSON.stringify(targetTypes),
        attachmentPath, attachmentName,
        status || 'active',
        goesLiveLater ? publishAt : nowUtc,
      ]);

      await audit(req.admin, req.params.clientId, 'CREATE', 'safety_alert', result.insertId, { title });
      // Readers are told when the alert goes live; for one scheduled for later the
      // scheduler does that when its time arrives.
      if ((status || 'active') === 'active' && !goesLiveLater) notifyPortalUsers(req.params.clientId, 'safety', title, result.insertId);
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
// CPPM-47: the edit box sends the same upload form as "new alert" (it can carry a PDF).
// This route used to read only plain JSON, so every save from the screen arrived empty
// and was refused with "No fields to update". It now reads both.
router.put('/:clientId/:alertId', authenticateAdmin, requireClientAccess, (req, res) => {
  upload.single('attachment')(req, res, async (uploadErr) => {
  if (uploadErr) return res.status(400).json({ error: uploadErr.message });
  if (req.file) {
    const failure = validateUploads([req.file], ALLOWED_MIMES);
    if (failure) return res.status(400).json({ error: failure });
    const scanRefusal = await refuseUnlessClean([req.file]);
    if (scanRefusal) return res.status(scanRefusal.status).json({ error: scanRefusal.error });
  }
  try {
    const { title, alert_type, severity, product_name, ref_number, body_html, effective_date, target_types, status, publish_at } = req.body;
    const publishAt = parsePublishAt(publish_at); // CPPM-58: stored as UTC
    if (publishAt === undefined) return res.status(400).json({ error: 'The publish time is not a valid date and time.' });
    const fields = [], values = [];

    if (title !== undefined && !String(title).trim()) return res.status(400).json({ error: 'Title cannot be empty.' });
    if (req.body.alert_type && !VALID_TYPES.includes(req.body.alert_type)) {
      return res.status(400).json({ error: `Invalid alert_type. Must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (req.body.severity && !VALID_SEVERITIES.includes(req.body.severity)) {
      return res.status(400).json({ error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}` });
    }
    // The upload form carries target_types as a JSON string; plain JSON callers send an array.
    let targetTypes;
    if (target_types !== undefined) {
      try { targetTypes = typeof target_types === 'string' ? JSON.parse(target_types || '[]') : target_types; }
      catch { return res.status(400).json({ error: 'target_types must be a JSON array.' }); }
      if (!Array.isArray(targetTypes)) return res.status(400).json({ error: 'target_types must be a JSON array.' });
    }

    if (title !== undefined)          { fields.push('title = ?');              values.push(title); }
    if (alert_type !== undefined)     { fields.push('alert_type = ?');         values.push(alert_type); }
    if (severity !== undefined)       { fields.push('severity = ?');           values.push(severity); }
    if (product_name !== undefined)   { fields.push('product_name = ?');       values.push(product_name || null); }
    if (ref_number !== undefined)     { fields.push('ref_number = ?');         values.push(ref_number || null); }
    if (body_html !== undefined)      { fields.push('body_html = ?');          values.push(sanitiseHtml(body_html)); }
    // An empty date from the form means "leave it", not "set it to nothing".
    if (effective_date)               { fields.push('effective_date = ?');     values.push(effective_date); }
    if (targetTypes !== undefined)    { fields.push('target_types_json = ?'); values.push(JSON.stringify(targetTypes)); }
    if (status !== undefined)         { fields.push('status = ?');             values.push(status); }
    if (publish_at !== undefined)     { fields.push('publish_at = ?');         values.push(publishAt); }
    if (req.file) {
      fields.push('attachment_path = ?', 'attachment_name = ?');
      values.push(`/uploads/private/safety/${req.params.clientId}/${req.file.filename}`, req.file.originalname);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
    fields.push('updated_at = NOW()');
    values.push(req.params.alertId, req.params.clientId);

    const ROW = 'SELECT * FROM cp_safety_alerts WHERE id = ? AND client_id = ?';
    const [[before]] = await pool.execute(ROW, [req.params.alertId, req.params.clientId]);
    if (!before) return res.status(404).json({ error: 'Alert not found.' });
    await pool.execute(`UPDATE cp_safety_alerts SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`, values);
    const [[after]] = await pool.execute(ROW, [req.params.alertId, req.params.clientId]);
    // CPPM-43: what changed, from → to, with the alert body in full — for a safety
    // communication the old wording is exactly what an auditor needs.
    await audit(req.admin, req.params.clientId, 'UPDATE', 'safety_alert', req.params.alertId, { changes: changesBetween(before, after,
      ['title', 'alert_type', 'severity', 'product_name', 'ref_number', 'body_html', 'effective_date', 'target_types_json', 'status', 'publish_at', 'attachment_name']) });
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
});

// PATCH /api/admin/safety/:clientId/:alertId/resolve — mark as resolved
router.patch('/:clientId/:alertId/resolve', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [result] = await pool.execute("UPDATE cp_safety_alerts SET status = 'resolved', updated_at = NOW() WHERE id = ? AND client_id = ?",
      [req.params.alertId, req.params.clientId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Alert not found.' });
    await audit(req.admin, req.params.clientId, 'UPDATE', 'safety_alert', req.params.alertId, { status: 'resolved' });
    res.json({ ok: true });
  } catch (err) {
    log.error('admin.safety.error', { err, route: 'PATCH /:clientId/:alertId/resolve', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
