/**
 * Portal Submit — /api/portal/submit
 * Handles all public form submissions. Auto-syncs to integrated system.
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const { pool } = require('../../database/db');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');
const { sendEmail } = require('../../utils/mailer');
const { assertSafeOutboundUrl, safeFetch } = require('../../utils/networkGuard');
const { decryptSecret } = require('../../utils/secretCrypto');
const { validateUploads } = require('../../utils/fileValidation');

// ── Attachment upload config (private storage, streamed via auth endpoints) ──
const ATT_MAX_SIZE  = 10 * 1024 * 1024; // 10 MB per file
const ATT_MAX_FILES = 5;
const ATT_ALLOWED   = [
  'application/pdf', 'image/jpeg', 'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const attStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // SEC: sanitize clientCode before it touches the filesystem — multer runs
    // before route validation, so a raw `../` in the path param would otherwise
    // be a path-traversal write vector. Strip to the known clientCode charset.
    const safeCode = String(req.params.clientCode || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown';
    const dir = path.join(__dirname, '../../uploads/private/submissions', safeCode);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const submissionUpload = multer({
  storage: attStorage,
  limits: { fileSize: ATT_MAX_SIZE, files: ATT_MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (ATT_ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed. Use PDF, JPG, PNG, DOC, or DOCX.'));
  },
}).array('attachments', ATT_MAX_FILES);

// Middleware wrapper that turns multer errors into clean JSON responses.
function handleUpload(req, res, next) {
  submissionUpload(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'A file exceeds the 10MB limit.'
        : err.code === 'LIMIT_FILE_COUNT' ? 'Too many files (maximum 5).'
        : (err.message || 'File upload failed.');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

// Stream a stored attachment; verifies the caller already established access.
function streamAttachment(res, att, inline) {
  const abs = path.join(__dirname, '../../', att.file_path.replace(/^\//, ''));
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File not found on server.' });
  res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${att.file_name}"`);
  fs.createReadStream(abs).pipe(res);
}

// POST /api/portal/submit/:clientCode/:formType
router.post('/:clientCode/:formType', authenticatePortal, handleUpload, async (req, res) => {
  try {
    const { clientCode, formType } = req.params;
    const VALID_TYPES = ['medical_inquiry', 'adverse_event', 'product_complaint', 'other_inquiry'];
    if (!VALID_TYPES.includes(formType)) return res.status(400).json({ error: 'Invalid form type.' });

    // SEC: validate real attachment content (magic bytes), not the spoofable MIME
    // header. Rejects disguised HTML/SVG/executables and deletes them from disk.
    if (req.files && req.files.length) {
      const failure = validateUploads(req.files, ATT_ALLOWED);
      if (failure) return res.status(400).json({ error: failure });
    }

    const [[client]] = await pool.execute('SELECT * FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    // Check feature is enabled for this client
    const [[feature]] = await pool.execute('SELECT * FROM cp_features WHERE client_id = ? AND feature_key = ? AND is_enabled = 1',
      [client.id, formType === 'other_inquiry' ? 'other_inquiry' : formType]);
    if (!feature) return res.status(403).json({ error: 'This submission type is not enabled.' });

    const { form_data, submitter_email, submitter_type } = req.body;
    if (!form_data) return res.status(400).json({ error: 'form_data is required.' });

    // API-07: Input length validation — prevent oversized payloads filling the database
    const formDataStr = typeof form_data === 'string' ? form_data : JSON.stringify(form_data);
    if (formDataStr.length > 50000) return res.status(400).json({ error: 'Input exceeds maximum length.' });

    const rawIp = req.ip || '';
    const ip_address = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;

    const submitter_name = (req.body.submitter_name || '').trim() || null;

    const [info] = await pool.execute(`
      INSERT INTO cp_submissions (client_id, submission_type, user_id, submitter_name, submitter_email, submitter_type, form_data, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      client.id, formType,
      req.portalUser?.userId || null,
      submitter_name, submitter_email || null, submitter_type || null,
      formDataStr,
      ip_address,
    ]);

    const submissionId = info.insertId;

    // Save any uploaded attachments, linked to the new submission.
    if (req.files && req.files.length > 0) {
      for (const f of req.files) {
        await pool.execute(
          `INSERT INTO cp_submission_attachments (submission_id, client_id, file_name, file_path, file_size, mime_type)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [submissionId, client.id, f.originalname.slice(0, 255),
           `/uploads/private/submissions/${clientCode}/${f.filename}`, f.size, f.mimetype]
        );
      }
    }

    // Auto-sync to integrated system if configured
    syncToIntegration(client.id, submissionId, formType).catch(() => {});

    // Send submission confirmation email — fire-and-forget, non-fatal
    let recipientEmail = submitter_email || null;
    if (!recipientEmail && req.portalUser) {
      const [[u]] = await pool.execute('SELECT email FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
      recipientEmail = u?.email || null;
    }
    if (recipientEmail) {
      const ref = `CP-${String(submissionId).padStart(6, '0')}`;
      const typeLabel = { medical_inquiry: 'Medical Inquiry', adverse_event: 'Adverse Event', product_complaint: 'Product Complaint', other_inquiry: 'Other Inquiry' }[formType] || formType;
      sendEmail(client.id, {
        to: recipientEmail,
        subject: `Submission Received — ${typeLabel} (${ref})`,
        html: `<p>Thank you for your submission.</p><p>Your reference number is <strong>${ref}</strong>.</p><p>We will review your ${typeLabel} and respond as soon as possible.</p>`,
        text: `Thank you for your submission. Your reference number is ${ref}. We will review your ${typeLabel} and respond as soon as possible.`,
      }).catch(() => {}); // never block the response
    }

    res.status(201).json({
      id: submissionId,
      message: 'Submission received. Thank you.',
      reference: `CP-${String(submissionId).padStart(6, '0')}`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/submit/:clientCode/submissions — user's own submissions (auth required)
router.get('/:clientCode/submissions', authenticatePortal, async (req, res) => {
  try {
    if (!req.portalUser) return res.status(401).json({ error: 'Login required to view submissions.' });
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const [rows] = await pool.execute(`
      SELECT id, submission_type, status, external_ref, submitted_at, updated_at
      FROM cp_submissions WHERE client_id = ? AND user_id = ? ORDER BY submitted_at DESC
    `, [client.id, req.portalUser.userId]);
    res.json({ submissions: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Integration sync helper ───────────────────────────────────

async function syncToIntegration(clientId, submissionId, formType) {
  const [[integration]] = await pool.execute('SELECT * FROM cp_integration_config WHERE client_id = ? AND is_active = 1 LIMIT 1', [clientId]);
  if (!integration) return;
  integration.api_key = decryptSecret(integration.api_key);

  const [[submission]] = await pool.execute('SELECT * FROM cp_submissions WHERE id = ?', [submissionId]);
  if (!submission) return;

  const [mappings] = await pool.execute('SELECT * FROM cp_field_mapping WHERE client_id = ? AND integration_id = ? AND form_type = ?',
    [clientId, integration.id, formType]);

  const formData = typeof submission.form_data === 'string' ? JSON.parse(submission.form_data) : submission.form_data;

  // Build target payload using field mappings
  const payload = {};
  for (const m of mappings) {
    let value = formData[m.cp_field] ?? m.default_value ?? null;
    if (value && m.transform === 'uppercase') value = String(value).toUpperCase();
    if (value && m.transform === 'date_iso') value = new Date(value).toISOString();
    payload[m.target_field] = value;
  }

  // If no mappings configured, send raw form_data
  if (mappings.length === 0) {
    payload.form_data = formData;
    payload.submission_type = formType;
    payload.reference = `CP-${String(submissionId).padStart(6, '0')}`;
  }

  try {
    await pool.execute(`UPDATE cp_submissions SET status='pending_sync', sync_attempts=sync_attempts+1 WHERE id=?`, [submissionId]);
    const safeBaseUrl = await assertSafeOutboundUrl(integration.api_base_url);

    const headers = { 'Content-Type': 'application/json' };
    if (integration.auth_type === 'bearer' && integration.api_key) headers['Authorization'] = `Bearer ${integration.api_key}`;
    if (integration.auth_type === 'apikey' && integration.api_key) headers['X-API-Key'] = integration.api_key;
    if (integration.extra_headers) Object.assign(headers, JSON.parse(integration.extra_headers));

    const r = await safeFetch(new URL('/api/cases', safeBaseUrl).toString(), {
      method: 'POST', headers, body: JSON.stringify(payload),
    });

    if (r.ok) {
      const data = await r.json().catch(() => ({}));
      await pool.execute(`UPDATE cp_submissions SET status='synced', external_ref=?, synced_at=NOW(), sync_error=null WHERE id=?`,
        [data.case_id || data.id || null, submissionId]);
    } else {
      await pool.execute(`UPDATE cp_submissions SET status='failed_sync', sync_error=? WHERE id=?`, [`HTTP ${r.status}`, submissionId]);
    }
  } catch (err) {
    await pool.execute(`UPDATE cp_submissions SET status='failed_sync', sync_error=? WHERE id=?`, [err.message, submissionId]);
  }
}

// GET /api/portal/submit/:clientCode/attachments/:attachmentId — download own submission's attachment
router.get('/:clientCode/attachments/:attachmentId', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const [[att]] = await pool.execute(
      `SELECT a.file_name, a.file_path, a.mime_type
       FROM cp_submission_attachments a
       JOIN cp_submissions s ON s.id = a.submission_id
       JOIN cp_clients c ON c.id = a.client_id
       WHERE a.id = ? AND c.code = ? AND s.user_id = ?`,
      [req.params.attachmentId, req.params.clientCode, req.portalUser.userId]);
    if (!att) return res.status(404).json({ error: 'Attachment not found.' });
    streamAttachment(res, att, req.query.disposition === 'inline');
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
