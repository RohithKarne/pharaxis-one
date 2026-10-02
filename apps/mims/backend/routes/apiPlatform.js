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
const { writeCaseAudit, writeAuditLog } = require('../services/caseHelpers');
const { logger } = require('../services/logger');
const { notifyIntakeArrival } = require('../services/intakeAlertService');

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

// Bridge row 6: the organisation's connected systems — what each may do, where its
// cases land, and how its calls are going (last 24 hours, from api_call_log).
router.get('/api/admin/api-clients', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const orgId = hasGlobalAdminScope(req.user) ? (Number(req.query.org_id) || req.user.orgId) : req.user.orgId;
    if (!orgId) return res.status(400).json({ error: 'Choose an organisation.' });
    const [clients] = await pool.execute(
      `SELECT c.id, c.client_id, c.name, c.scopes, c.status, c.rate_limit_per_min, c.default_site_id, c.initial_status_id,
              c.created_at, c.last_used_at,
              (SELECT COUNT(*) FROM api_call_log l WHERE l.client_id = c.id AND l.created_at > NOW() - INTERVAL 1 DAY) AS calls_24h,
              (SELECT COUNT(*) FROM api_call_log l WHERE l.client_id = c.id AND l.created_at > NOW() - INTERVAL 1 DAY AND l.status_code >= 400) AS failures_24h,
              (SELECT MAX(l.created_at) FROM api_call_log l WHERE l.client_id = c.id) AS last_call_at,
              (SELECT CONCAT(l.status_code, ' ', l.method, ' ', l.path) FROM api_call_log l WHERE l.client_id = c.id AND l.status_code >= 400 ORDER BY l.id DESC LIMIT 1) AS last_failure,
              (SELECT COUNT(*) FROM cases k WHERE k.source_api_client_id = c.id) AS cases_created
         FROM api_clients c WHERE c.org_id = ? ORDER BY c.status = 'active' DESC, c.name`, [orgId]);
    const [sites] = await pool.execute('SELECT id, name FROM sites WHERE org_id = ? ORDER BY name', [orgId]);
    const [states] = await pool.execute(
      'SELECT id, name, is_closed FROM workflow_states WHERE (org_id = ? OR org_id IS NULL) AND is_active = 1 ORDER BY name', [orgId]);
    res.json({ clients: clients.map(c => ({ ...c, scopes: Array.isArray(c.scopes) ? c.scopes : JSON.parse(c.scopes || '[]') })), sites, states, allowed_scopes: ALLOWED_API_SCOPES });
  } catch (err) { res.status(500).json({ error: 'Could not load API connections.' }); }
});

router.put('/api/admin/api-clients/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT * FROM api_clients WHERE id = ?', [req.params.id]);
    if (!client || (!hasGlobalAdminScope(req.user) && Number(client.org_id) !== Number(req.user.orgId))) {
      return res.status(404).json({ error: 'Connection not found.' });
    }
    const siteId = req.body.default_site_id ? Number(req.body.default_site_id) : null;
    const statusId = req.body.initial_status_id ? Number(req.body.initial_status_id) : null;
    if (siteId) {
      const [[site]] = await pool.execute('SELECT id FROM sites WHERE id = ? AND org_id = ?', [siteId, client.org_id]);
      if (!site) return res.status(400).json({ error: 'That site does not belong to this organisation.' });
    }
    if (statusId) {
      const [[st]] = await pool.execute('SELECT id, is_closed FROM workflow_states WHERE id = ? AND (org_id = ? OR org_id IS NULL) AND is_active = 1', [statusId, client.org_id]);
      if (!st) return res.status(400).json({ error: 'That status is not available to this organisation.' });
      if (Number(st.is_closed) === 1) return res.status(400).json({ error: 'A new case cannot start in a status that closes the case.' });
    }
    const status = ['active', 'revoked'].includes(req.body.status) ? req.body.status : client.status;
    await pool.execute('UPDATE api_clients SET default_site_id = ?, initial_status_id = ?, status = ? WHERE id = ?',
      [siteId, statusId, status, client.id]);
    if (status === 'revoked' && client.status !== 'revoked') {
      // Switching a connection off ends its current access at once, not when its hour-long token runs out.
      await pool.execute('UPDATE api_tokens SET revoked = 1 WHERE client_id = ?', [client.id]);
    }
    await writeAuditLog(req.user.userId, req.user.email, 'UPDATE', 'api_client', client.id, {
      before: { default_site_id: client.default_site_id, initial_status_id: client.initial_status_id, status: client.status },
      after: { default_site_id: siteId, initial_status_id: statusId, status },
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Could not save the connection.' }); }
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
// Bridge row 4: what changed among THIS connection's cases since a point in time —
// one call instead of one per case. `closed` is the state's fixed marker, not a
// guess from its name, so a renamed state and a reopened case both come through.
// Paged by (updated_at, id); times are UTC 'YYYY-MM-DD HH:MM:SS'. Registered before
// '/api/v1/cases/:id' so 'changes' is not read as a case id.
router.get('/api/v1/cases/changes', scopeGuard('cases:read'), async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
  const since = typeof req.query.since === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(req.query.since) ? req.query.since : null;
  if (req.query.since && !since) return res.status(400).json({ error: "since must be 'YYYY-MM-DD HH:MM:SS' (UTC)." });
  const afterId = Math.max(parseInt(req.query.after_id, 10) || 0, 0);
  const [rows] = await pool.execute(
    `SELECT c.id, c.case_number, ws.name AS status, COALESCE(ws.is_closed, 0) AS closed,
            DATE_FORMAT(c.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
      WHERE c.org_id = ? AND c.source_api_client_id = ? AND c.is_deleted = 0
        -- A change stamped in the future (a writer on the wrong clock) is not handed out
        -- until its time comes: otherwise the caller's checkpoint jumps ahead of now and
        -- every real change after it is skipped, with no error anywhere.
        AND c.updated_at <= NOW() + INTERVAL 1 MINUTE
        ${since ? 'AND (c.updated_at > ? OR (c.updated_at = ? AND c.id > ?))' : ''}
      ORDER BY c.updated_at ASC, c.id ASC
      LIMIT ${limit + 1}`,
    since ? [req.apiClient.org_id, req.apiClient.id, since, since, afterId] : [req.apiClient.org_id, req.apiClient.id]
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  res.json({
    changes: page.map(r => ({ id: r.id, case_number: r.case_number, status: r.status, closed: !!Number(r.closed), updated_at: r.updated_at })),
    has_more: rows.length > limit,
    next: last ? { since: last.updated_at, after_id: last.id } : null,
  });
});

// Bridge row 4: a connection claims the cases it created before MIMS recorded which
// connection created each case. The portal stores the MIMS id of every case it made,
// so it sends that list once; only cases in this organisation with no recorded
// creator are claimed, and updated_at is left alone.
router.post('/api/v1/cases/claim', scopeGuard('cases:write'), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 1000) : [];
  if (!ids.length) return res.status(400).json({ error: 'ids must be a list of case ids (at most 1000).' });
  const [r] = await pool.execute(
    `UPDATE cases SET source_api_client_id = ?, source_reference = COALESCE(source_reference, case_number), updated_at = updated_at
      WHERE org_id = ? AND source_api_client_id IS NULL AND id IN (${ids.map(() => '?').join(',')})`,
    [req.apiClient.id, req.apiClient.org_id, ...ids]);
  res.json({ claimed: r.affectedRows, sent: ids.length });
});

router.get('/api/v1/cases/:id', scopeGuard('cases:read'), async (req, res) => {
  const [[row]] = await pool.execute(
    `SELECT c.id, c.case_number, c.case_type, ws.name AS status, COALESCE(ws.is_closed, 0) = 1 AS closed, c.priority, c.created_at, c.updated_at
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
      WHERE c.id = ? AND c.org_id = ? AND c.is_deleted = 0
      LIMIT 1`,
    [req.params.id, req.apiClient.org_id]
  );
  if (!row) return res.status(404).json({ error: 'Case not found.' });
  res.json(row);
});

// CPPM-11: remove the reporter's identity from a case, keeping the case itself.
// The source portal calls this when a person exercises their right to erasure:
// the safety record is retained (pharmacovigilance legal obligation) and only
// the identifying reporter fields are blanked. reporter_type, country and
// specialty stay — they are case content, not identity — and nothing else on
// the case (patient, AE/PC detail, attachments, workflow) is touched.
// Org-scoped by the API key exactly like the routes above, and idempotent: a
// repeat call on an already-redacted case succeeds and changes nothing.
router.post('/api/v1/cases/:id/redact-reporter', scopeGuard('cases:write'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [[c]] = await conn.execute(
      'SELECT id FROM cases WHERE id = ? AND org_id = ? AND is_deleted = 0 LIMIT 1',
      [req.params.id, req.apiClient.org_id]
    );
    if (!c) return res.status(404).json({ error: 'Case not found.' });

    await conn.beginTransaction();
    // Whether any identity is still there, so a repeat call logs no second removal.
    const [[{ present }]] = await conn.execute(
      `SELECT (SELECT COUNT(*) FROM case_reporter WHERE case_id = ?
                 AND COALESCE(first_name, last_name, email, phone, organisation) IS NOT NULL)
            + (SELECT COUNT(*) FROM case_contacts WHERE case_id = ? AND contact_role = 'reporter'
                 AND COALESCE(first_name, last_name, email, phone, address, institution) IS NOT NULL) AS present`,
      [c.id, c.id]
    );
    // Intake records the reporter twice: case_reporter (the intake record) and
    // case_contacts (what the case screen shows). Both carry the identity, so
    // both are blanked or the identity survives on screen.
    const [rep] = await conn.execute(
      `UPDATE case_reporter
          SET first_name = NULL, last_name = NULL, email = NULL, phone = NULL, organisation = NULL
        WHERE case_id = ?`,
      [c.id]
    );
    const [con] = await conn.execute(
      `UPDATE case_contacts
          SET first_name = NULL, last_name = NULL, email = NULL, phone = NULL, address = NULL, institution = NULL
        WHERE case_id = ? AND contact_role = 'reporter'`,
      [c.id]
    );
    // Part 11: the removal goes into the case's own history, in this transaction —
    // writeCaseAudit re-throws inside one, so no audit row means no redaction. The
    // actor is the API client, not a person (user_id 0). The erased values are
    // deliberately not kept as old_value: that would undo the erasure (Vasu, CCO).
    if (present > 0) {
      await writeCaseAudit(c.id, 0, `API client: ${req.apiClient.name} (#${req.apiClient.id})`,
        'REPORTER_IDENTITY_REDACTED', 'reporter_identity', null,
        "removed on the source portal's erasure request", conn);
    }
    await conn.commit();
    // Counts are rows MATCHED (the pool runs with FOUND_ROWS), so they are the
    // same on a repeat call — the caller reads them as "a reporter row exists",
    // never as "something changed this time".
    res.json({ id: c.id, redacted: true, reporter_rows: rep.affectedRows, contact_rows: con.affectedRows });
  } catch (err) {
    await conn.rollback().catch(() => {});
    res.status(500).json({ error: 'Failed to redact the reporter identity.' });
  } finally {
    conn.release();
  }
});

// 'YYYY-MM-DD', a real calendar date, not in the future (one day of slack for
// time zones). Anything else → null.
function parseAwarenessDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  if (d.getTime() > Date.now() + 86400000) return null;
  return value;
}

// Longest value each intake field can hold. The database runs in strict mode, so a
// longer value used to make the whole case fail — a safety report lost because
// someone typed a long phone number. It is now shortened to fit, and the full value
// is written into the case history so nothing the person sent is lost.
const INTAKE_LIMITS = {
  priority: 20,
  'reporter.first_name': 100, 'reporter.last_name': 100, 'reporter.email': 255, 'reporter.phone': 50,
  'reporter.reporter_type': 50, 'reporter.country': 100, 'reporter.organisation': 255,
  'patient.initials': 20, 'patient.age_unit': 20, 'patient.gender': 20,
  'ae_intake.suspect_drug_name': 255, 'ae_intake.batch_lot_number': 100, 'ae_intake.dose': 100,
  'ae_intake.route_of_admin': 100, 'ae_intake.outcome': 100,
  'pc_intake.product_name': 255, 'pc_intake.batch_lot_number': 100, 'pc_intake.complaint_category': 100,
  'mi_intake.mi_category': 255,
};

function fitIntakeToLimits(body) {
  const shortened = [];
  for (const [path, max] of Object.entries(INTAKE_LIMITS)) {
    const [a, b] = path.split('.');
    const holder = b ? body[a] : body;
    const key = b || a;
    if (!holder || typeof holder !== 'object' || holder[key] == null) continue;
    const full = String(holder[key]);
    if (full.length <= max) continue;
    holder[key] = full.slice(0, max);
    shortened.push({ path, full, kept: holder[key] });
  }
  return shortened;
}

// A failed intake tells the sending system why, without exposing the database: the
// full error goes to the MIMS log under the request number the caller is given.
function intakeFailure(err, req, what) {
  logger.error({ err, request_id: req.id || null, api_client_id: req.apiClient?.id || null }, what);
  return { error: `${what} MIMS log reference: ${req.id || 'none'}.`, request_id: req.id || null };
}

router.post('/api/v1/cases', scopeGuard('cases:write'), async (req, res) => {
  // org is always resolved from the API key — never from the request body — so a
  // client can only ever create a case in its own organisation (cross-tenant safe).
  const orgId = req.apiClient.org_id;
  const shortened = fitIntakeToLimits(req.body || {});
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Bridge row 6: the connection's own site and starting status when set; else the
    // first site, and the state named "New" (the organisation's, else the platform's).
    // Before, every case went to the first site and the first state by id — "Email Intake".
    const [[site]] = await conn.execute(
      `SELECT id FROM sites WHERE org_id = ? ORDER BY (id = ?) DESC, id ASC LIMIT 1`,
      [orgId, req.apiClient.default_site_id || 0]);
    if (!site?.id) { await conn.rollback(); return res.status(400).json({ error: 'No site is configured for this organisation.' }); }
    const [[state]] = await conn.execute(
      `SELECT id FROM workflow_states WHERE (org_id = ? OR org_id IS NULL) AND is_active = 1
        ORDER BY (id = ?) DESC, (LOWER(name) = 'new') DESC, org_id IS NULL ASC, id ASC LIMIT 1`,
      [orgId, req.apiClient.initial_status_id || 0]);

    const caseType = ['MI', 'AE', 'PC'].includes(req.body.case_type) ? req.body.case_type : 'MI';
    // Intake data is captured at the MINIMUM at the source portal; MIMS triage
    // completes the regulated fields. Values are stored as received (no strict
    // picklist rejection) so a valid submission is never dropped at the boundary.
    const intakeChannel = String(req.body.intake_channel || 'api').slice(0, 50);
    // T1: the source reference (e.g. CP-0000NN) is kept as given and is the case
    // number where that number is free, so the case can be found by it in MIMS.
    const reference = req.body.reference ? String(req.body.reference).slice(0, 100) : null;
    const desc = req.body.description || req.body.subject || null;
    const priority = req.body.priority || 'normal';
    // CPPM-18: when the report first reached the company, per the source portal
    // (e.g. the day a person reported it in chat, not the day a reviewer
    // confirmed it). It starts the regulatory clock on the awareness basis
    // (haClockService). date_received stays the day MIMS received the case.
    // Missing, malformed or future dates are ignored, so the clock falls back to
    // date_received exactly as before — an intake is never rejected for this.
    const awarenessDate = parseAwarenessDate(req.body.awareness_date);
    if (req.body.awareness_date && !awarenessDate) {
      console.warn(`[api/v1/cases] ignored invalid awareness_date for ${reference || 'unreferenced case'}`);
    }

    // R2 + bridge row 5: a repeated push of the same report must not create a second
    // case — and a DIFFERENT sender using the same reference must not be handed this
    // one. A case is the same report only if this connection sent it with this
    // reference.
    if (reference) {
      const [[existing]] = await conn.execute(
        'SELECT id FROM cases WHERE source_api_client_id = ? AND source_reference = ? AND is_deleted = 0 LIMIT 1',
        [req.apiClient.id, reference]
      );
      if (existing) {
        await conn.commit();
        return res.status(200).json({ id: existing.id, idempotent: true });
      }
      // Created by this connection before MIMS recorded who created a case: same
      // number, no recorded creator, same intake channel. Claimed, then treated as ours.
      const [[legacy]] = await conn.execute(
        `SELECT id FROM cases WHERE org_id = ? AND case_number = ? AND source_api_client_id IS NULL
            AND intake_channel = ? AND is_deleted = 0 LIMIT 1`,
        [orgId, reference, intakeChannel]
      );
      if (legacy) {
        await conn.execute(
          'UPDATE cases SET source_api_client_id = ?, source_reference = ?, updated_at = updated_at WHERE id = ?',
          [req.apiClient.id, reference, legacy.id]);
        await conn.commit();
        return res.status(200).json({ id: legacy.id, idempotent: true });
      }
    }

    // The case number is the reference where free in this organisation; where another
    // source already uses it, the first free of REF-2, REF-3 … (the reference itself is
    // still kept as given, in source_reference).
    let caseNumber = reference;
    if (reference) {
      for (let n = 2; n <= 50; n++) {
        const [[taken]] = await conn.execute('SELECT id FROM cases WHERE org_id = ? AND case_number = ? LIMIT 1', [orgId, caseNumber]);
        if (!taken) break;
        caseNumber = `${reference.slice(0, 95)}-${n}`;
      }
    }

    let result;
    try {
      [result] = await conn.execute(
        `INSERT INTO cases (org_id, site_id, case_type, intake_channel, date_received, awareness_date, case_number, description, status_id, priority, created_by, source_api_client_id, source_reference)
         VALUES (?, ?, ?, ?, CURRENT_DATE, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [orgId, site.id, caseType, intakeChannel, awarenessDate, caseNumber, desc, state?.id || null, priority, req.apiClient.id, reference]
      );
    } catch (err) {
      // Race: the same report pushed twice at once — the second loses on the
      // (connection, reference) key and gets the first one's case.
      if (err.code === 'ER_DUP_ENTRY' && reference) {
        const [[dup]] = await conn.execute(
          'SELECT id FROM cases WHERE source_api_client_id = ? AND source_reference = ? AND is_deleted = 0 LIMIT 1',
          [req.apiClient.id, reference]
        );
        if (dup) { await conn.commit(); return res.status(200).json({ id: dup.id, idempotent: true }); }
      }
      throw err;
    }
    const caseId = result.insertId;

    // A reporter whose type the source did not say stays untyped. It was recorded as
    // 'HCP' — a qualification nobody stated, on a record where it changes how a
    // safety report is assessed (see migration 110 for the same rule at New Case).
    const reporter = req.body.reporter;
    if (reporter && typeof reporter === 'object') {
      await conn.execute(
        `INSERT INTO case_reporter (case_id, first_name, last_name, email, phone, reporter_type, country, organisation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [caseId, reporter.first_name || null, reporter.last_name || null, reporter.email || null,
         reporter.phone || null, reporter.reporter_type || null, reporter.country || null, reporter.organisation || null]
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
        [caseId, reporter.first_name || null, reporter.last_name || null, 'Reporter', reporter.reporter_type || null, reporter.phone || null, reporter.email || null]
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

    // Bridge row 6: the case's own history says where it came from.
    const apiActor = `API client: ${req.apiClient.name} (#${req.apiClient.id})`;
    await writeCaseAudit(caseId, 0, apiActor, 'CASE_CREATED_VIA_API', 'source_reference', null,
      `${reference || '(no reference)'} — created from ${req.apiClient.name}`, conn);

    // Bridge row 6: a report raised from an earlier one (a side effect confirmed from an
    // enquiry) is linked to that case both ways, so either case shows the other.
    if (req.body.related_reference) {
      const [[related]] = await conn.execute(
        'SELECT id, case_number FROM cases WHERE source_api_client_id = ? AND source_reference = ? AND is_deleted = 0 LIMIT 1',
        [req.apiClient.id, String(req.body.related_reference).slice(0, 100)]);
      if (related) {
        const note = `Raised from ${req.body.related_reference} on ${req.apiClient.name}`;
        await conn.execute(
          `INSERT IGNORE INTO case_links (case_id, linked_case_id, link_type, created_by, notes) VALUES (?, ?, 'related', NULL, ?), (?, ?, 'related', NULL, ?)`,
          [caseId, related.id, note, related.id, caseId, note]);
        await writeCaseAudit(caseId, 0, apiActor, 'CASE_LINKED', 'linked_case_id', null, related.case_number, conn);
        await writeCaseAudit(related.id, 0, apiActor, 'CASE_LINKED', 'linked_case_id', null, caseNumber, conn);
      }
    }

    for (const s of shortened) {
      await writeCaseAudit(caseId, 0, `API client: ${req.apiClient.name} (#${req.apiClient.id})`,
        'INTAKE_VALUE_SHORTENED', s.path, s.full, s.kept, conn);
    }

    await conn.commit();
    res.status(201).json({ id: caseId, ...(shortened.length ? { shortened: shortened.map(s => s.path) } : {}) });
    // Bridge row 7: an unassigned side-effect or complaint case tells the supervisors.
    notifyIntakeArrival({ orgId, caseId, caseNumber, caseType, sourceName: req.apiClient.name });
  } catch (err) {
    await conn.rollback().catch(() => {});
    res.status(500).json(intakeFailure(err, req, 'Failed to create case.'));
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

    // The sending portal retries a file it could not confirm (a timeout, a crash after
    // MIMS stored it). The same file on the same case is kept once: its fingerprint
    // matches, so the existing attachment is returned instead of a second copy.
    const checksum = attSha256(req.file.buffer);
    const [[same]] = await pool.execute(
      `SELECT id FROM attachments WHERE org_id = ? AND entity_type = 'case' AND entity_id = ? AND checksum_sha256 = ? LIMIT 1`,
      [req.apiClient.org_id, c.id, checksum]
    );
    if (same) return res.status(200).json({ id: same.id, idempotent: true });

    const ext = (String(req.file.originalname || '').match(/\.[a-z0-9]+$/i) || [''])[0];
    const key = storage.generateKey(ext);
    const stored = await storage.put({ orgId: req.apiClient.org_id, key, body: req.file.buffer, contentType: req.file.mimetype });

    const [result] = await pool.execute(
      `INSERT INTO attachments
         (org_id, entity_type, entity_id, storage_provider, storage_key,
          original_name, mime_type, size_bytes, checksum_sha256, uploaded_by, ocr_status)
       VALUES (?, 'case', ?, ?, ?, ?, ?, ?, ?, NULL, 'skipped')`,
      [req.apiClient.org_id, c.id, stored.provider, stored.key,
       String(req.file.originalname || '').slice(0, 255), req.file.mimetype, req.file.size, checksum]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json(intakeFailure(err, req, 'Failed to store attachment.'));
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

// T16 — read a `product_dictionary` table that does not exist, and the catch
// turned the error into 200 + zero rows: a client read it as "no products"
// (same trap as PAUD-3 contacts below). The org's products live in `products`.
router.get('/api/v1/products', scopeGuard('products:read'), async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, trade_name AS product_name, mah, dosage, atc_code, authorization_country, is_active
       FROM products WHERE org_id = ? ORDER BY trade_name ASC LIMIT 100`,
    [req.apiClient.org_id]
  );
  res.json({ rows });
});

// PAUD-3 item 9 — was a hardcoded empty array behind a scope guard, so a client
// got 200 + zero rows and read it as "we have no contacts".
// Columns are listed explicitly rather than SELECT *: `notes` is unbounded free
// text and `do_not_update_master` is an internal flag, neither belongs on an
// external API surface.
router.get('/api/v1/contacts', scopeGuard('contacts:read'), async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, type, specialty, first_name, last_name, email, phone,
            institution, address, org_id, site_id, is_active, created_at, updated_at
       FROM contacts
      WHERE org_id = ? AND is_active = 1
      ORDER BY last_name ASC, first_name ASC
      LIMIT 100`,
    [req.apiClient.org_id]
  );
  res.json({ rows });
});
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
// PAUD-3 item 9 — deliberately 501, not an empty 200. Which table backs a
// client-facing document list is an open question (backend/routes/admin/documents.js
// is case attachments, not content-management documents), and returning a
// confident empty array while we do not know is how the original defect read.
router.get('/api/v1/content/documents', scopeGuard('content:read'), async (_req, res) =>
  res.status(501).json({
    error: 'Not implemented.',
    detail: 'Document listing is not yet available on the public API. Contact your Pharaxis representative.',
  })
);

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
