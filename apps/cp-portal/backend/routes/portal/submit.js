/**
 * Portal Submit — /api/portal/submit
 * Handles all public form submissions. Auto-syncs to integrated system.
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal } = require('../../middleware/auth');
const { sendEmail } = require('../../utils/mailer');
const { assertSafeOutboundUrl } = require('../../utils/networkGuard');

// POST /api/portal/submit/:clientCode/:formType
router.post('/:clientCode/:formType', authenticatePortal, async (req, res) => {
  try {
    const { clientCode, formType } = req.params;
    const VALID_TYPES = ['medical_inquiry', 'adverse_event', 'product_complaint', 'other_inquiry'];
    if (!VALID_TYPES.includes(formType)) return res.status(400).json({ error: 'Invalid form type.' });

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

    const r = await fetch(new URL('/api/cases', safeBaseUrl).toString(), {
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

module.exports = router;
