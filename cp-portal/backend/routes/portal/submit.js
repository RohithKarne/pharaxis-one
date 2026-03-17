/**
 * Portal Submit — /api/portal/submit
 * Handles all public form submissions. Auto-syncs to integrated system.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticatePortal } = require('../../middleware/auth');

// POST /api/portal/submit/:clientCode/:formType
router.post('/:clientCode/:formType', authenticatePortal, async (req, res) => {
  const { clientCode, formType } = req.params;
  const VALID_TYPES = ['medical_inquiry', 'adverse_event', 'product_complaint', 'other_inquiry'];
  if (!VALID_TYPES.includes(formType)) return res.status(400).json({ error: 'Invalid form type.' });

  const client = db.prepare('SELECT * FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });

  // Check feature is enabled for this client
  const feature = db.prepare('SELECT * FROM cp_features WHERE client_id = ? AND feature_key = ? AND is_enabled = 1')
    .get(client.id, formType === 'other_inquiry' ? 'other_inquiry' : formType);
  if (!feature) return res.status(403).json({ error: 'This submission type is not enabled.' });

  const { form_data, submitter_email, submitter_type } = req.body;
  if (!form_data) return res.status(400).json({ error: 'form_data is required.' });

  // API-07: Input length validation — prevent oversized payloads filling the database
  const formDataStr = typeof form_data === 'string' ? form_data : JSON.stringify(form_data);
  if (formDataStr.length > 50000) return res.status(400).json({ error: 'Input exceeds maximum length.' });

  const rawIp = req.ip || '';
  const ip_address = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;

  const submitter_name = (req.body.submitter_name || '').trim() || null;

  const info = db.prepare(`
    INSERT INTO cp_submissions (client_id, submission_type, user_id, submitter_name, submitter_email, submitter_type, form_data, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    client.id, formType,
    req.portalUser?.userId || null,
    submitter_name, submitter_email || null, submitter_type || null,
    formDataStr,
    ip_address
  );

  const submissionId = info.lastInsertRowid;

  // Auto-sync to integrated system if configured
  syncToIntegration(client.id, submissionId, formType).catch(() => {});

  res.status(201).json({
    id: submissionId,
    message: 'Submission received. Thank you.',
    reference: `CP-${String(submissionId).padStart(6, '0')}`,
  });
});

// GET /api/portal/submit/:clientCode/submissions — user's own submissions (auth required)
router.get('/:clientCode/submissions', authenticatePortal, (req, res) => {
  if (!req.portalUser) return res.status(401).json({ error: 'Login required to view submissions.' });
  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(req.params.clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });
  const rows = db.prepare(`
    SELECT id, submission_type, status, external_ref, submitted_at, updated_at
    FROM cp_submissions WHERE client_id = ? AND user_id = ? ORDER BY submitted_at DESC
  `).all(client.id, req.portalUser.userId);
  res.json({ submissions: rows });
});

// ── Integration sync helper ───────────────────────────────────

async function syncToIntegration(clientId, submissionId, formType) {
  const integration = db.prepare('SELECT * FROM cp_integration_config WHERE client_id = ? AND is_active = 1 LIMIT 1').get(clientId);
  if (!integration) return;

  const submission = db.prepare('SELECT * FROM cp_submissions WHERE id = ?').get(submissionId);
  if (!submission) return;

  const mappings = db.prepare('SELECT * FROM cp_field_mapping WHERE client_id = ? AND integration_id = ? AND form_type = ?')
    .all(clientId, integration.id, formType);

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
    db.prepare(`UPDATE cp_submissions SET status='pending_sync', sync_attempts=sync_attempts+1 WHERE id=?`).run(submissionId);

    const headers = { 'Content-Type': 'application/json' };
    if (integration.auth_type === 'bearer' && integration.api_key) headers['Authorization'] = `Bearer ${integration.api_key}`;
    if (integration.auth_type === 'apikey' && integration.api_key) headers['X-API-Key'] = integration.api_key;
    if (integration.extra_headers) Object.assign(headers, JSON.parse(integration.extra_headers));

    const r = await fetch(`${integration.api_base_url}/api/cases`, {
      method: 'POST', headers, body: JSON.stringify(payload),
    });

    if (r.ok) {
      const data = await r.json().catch(() => ({}));
      db.prepare(`UPDATE cp_submissions SET status='synced', external_ref=?, synced_at=datetime('now'), sync_error=null WHERE id=?`)
        .run(data.case_id || data.id || null, submissionId);
    } else {
      db.prepare(`UPDATE cp_submissions SET status='failed_sync', sync_error=? WHERE id=?`).run(`HTTP ${r.status}`, submissionId);
    }
  } catch (err) {
    db.prepare(`UPDATE cp_submissions SET status='failed_sync', sync_error=? WHERE id=?`).run(err.message, submissionId);
  }
}

module.exports = router;
