/**
 * Admin Integration — /api/admin/integration
 * MIMS or third-party system integration config + field mapping per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');

// The MIMS intake fields a portal field can map onto, per form type — the same list the
// Integration screen offers (IntegrationPage.jsx); dot paths address the /api/v1/cases payload.
const MIMS_COMMON_FIELDS = [
  'reporter.first_name', 'reporter.last_name', 'reporter.email', 'reporter.phone',
  'reporter.organisation', 'reporter.reporter_type', 'description', 'priority',
];
const MIMS_TARGETS = {
  medical_inquiry:   [...MIMS_COMMON_FIELDS, 'mi_intake.mi_category', 'mi_intake.question_summary', 'mi_intake.detailed_question', 'mi_intake.product_name'],
  adverse_event:     [...MIMS_COMMON_FIELDS, 'patient.initials', 'patient.age', 'patient.gender',
                      'ae_intake.suspect_drug_name', 'ae_intake.batch_lot_number', 'ae_intake.reaction_description',
                      'ae_intake.reaction_onset_date', 'ae_intake.outcome', 'ae_intake.seriousness_reported'],
  product_complaint: [...MIMS_COMMON_FIELDS, 'pc_intake.product_name', 'pc_intake.batch_lot_number',
                      'pc_intake.complaint_category', 'pc_intake.complaint_description', 'pc_intake.purchase_date'],
};
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { assertSafeOutboundUrl, safeFetch } = require('../../utils/networkGuard');
const { encryptSecret } = require('../../utils/secretCrypto');
const { audit } = require('../../utils/audit');
const { getAuthHeaders, invalidateAuth } = require('../../services/mimsAuth');
const log = require('../../utils/logger');
const { loadFormFields } = require('../../services/formFields');

// Bridge feature F4: the bridge version this portal is built for. MIMS reports its own
// at /api/v1/cases/bridge; an older MIMS is missing what the portal relies on.
const BRIDGE_VERSION = 2;

// A made-up answer for every question on a form, so the trial report exercises the
// real form and its field mappings without anyone's details.
function sampleAnswers(fields) {
  const today = new Date().toISOString().slice(0, 10);
  const out = {};
  for (const f of fields) {
    const first = String(f.options || '').split('\n').map(o => o.trim()).filter(Boolean)[0];
    out[f.field_key] = f.field_type === 'email' ? 'connection-test@example.invalid'
      : f.field_type === 'date' ? today
      : f.field_type === 'checkbox' ? true
      : f.field_type === 'phone' ? '+440000000000'
      : first || `Connection test (${f.label || f.field_key})`;
  }
  return out;
}

// Bridge feature F4: after the sign-in check, ask MIMS which bridge it speaks, then send
// one trial report per form that goes to MIMS. MIMS checks it as a real report and keeps
// nothing (dry run). Each form also lists the questions that reach MIMS only inside
// the case comment, because no MIMS field takes them.
async function bridgeChecks(cfg, safeUrl, headers) {
  const submit = require('../portal/submit');
  const call = async (url, opts = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try { return await safeFetch(url, { headers, signal: controller.signal, ...opts }); } finally { clearTimeout(timer); }
  };
  const out = { mims_bridge_version: null, portal_bridge_version: BRIDGE_VERSION, version_message: null, forms: [] };
  const v = await call(new URL('/api/v1/cases/bridge', safeUrl).toString());
  if (v.ok) {
    const d = await v.json().catch(() => ({}));
    out.mims_bridge_version = Number(d.bridge_version) || null;
  }
  out.version_message = !out.mims_bridge_version
    ? 'MIMS does not say which bridge version it runs, so it is older than this portal. Reports still arrive, but serious-report dates, the journey, questions to the reporter and duplicate warnings will not work until MIMS is updated.'
    : out.mims_bridge_version < BRIDGE_VERSION
      ? `MIMS runs bridge version ${out.mims_bridge_version}; this portal expects ${BRIDGE_VERSION}. Update MIMS.`
      : out.mims_bridge_version > BRIDGE_VERSION
        ? `MIMS runs bridge version ${out.mims_bridge_version}, newer than this portal's ${BRIDGE_VERSION}. Reports still arrive; update the portal to use what is new.`
        : `Both sides run bridge version ${BRIDGE_VERSION}.`;
  // An older MIMS does not know trial reports and would keep a real case (a made-up
  // side effect included), so none is sent to it.
  if (!out.mims_bridge_version || out.mims_bridge_version < 2) return out;
  for (const formType of Object.keys(submit.FORM_TYPE_TO_CASE_TYPE)) {
    const { fields } = await loadFormFields(cfg.client_id, formType);
    if (!fields.length) continue;
    const formData = sampleAnswers(fields);
    const used = new Set(['awareness_date', 'related_reference']);
    const payload = submit.buildMimsPayload(formType, formData, 0, new Date(), used);
    payload.reference = 'CONNECTION-TEST';
    const other = await submit.addMappedAndOtherAnswers({ clientId: cfg.client_id, integrationId: cfg.id, formType, formData, payload, used });
    const form = { form_type: formType, comment_only: other.map(o => o.question), ok: false, message: null };
    try {
      const r = await call(new URL('/api/v1/cases?dry_run=1', safeUrl).toString(), { method: 'POST', body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      // A case kept despite the dry run must not pass as fine.
      if (r.ok && d.dry_run) { form.ok = true; form.message = 'MIMS would accept this report.'; }
      else if (r.ok && d.idempotent) { form.ok = true; form.message = 'MIMS would treat this as a report it already holds.'; }
      else if (r.ok) form.message = `MIMS does not support trial reports and created case ${d.case_number || d.id}. Delete it in MIMS.`;
      else form.message = `MIMS would refuse this report: ${d.error || `HTTP ${r.status}`}`;
    } catch (err) {
      form.message = `The trial report could not be sent: ${err.message}`;
    }
    out.forms.push(form);
  }
  return out;
}

// Mask a secret field — show only last 4 chars with **** prefix
function maskSecret(value) {
  if (!value) return value;
  return '****' + String(value).slice(-4);
}

// GET /api/admin/integration/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [config]  = await pool.execute('SELECT * FROM cp_integration_config WHERE client_id = ?', [req.params.clientId]);
    const masked = config.map(c => ({
      ...c,
      api_key:    maskSecret(c.api_key),
      api_secret: maskSecret(c.api_secret),
    }));
    const [mapping] = await pool.execute('SELECT * FROM cp_field_mapping WHERE client_id = ? ORDER BY form_type, cp_field ASC', [req.params.clientId]);
    res.json({ integrations: masked, mappings: mapping });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/integration/:clientId — add integration
router.post('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { system_name, api_base_url, api_key, api_secret, auth_type, extra_headers, mims_case_url_base } = req.body;
    if (!api_base_url) return res.status(400).json({ error: 'api_base_url is required.' });
    const [result] = await pool.execute(
      `INSERT INTO cp_integration_config (client_id, system_name, api_base_url, api_key, api_secret, auth_type, extra_headers, mims_case_url_base)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, system_name || 'MIMS', api_base_url, encryptSecret(api_key ?? null), encryptSecret(api_secret ?? null), auth_type || 'bearer', extra_headers ? JSON.stringify(extra_headers) : null, mims_case_url_base || null]
    );
    // CPPM-10: names and flags only — an API key or secret never reaches the trail.
    await audit(req.admin, req.params.clientId, 'CREATE', 'integration', result.insertId,
      { system_name: system_name || 'MIMS', api_base_url, auth_type: auth_type || 'bearer', api_key_set: !!api_key, api_secret_set: !!api_secret });
    res.status(201).json({ id: result.insertId, message: 'Integration configured.' });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'POST /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/integration/:clientId/:integrationId
router.patch('/:clientId/:integrationId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const allowed = ['system_name', 'api_base_url', 'api_key', 'api_secret', 'auth_type', 'is_active', 'mims_case_url_base'];
    const updates = [], params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        // SEC-02: skip secret fields if the frontend is echoing back a masked display value
        if ((key === 'api_key' || key === 'api_secret') && String(req.body[key]).startsWith('****')) continue;
        const isSecret = (key === 'api_key' || key === 'api_secret');
        updates.push(`${key} = ?`); params.push(isSecret ? encryptSecret(req.body[key]) : req.body[key]);
      }
    }
    if (req.body.extra_headers !== undefined) { updates.push('extra_headers = ?'); params.push(JSON.stringify(req.body.extra_headers)); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    updates.push(`updated_at = NOW()`);
    params.push(req.params.integrationId, req.params.clientId);
    const [result] = await pool.execute(`UPDATE cp_integration_config SET ${updates.join(', ')} WHERE id=? AND client_id=?`, params);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Integration not found.' });
    // CPPM-10: which fields changed, never what they changed to.
    await audit(req.admin, req.params.clientId, 'UPDATE', 'integration', Number(req.params.integrationId),
      { fields: updates.map(u => u.split(' ')[0]).filter(f => f !== 'updated_at') });
    // CPPM-151 walk: reports that arrived while no integration was on stayed in the
    // portal for good — the retry job only looks at failed ones. Switching an
    // integration on now sends them, one after another, in the background.
    let queued = 0;
    if (req.body.is_active === true || req.body.is_active === 1) {
      const [waiting] = await pool.execute(
        `SELECT id, submission_type FROM cp_submissions
          WHERE client_id = ? AND external_ref IS NULL AND status = 'submitted'
            AND submission_type IN ('medical_inquiry', 'adverse_event', 'product_complaint')
          ORDER BY id`, [req.params.clientId]);
      queued = waiting.length;
      if (queued) {
        const { syncToIntegration } = require('../portal/submit');
        setImmediate(async () => {
          for (const s of waiting) {
            await syncToIntegration(Number(req.params.clientId), s.id, s.submission_type)
              .catch(err => log.error('admin.integration.send_waiting_failed', { err, submission_id: s.id }));
          }
        });
      }
    }
    res.json({ message: queued ? `Integration updated. ${queued} report(s) received while it was off are being sent to MIMS now.` : 'Integration updated.' });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'PATCH /:clientId/:integrationId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/integration/:clientId/:integrationId
router.delete('/:clientId/:integrationId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [result] = await pool.execute('UPDATE cp_integration_config SET is_active=0 WHERE id=? AND client_id=?', [req.params.integrationId, req.params.clientId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Integration not found.' });
    await audit(req.admin, req.params.clientId, 'DISABLE', 'integration', Number(req.params.integrationId), {});
    res.json({ message: 'Integration deactivated.' });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'DELETE /:clientId/:integrationId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/integration/:clientId/:integrationId/test — test connectivity
router.post('/:clientId/:integrationId/test', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [[cfg]] = await pool.execute('SELECT * FROM cp_integration_config WHERE id=? AND client_id=?', [req.params.integrationId, req.params.clientId]);
    if (!cfg) return res.status(404).json({ error: 'Integration not found.' });
    try {
      const safeUrl = await assertSafeOutboundUrl(cfg.api_base_url);
      // NEW-D: for auth_type 'oauth' this mints a fresh token from the stored client
      // credentials, so the Test button also proves the token exchange works.
      await invalidateAuth(cfg.id);
      const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders(cfg)) };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      // O1: authenticated check — hit the real intake endpoint so a valid host with
      // a bad/missing token or wrong scope FAILS the test (was only pinging /api/health).
      const r = await safeFetch(new URL('/api/v1/cases', safeUrl).toString(), { headers, signal: controller.signal });
      clearTimeout(timeout);
      let message;
      if (r.ok) message = 'Authenticated OK — token valid with case access.';
      else if (r.status === 401) message = 'Unauthorized — token missing or invalid.';
      else if (r.status === 403) message = 'Forbidden — token lacks the cases scope.';
      else if (r.status === 404) message = 'Host reached, but /api/v1/cases not found — is the API platform enabled?';
      else message = `Unexpected response (HTTP ${r.status}).`;
      const syncStatus = r.ok ? 'success' : 'failure';
      await pool.execute(
        `UPDATE cp_integration_config SET last_sync_at = NOW(), last_sync_status = ?, last_sync_error = ? WHERE id = ?`,
        [syncStatus, r.ok ? null : message, cfg.id]
      );
      // Only an older MIMS can be asked nothing more; a failing sign-in is the answer.
      const bridge = r.ok ? await bridgeChecks(cfg, safeUrl, headers).catch(err => ({ error: err.message })) : null;
      await audit(req.admin, req.params.clientId, 'TEST_CONNECTION', 'integration', cfg.id, {
        success: r.ok, status: r.status, message,
        ...(bridge ? { mims_bridge_version: bridge.mims_bridge_version || null, trial_reports: (bridge.forms || []).map(f => ({ form: f.form_type, ok: f.ok })) } : {}),
      });
      res.json({ success: r.ok, status: r.status, message, bridge });
    } catch (fetchErr) {
      await pool.execute(
        `UPDATE cp_integration_config SET last_sync_at = NOW(), last_sync_status = 'failure', last_sync_error = ? WHERE id = ?`,
        [String(fetchErr.message).slice(0, 500), cfg.id]
      );
      await audit(req.admin, req.params.clientId, 'TEST_CONNECTION', 'integration', cfg.id, { success: false, message: String(fetchErr.message).slice(0, 500) });
      res.json({ success: false, error: fetchErr.message });
    }
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'POST /:clientId/:integrationId/test', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Field Mapping ─────────────────────────────────────────────

// GET /api/admin/integration/:clientId/mapping/:integrationId
router.get('/:clientId/mapping/:integrationId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_field_mapping WHERE client_id=? AND integration_id=? ORDER BY form_type, cp_field', [req.params.clientId, req.params.integrationId]);
    // A mapping saved before the target check existed may point at a field MIMS does
    // not have; it is still sent and ignored, so the screen marks it instead of hiding it.
    res.json({ mappings: rows.map(m => ({ ...m, is_known: !!(MIMS_TARGETS[m.form_type] || []).includes(m.target_field) })) });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'GET /:clientId/mapping/:integrationId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/integration/:clientId/mapping
router.post('/:clientId/mapping', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { integration_id, form_type, cp_field, target_field, transform, default_value } = req.body;
    if (!integration_id || !form_type || !cp_field || !target_field) return res.status(400).json({ error: 'integration_id, form_type, cp_field and target_field are required.' });
    // A target MIMS does not read was saved and silently ignored on every report. The
    // screen offers only these; a mapping made any other way is refused with the list.
    const targets = MIMS_TARGETS[form_type];
    if (!targets) return res.status(400).json({ error: `form_type must be one of ${Object.keys(MIMS_TARGETS).join(', ')}.` });
    if (!targets.includes(target_field)) return res.status(400).json({ error: `MIMS has no field "${target_field}" for a ${form_type.replace(/_/g, ' ')}, so the mapping was not saved. It can map onto: ${targets.join(', ')}.` });
    const [result] = await pool.execute(
      `REPLACE INTO cp_field_mapping (client_id, integration_id, form_type, cp_field, target_field, transform, default_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, integration_id, form_type, cp_field, target_field, transform ?? null, default_value ?? null]
    );
    await audit(req.admin, req.params.clientId, 'CREATE', 'field_mapping', result.insertId, { integration_id, form_type, cp_field, target_field });
    res.status(201).json({ id: result.insertId, message: 'Mapping saved.' });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'POST /:clientId/mapping', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/integration/:clientId/mapping/:mappingId
router.delete('/:clientId/mapping/:mappingId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM cp_field_mapping WHERE id=? AND client_id=?', [req.params.mappingId, req.params.clientId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Mapping not found.' });
    await audit(req.admin, req.params.clientId, 'DELETE', 'field_mapping', Number(req.params.mappingId), {});
    res.json({ message: 'Mapping removed.' });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'DELETE /:clientId/mapping/:mappingId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
