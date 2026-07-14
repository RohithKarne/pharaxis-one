'use strict';

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { hasGlobalAdminScope } = require('../utils/adminScope');
const { assertPublicHttpUrl } = require('../utils/ssrfGuard');
const { issueClientCredentials, createApiClient } = require('../services/api-platform/tokenIssuer');

// Scopes a client may be granted. '*'/unknown scopes are rejected. (H-04)
const ALLOWED_API_SCOPES = ['cases:read', 'cases:write', 'webhooks:read', 'webhooks:write'];
const { apiKeyAuth } = require('../services/api-platform/apiKeyAuth');
const { scopeGuard } = require('../services/api-platform/scopeGuard');
const { publicApiRateLimiter } = require('../services/api-platform/rateLimiter');
const { signPayload } = require('../services/api-platform/webhookDispatcher');
const { deliverPendingWebhooks } = require('../services/api-platform/webhookDeliveryWorker');
const { buildOpenApiYaml } = require('../services/api-platform/openapiSpec');
const multer = require('multer');
const storage = require('../services/fileStorageService');
const { validateUpload } = require('../middleware/uploadValidation');

const router = express.Router();

// Coerce a loose date input to a MySQL DATE ('YYYY-MM-DD') or null. Intake data
// arrives from an external portal, so never throw on a bad date — drop it.
function toDateOnly(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// C1: attachment forwarding — in-memory multer (files are streamed to the storage
// service, not written to a temp path here).
const attUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 50 * 1024 * 1024) } });
function attSha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

async function logCall(req, res, start) {
  if (!req.apiClient) return;
  await pool.execute(
    `INSERT INTO api_call_log (client_id, method, path, status_code, duration_ms, request_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.apiClient.id, req.method, req.originalUrl, res.statusCode, Date.now() - start, req.headers['x-request-id'] || crypto.randomUUID()]
  ).catch(() => {});
}

// F15: /oauth/token runs a cost-12 bcrypt.compare per request. Without a limiter
// this is both a CPU-exhaustion (DoS) vector and a client_secret brute-force path.
// Cap attempts per IP + client_id. Keyed on the (spoof-resistant) req.ip that
// server.js derives via `trust proxy`, plus the presented client_id so one noisy
// tenant cannot exhaust the budget for others sharing an egress IP.
const oauthTokenRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const clientId = String((req.body && req.body.client_id) || 'unknown').slice(0, 120);
    return `${ip}:${clientId}`;
  },
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many token requests. Please try again shortly.' });
  },
});

router.post('/oauth/token', oauthTokenRateLimiter, async (req, res) => {
  try {
    if (req.body.grant_type && req.body.grant_type !== 'client_credentials') return res.status(400).json({ error: 'unsupported_grant_type' });
    const token = await issueClientCredentials(req.body || {});
    if (!token) return res.status(401).json({ error: 'invalid_client' });
    res.json(token);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/api-clients', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    // H-04: only a platform admin may target another org; tenant admins are pinned to their own.
    const orgId = hasGlobalAdminScope(req.user) ? (req.body.org_id || req.user.orgId) : req.user.orgId;
    // Validate requested scopes against an allow-list; reject '*' / unknown scopes.
    const requested = Array.isArray(req.body.scopes) && req.body.scopes.length ? req.body.scopes : ['cases:read'];
    const invalid = requested.filter((s) => !ALLOWED_API_SCOPES.includes(s));
    if (invalid.length) return res.status(400).json({ error: `Invalid scope(s): ${invalid.join(', ')}` });
    const client = await createApiClient({ org_id: orgId, name: req.body.name, scopes: requested, rate_limit_per_min: req.body.rate_limit_per_min || 60, created_by: req.user.userId });
    res.status(201).json(client);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/openapi.yaml', (_req, res) => {
  res.type('text/yaml').send(buildOpenApiYaml());
});

router.use('/api/v1', apiKeyAuth, publicApiRateLimiter, (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => logCall(req, res, start));
  next();
});

router.get('/api/v1/cases', scopeGuard('cases:read'), async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT c.id, c.case_number, c.case_type, ws.name AS status, c.priority, c.created_at
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
      WHERE c.org_id=? AND c.is_deleted = 0
      ORDER BY c.created_at DESC LIMIT 100`,
    [req.apiClient.org_id]
  );
  res.json({ rows, pagination: { limit: 100 } });
});

// Fetch a single case's current status — used by the CP portal close-sync poller.
// Org-scoped by the API key so a client can only read its own cases.
router.get('/api/v1/cases/:id', scopeGuard('cases:read'), async (req, res) => {
  const [[row]] = await pool.execute(
    `SELECT c.id, c.case_number, c.case_type, ws.name AS status, c.priority, c.created_at, c.updated_at
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
      WHERE c.id = ? AND c.org_id = ? AND c.is_deleted = 0
      LIMIT 1`,
    [req.params.id, req.apiClient.org_id]
  );
  if (!row) return res.status(404).json({ error: 'Case not found.' });
  res.json(row);
});

router.post('/api/v1/cases', scopeGuard('cases:write'), async (req, res) => {
  // org is always resolved from the API key — never from the request body — so a
  // client can only ever create a case in its own organisation (cross-tenant safe).
  const orgId = req.apiClient.org_id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[site]] = await conn.execute('SELECT id FROM sites WHERE org_id=? ORDER BY id ASC LIMIT 1', [orgId]);
    if (!site?.id) { await conn.rollback(); return res.status(400).json({ error: 'No site is configured for this organisation.' }); }
    const [[state]] = await conn.execute('SELECT id FROM workflow_states WHERE org_id=? OR org_id IS NULL ORDER BY org_id IS NULL DESC, id ASC LIMIT 1', [orgId]);

    const caseType = ['MI', 'AE', 'PC'].includes(req.body.case_type) ? req.body.case_type : 'MI';
    // Intake data is captured at the MINIMUM at the source portal; MIMS triage
    // completes the regulated fields. Values are stored as received (no strict
    // picklist rejection) so a valid submission is never dropped at the boundary.
    const intakeChannel = String(req.body.intake_channel || 'api').slice(0, 50);
    // T1: stamp the source reference (e.g. CP-0000NN) as the case number so the
    // case is identifiable and searchable in MIMS by the originating portal
    // reference. case_number is unique per org — fall back to a suffixed value on
    // the rare collision rather than failing the intake.
    const caseNumber = req.body.reference ? String(req.body.reference).slice(0, 100) : null;
    const desc = req.body.description || req.body.subject || null;
    const priority = req.body.priority || 'normal';

    // R2: idempotency — a repeated push of the same submission (same reference)
    // must NOT create a duplicate case. If one already exists for this org with
    // this reference, return it unchanged. Safe under retries.
    if (caseNumber) {
      const [[existing]] = await conn.execute(
        'SELECT id FROM cases WHERE org_id = ? AND case_number = ? AND is_deleted = 0 LIMIT 1',
        [orgId, caseNumber]
      );
      if (existing) {
        await conn.commit();
        return res.status(200).json({ id: existing.id, idempotent: true });
      }
    }

    let result;
    try {
      [result] = await conn.execute(
        `INSERT INTO cases (org_id, site_id, case_type, intake_channel, date_received, case_number, description, status_id, priority, created_by)
         VALUES (?, ?, ?, ?, CURRENT_DATE, ?, ?, ?, ?, NULL)`,
        [orgId, site.id, caseType, intakeChannel, caseNumber, desc, state?.id || null, priority]
      );
    } catch (err) {
      // Race: another request created the same reference between our check and insert.
      if (err.code === 'ER_DUP_ENTRY' && caseNumber) {
        const [[dup]] = await conn.execute(
          'SELECT id FROM cases WHERE org_id = ? AND case_number = ? AND is_deleted = 0 LIMIT 1',
          [orgId, caseNumber]
        );
        if (dup) { await conn.commit(); return res.status(200).json({ id: dup.id, idempotent: true }); }
      }
      throw err;
    }
    const caseId = result.insertId;

    const reporter = req.body.reporter;
    if (reporter && typeof reporter === 'object') {
      await conn.execute(
        `INSERT INTO case_reporter (case_id, first_name, last_name, email, phone, reporter_type, country, organisation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [caseId, reporter.first_name || null, reporter.last_name || null, reporter.email || null,
         reporter.phone || null, reporter.reporter_type || 'HCP', reporter.country || null, reporter.organisation || null]
      );
    }

    const patient = req.body.patient;
    if (patient && typeof patient === 'object' && ['AE', 'PC'].includes(caseType)) {
      const ageNum = patient.age != null && String(patient.age).trim() !== '' ? Number(patient.age) : null;
      await conn.execute(
        `INSERT INTO case_patient (case_id, initials, age, age_unit, gender, weight_kg)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [caseId, patient.initials || null, Number.isFinite(ageNum) ? ageNum : null,
         patient.age_unit || 'years', patient.gender || null,
         patient.weight_kg ? Number(patient.weight_kg) || null : null]
      );
    }

    const ae = req.body.ae_intake;
    if (ae && typeof ae === 'object' && caseType === 'AE') {
      await conn.execute(
        `INSERT INTO case_ae_intake
           (case_id, suspect_drug_name, batch_lot_number, dose, route_of_admin,
            treatment_start_date, treatment_stop_date, reaction_description, reaction_onset_date, outcome,
            is_serious, is_death, is_life_threatening, is_hospitalization, is_prolonged_hospitalization,
            is_disability, is_congenital_anomaly, is_other_medically_important)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [caseId, ae.suspect_drug_name || null, ae.batch_lot_number || null, ae.dose || null, ae.route_of_admin || null,
         toDateOnly(ae.treatment_start_date), toDateOnly(ae.treatment_stop_date), ae.reaction_description || null,
         toDateOnly(ae.reaction_onset_date), ae.outcome || null,
         ae.is_serious ? 1 : 0, ae.is_death ? 1 : 0, ae.is_life_threatening ? 1 : 0,
         ae.is_hospitalization ? 1 : 0, ae.is_prolonged_hospitalization ? 1 : 0,
         ae.is_disability ? 1 : 0, ae.is_congenital_anomaly ? 1 : 0, ae.is_other_medically_important ? 1 : 0]
      );
    }

    const pc = req.body.pc_intake;
    if (pc && typeof pc === 'object' && caseType === 'PC') {
      await conn.execute(
        `INSERT INTO case_pc_intake
           (case_id, product_name, batch_lot_number, expiry_date, purchase_date,
            complaint_category, complaint_description, sample_available, sample_return_requested)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [caseId, pc.product_name || null, pc.batch_lot_number || null,
         toDateOnly(pc.expiry_date), toDateOnly(pc.purchase_date),
         pc.complaint_category || null, pc.complaint_description || null,
         pc.sample_available ? 1 : 0, pc.sample_return_requested ? 1 : 0]
      );
    }

    // C2: MI question fields → case_mi tab (not just the case description).
    const mi = req.body.mi_intake;
    if (mi && typeof mi === 'object' && caseType === 'MI') {
      await conn.execute(
        `INSERT INTO case_mi (case_id, tab_index, mi_category, question_summary, detailed_question, status)
         VALUES (?, 1, ?, ?, ?, 'Open')`,
        [caseId, mi.mi_category || null, mi.question_summary || null, mi.detailed_question || null]
      );
    }

    // FIX-1: also write the case into the structures the MIMS case SCREEN reads,
    // so portal-created cases are actually visible — not just present in intake tables.
    //   reporter  → case_contacts                     (Overview / Contacts tab)
    //   AE detail → case_ae_versions + general/events/product  (AE tab)
    //   PC detail → case_pc_versions + general/product          (PC tab)
    if (reporter && typeof reporter === 'object') {
      await conn.execute(
        `INSERT INTO case_contacts (case_id, contact_role, is_primary, first_name, last_name, contact_type, reporter_type, phone, email)
         VALUES (?, 'reporter', 1, ?, ?, ?, ?, ?, ?)`,
        [caseId, reporter.first_name || null, reporter.last_name || null, 'Reporter', reporter.reporter_type || 'HCP', reporter.phone || null, reporter.email || null]
      );
    }

    if (caseType === 'AE') {
      const aeData = (ae && typeof ae === 'object') ? ae : {};
      const [aev] = await conn.execute('INSERT INTO case_ae_versions (case_id, version_number, created_by) VALUES (?, 1, NULL)', [caseId]);
      const aeVer = aev.insertId;
      await conn.execute(
        `INSERT INTO case_ae_general (version_id, ae_status, date_of_onset, additional_info) VALUES (?, 'Open', ?, ?)`,
        [aeVer, toDateOnly(aeData.reaction_onset_date), aeData.reaction_description || desc || null]
      );
      await conn.execute(
        `INSERT INTO case_ae_events
           (version_id, event_description, outcome, start_date,
            is_serious, is_death, is_life_threatening, is_hospitalization,
            is_disability, is_congenital_anomaly, is_other_medically_important)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [aeVer, aeData.reaction_description || null, aeData.outcome || null, toDateOnly(aeData.reaction_onset_date),
         aeData.is_serious ? 1 : 0, aeData.is_death ? 1 : 0, aeData.is_life_threatening ? 1 : 0, aeData.is_hospitalization ? 1 : 0,
         aeData.is_disability ? 1 : 0, aeData.is_congenital_anomaly ? 1 : 0, aeData.is_other_medically_important ? 1 : 0]
      );
      if (aeData.suspect_drug_name || aeData.batch_lot_number) {
        await conn.execute(
          `INSERT INTO case_ae_product_info (version_id, product_name, batch_lot_number, is_suspect) VALUES (?, ?, ?, 1)`,
          [aeVer, aeData.suspect_drug_name || null, aeData.batch_lot_number || null]
        );
      }
    }

    if (caseType === 'PC') {
      const pcData = (pc && typeof pc === 'object') ? pc : {};
      const [pcv] = await conn.execute('INSERT INTO case_pc_versions (case_id, version_number, created_by) VALUES (?, 1, NULL)', [caseId]);
      const pcVer = pcv.insertId;
      await conn.execute(
        `INSERT INTO case_pc_general (version_id, complaint_description) VALUES (?, ?)`,
        [pcVer, pcData.complaint_description || desc || null]
      );
      if (pcData.product_name || pcData.batch_lot_number) {
        await conn.execute(
          `INSERT INTO case_pc_product_info (version_id, product_name, lot_number) VALUES (?, ?, ?)`,
          [pcVer, pcData.product_name || null, pcData.batch_lot_number || null]
        );
      }
    }

    await conn.commit();
    res.status(201).json({ id: caseId });
  } catch (err) {
    await conn.rollback().catch(() => {});
    res.status(500).json({ error: 'Failed to create case.' });
  } finally {
    conn.release();
  }
});

// C1: attach a file to a case. Stored via the shared file-storage service and
// recorded in the generic attachments table (entity_type='case'). Org-scoped by key.
router.post('/api/v1/cases/:id/attachments', scopeGuard('cases:write'), attUpload.single('file'), validateUpload(['image', 'doc']), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required.' });
    const [[c]] = await pool.execute(
      'SELECT id FROM cases WHERE id = ? AND org_id = ? AND is_deleted = 0 LIMIT 1',
      [req.params.id, req.apiClient.org_id]
    );
    if (!c) return res.status(404).json({ error: 'Case not found.' });

    const ext = (String(req.file.originalname || '').match(/\.[a-z0-9]+$/i) || [''])[0];
    const key = storage.generateKey(ext);
    const stored = await storage.put({ orgId: req.apiClient.org_id, key, body: req.file.buffer, contentType: req.file.mimetype });

    const [result] = await pool.execute(
      `INSERT INTO attachments
         (org_id, entity_type, entity_id, storage_provider, storage_key,
          original_name, mime_type, size_bytes, checksum_sha256, uploaded_by, ocr_status)
       VALUES (?, 'case', ?, ?, ?, ?, ?, ?, ?, NULL, 'skipped')`,
      [req.apiClient.org_id, c.id, stored.provider, stored.key,
       String(req.file.originalname || '').slice(0, 255), req.file.mimetype, req.file.size, attSha256(req.file.buffer)]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to store attachment.' });
  }
});

router.put('/api/v1/cases/:id', scopeGuard('cases:write'), async (req, res) => {
  // M-20: optional optimistic concurrency. If the caller supplies an expected
  // version, gate the UPDATE on it and return 409 on a stale write. Without it,
  // behaviour is unchanged (last-write-wins) for backward compatibility.
  const expected = req.body.expected_version_stamp;
  if (expected !== undefined && expected !== null && expected !== '') {
    const [result] = await pool.execute(
      'UPDATE cases SET description=COALESCE(?, description), priority=COALESCE(?, priority), version_stamp=version_stamp+1 WHERE id=? AND org_id=? AND version_stamp=?',
      [req.body.description || req.body.subject || null, req.body.priority || null, req.params.id, req.apiClient.org_id, expected]
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: 'Version conflict: the case was modified since your expected version.' });
    }
    return res.json({ id: Number(req.params.id) });
  }
  await pool.execute(
    'UPDATE cases SET description=COALESCE(?, description), priority=COALESCE(?, priority), version_stamp=version_stamp+1 WHERE id=? AND org_id=?',
    [req.body.description || req.body.subject || null, req.body.priority || null, req.params.id, req.apiClient.org_id]
  );
  res.json({ id: Number(req.params.id) });
});

router.get('/api/v1/picklists', scopeGuard('picklists:read'), async (req, res) => {
  const [rows] = await pool.execute('SELECT id, category, field_type, value, status FROM picklists WHERE org_id=? AND (? IS NULL OR category=?) AND (? IS NULL OR field_type=?) ORDER BY sort_order ASC, value ASC', [req.apiClient.org_id, req.query.category || null, req.query.category || null, req.query.field_type || null, req.query.field_type || null]);
  res.json({ rows });
});

router.get('/api/v1/products', scopeGuard('products:read'), async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM product_dictionary WHERE org_id=? ORDER BY product_name ASC LIMIT 100', [req.apiClient.org_id]).catch(async () => [ [] ]);
  res.json({ rows });
});

router.get('/api/v1/contacts', scopeGuard('contacts:read'), async (_req, res) => res.json({ rows: [] }));
router.get('/api/v1/users', scopeGuard('admin:read'), async (req, res) => {
  // WP1: scope to the API client's org — was leaking every tenant's user roster.
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.role
       FROM users u
       JOIN user_org_access uoa ON uoa.user_id = u.id
      WHERE uoa.org_id = ? AND uoa.is_active = 1
      ORDER BY u.name ASC LIMIT 100`,
    [req.apiClient.org_id]
  );
  res.json({ rows });
});
router.get('/api/v1/organisations', scopeGuard('admin:read'), async (req, res) => {
  // WP1: a client only ever sees its own organisation — was leaking the full org list.
  const [rows] = await pool.execute('SELECT id, name, data_region FROM organisations WHERE id = ? LIMIT 1', [req.apiClient.org_id]);
  res.json({ rows });
});
router.get('/api/v1/transmissions', scopeGuard('transmissions:read'), async (req, res) => {
  const [rows] = await pool.execute('SELECT t.* FROM transmission_audit_trail t JOIN cases c ON c.id=t.case_id WHERE c.org_id=? ORDER BY t.timestamp DESC LIMIT 100', [req.apiClient.org_id]);
  res.json({ rows });
});
router.get('/api/v1/content/documents', scopeGuard('content:read'), async (_req, res) => res.json({ rows: [] }));

router.get('/api/v1/webhook-subscriptions', scopeGuard('webhooks:write'), async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM webhook_subscriptions WHERE client_id=? ORDER BY created_at DESC', [req.apiClient.id]);
  res.json({ rows });
});
router.post('/api/v1/webhook-subscriptions', scopeGuard('webhooks:write'), async (req, res) => {
  // H-01: reject non-public / internal URLs at store time (SSRF).
  let safeUrl;
  try { safeUrl = await assertPublicHttpUrl(req.body.url); }
  catch (e) { return res.status(400).json({ error: `Invalid webhook url: ${e.message}` }); }
  const secret = crypto.randomBytes(32).toString('hex');
  const [result] = await pool.execute('INSERT INTO webhook_subscriptions (client_id, url, events, signing_secret, status) VALUES (?, ?, ?, ?, ?)', [req.apiClient.id, safeUrl, JSON.stringify(req.body.events || []), secret, 'active']);
  res.status(201).json({ id: result.insertId, signing_secret: secret });
});
router.put('/api/v1/webhook-subscriptions/:id', scopeGuard('webhooks:write'), async (req, res) => {
  let safeUrl = null;
  if (req.body.url) {
    try { safeUrl = await assertPublicHttpUrl(req.body.url); }
    catch (e) { return res.status(400).json({ error: `Invalid webhook url: ${e.message}` }); }
  }
  await pool.execute('UPDATE webhook_subscriptions SET url=COALESCE(?, url), events=COALESCE(?, events), status=COALESCE(?, status) WHERE id=? AND client_id=?', [safeUrl, req.body.events ? JSON.stringify(req.body.events) : null, req.body.status || null, req.params.id, req.apiClient.id]);
  res.json({ id: Number(req.params.id) });
});
router.delete('/api/v1/webhook-subscriptions/:id', scopeGuard('webhooks:write'), async (req, res) => {
  await pool.execute('UPDATE webhook_subscriptions SET status="revoked" WHERE id=? AND client_id=?', [req.params.id, req.apiClient.id]);
  res.json({ revoked: true });
});
router.get('/api/v1/webhook-subscriptions/:id/deliveries', scopeGuard('webhooks:write'), async (req, res) => {
  const [rows] = await pool.execute('SELECT d.* FROM webhook_deliveries d JOIN webhook_subscriptions s ON s.id=d.subscription_id WHERE s.id=? AND s.client_id=? ORDER BY d.id DESC LIMIT 100', [req.params.id, req.apiClient.id]);
  res.json({ rows });
});
router.post('/api/v1/webhook-subscriptions/:id/deliveries/:dId/replay', scopeGuard('webhooks:write'), async (req, res) => {
  // C-05: scope the replay to the caller's own subscription + client, not the bare delivery id,
  // otherwise any client could re-fire another org's webhook delivery by enumerating :dId.
  const [r] = await pool.execute(
    `UPDATE webhook_deliveries d
       JOIN webhook_subscriptions s ON s.id = d.subscription_id
        SET d.attempt_count = 0, d.next_retry_at = CURRENT_TIMESTAMP
      WHERE d.id = ? AND d.subscription_id = ? AND s.client_id = ?`,
    [req.params.dId, req.params.id, req.apiClient.id]
  );
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Delivery not found' });
  res.json({ queued: true });
});

router.post('/api/v1/webhook-deliveries/flush', scopeGuard('webhooks:write'), async (_req, res) => {
  const results = await deliverPendingWebhooks(25);
  res.json({ results });
});

// CUT (product rationalization): GraphQL was a stub endpoint duplicating REST; removed.

router.get('/api/v1/webhook-signature-example', scopeGuard('webhooks:write'), (req, res) => {
  const payload = { event: 'case.created', id: 1 };
  res.json({ payload, signature: signPayload('example-secret', payload) });
});

// CUT (product rationalization): the SDK-snippet endpoint (Node/Python/Java stubs) is removed.

module.exports = router;
