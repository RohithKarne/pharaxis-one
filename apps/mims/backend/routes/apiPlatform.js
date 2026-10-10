'use strict';

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { hasGlobalAdminScope } = require('../utils/adminScope');
const { assertPublicHttpUrl } = require('../utils/ssrfGuard');
const { issueClientCredentials, createApiClient, rotateClientSecret } = require('../services/api-platform/tokenIssuer');

// Scopes a client may be granted. '*'/unknown scopes are rejected. (H-04)
const ALLOWED_API_SCOPES = ['cases:read', 'cases:write', 'webhooks:read', 'webhooks:write'];
const { apiKeyAuth } = require('../services/api-platform/apiKeyAuth');
const { scopeGuard } = require('../services/api-platform/scopeGuard');
const { publicApiRateLimiter } = require('../services/api-platform/rateLimiter');
const { signPayload } = require('../services/api-platform/webhookDispatcher');
const { deliverPendingWebhooks } = require('../services/api-platform/webhookDeliveryWorker');
const { buildOpenApiYaml } = require('../services/api-platform/openapiSpec');
const { reportFingerprint } = require('../services/api-platform/reportFingerprint');
const multer = require('multer');
const storage = require('../services/fileStorageService');
const { validateUpload } = require('../middleware/uploadValidation');
const { writeCaseAudit, writeAuditLog } = require('../services/caseHelpers');
const { logger } = require('../services/logger');
const { notifyIntakeArrival } = require('../services/intakeAlertService');
const { eraseReporterIdentity } = require('../services/reporterErasureService');

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
              CASE WHEN c.previous_secret_expires_at > NOW() THEN c.previous_secret_expires_at END AS previous_secret_expires_at,
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

// Bridge plan P7: a new secret for a connection without creating a new connection
// (which would orphan every case the old one sent). The old secret keeps working
// for 7 days; tokens already issued run out within the hour as usual.
router.post('/api/admin/api-clients/:id/new-secret', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT id, org_id, name, status FROM api_clients WHERE id = ?', [req.params.id]);
    if (!client || (!hasGlobalAdminScope(req.user) && Number(client.org_id) !== Number(req.user.orgId))) {
      return res.status(404).json({ error: 'Connection not found.' });
    }
    if (client.status !== 'active') return res.status(400).json({ error: 'Switch the connection on before giving it a new secret.' });
    const rotated = await rotateClientSecret(client.id);
    await writeAuditLog(req.user.userId, req.user.email, 'SECRET_ROTATED', 'api_client', client.id,
      { previous_secret_works_until: rotated.previous_secret_expires_at });
    res.json(rotated);
  } catch (err) { res.status(500).json({ error: 'Could not issue a new secret.' }); }
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
// Bridge plan P4: a case this connection created that MIMS merged into another is
// followed to the case that absorbed it (up to three merges), within the organisation.
// Returns the live case and, when it is not the one asked for, the merged-away case;
// null when the case is not this connection's, or was deleted without a merge.
async function ownCaseOrSurvivor(db, caseId, apiClient) {
  const [[asked]] = await db.execute(
    'SELECT id, case_number, is_deleted, merged_into_case_id FROM cases WHERE id = ? AND org_id = ? AND source_api_client_id = ? LIMIT 1',
    [caseId, apiClient.org_id, apiClient.id]);
  let cur = asked;
  for (let hop = 0; cur && Number(cur.is_deleted) === 1 && hop < 3; hop++) {
    if (!cur.merged_into_case_id) return null;
    [[cur]] = await db.execute(
      'SELECT id, case_number, is_deleted, merged_into_case_id FROM cases WHERE id = ? AND org_id = ? LIMIT 1',
      [cur.merged_into_case_id, apiClient.org_id]);
  }
  if (!cur || Number(cur.is_deleted) === 1) return null;
  return { id: cur.id, case_number: cur.case_number, mergedFrom: cur.id === asked.id ? null : asked };
}

// Bridge feature F4: what this MIMS understands, so the portal's connection test can say
// when the two sides are out of step. Under /api/v1/cases so bridge-only mode serves it.
const BRIDGE_VERSION = 2;
router.get('/api/v1/cases/bridge', scopeGuard('cases:read'), (req, res) => {
  res.json({ bridge_version: BRIDGE_VERSION, features: ['serious', 'journey', 'reporter_questions', 'possible_duplicates', 'dry_run'] });
});

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
  // Bridge plan P4: deleted cases come through too. One merged into another case is
  // reported under its own id with the state, owner and answer of the case that
  // absorbed it (up to two merges), and changes when either case changes. One deleted
  // without a merge is reported as removed. Before, both simply vanished from this
  // list and the portal request waited "with the medical team" for good.
  const [rows] = await pool.execute(
    `SELECT x.*, DATE_FORMAT(x.changed_at, '%Y-%m-%d %H:%i:%s') AS updated_at FROM (
       SELECT c.id, c.case_number, c.is_deleted, live.id AS live_id, live.case_number AS live_number,
              ws.name AS status, COALESCE(ws.is_closed, 0) AS closed,
              GREATEST(c.updated_at, COALESCE(live.updated_at, c.updated_at)) AS changed_at,
              COALESCE(live.case_owner_id, c.case_owner_id) IS NOT NULL AS owner_assigned,
              c.reporter_erased_at IS NOT NULL AS reporter_erased,
              COALESCE(live.id, c.id) AS work_id, COALESCE(live.case_type, c.case_type) AS case_type,
              -- Bridge feature F1: when somebody first took the case on.
              (SELECT DATE_FORMAT(MIN(t.timestamp), '%Y-%m-%d %H:%i:%s') FROM case_audit_trail t
                WHERE t.case_id = COALESCE(live.id, c.id) AND t.field_name = 'case_owner_id' AND t.new_value IS NOT NULL) AS triaged_at,
              -- Bridge row 8: the latest answer that has gone out (never a draft, a voided
              -- or a superseded one), and whether it was addressed to the person who
              -- reported — only then does its text travel back to them.
              (SELECT r.id FROM case_mi_responses r
                WHERE r.case_id = COALESCE(live.id, c.id) AND r.response_status = 'SENT' AND r.voided_at IS NULL AND r.superseded_by_id IS NULL
                ORDER BY r.sent_at DESC, r.id DESC LIMIT 1) AS answer_id
         FROM cases c
         LEFT JOIN cases s1 ON c.is_deleted = 1 AND s1.id = c.merged_into_case_id AND s1.org_id = c.org_id
         LEFT JOIN cases s2 ON s1.is_deleted = 1 AND s2.id = s1.merged_into_case_id AND s2.org_id = c.org_id
         LEFT JOIN cases live ON live.id = CASE WHEN s1.is_deleted = 0 THEN s1.id WHEN s2.is_deleted = 0 THEN s2.id END
         LEFT JOIN workflow_states ws ON ws.id = COALESCE(live.status_id, c.status_id)
        WHERE c.org_id = ? AND c.source_api_client_id = ?
     ) x
      -- A change stamped in the future (a writer on the wrong clock) is not handed out
      -- until its time comes: otherwise the caller's checkpoint jumps ahead of now and
      -- every real change after it is skipped, with no error anywhere.
      WHERE x.changed_at <= NOW() + INTERVAL 1 MINUTE
        ${since ? 'AND (x.changed_at > ? OR (x.changed_at = ? AND x.id > ?))' : ''}
      ORDER BY x.changed_at ASC, x.id ASC
      LIMIT ${limit + 1}`,
    since ? [req.apiClient.org_id, req.apiClient.id, since, since, afterId] : [req.apiClient.org_id, req.apiClient.id]
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const answers = {};
  const answerIds = [...new Set(page.map(r => r.answer_id).filter(Boolean))];
  if (answerIds.length) {
    const [ans] = await pool.execute(
      `SELECT r.id, r.response_text, r.response_body_html, r.response_subject, r.recipient_email,
              DATE_FORMAT(r.sent_at, '%Y-%m-%d %H:%i:%s') AS sent_at
         FROM case_mi_responses r WHERE r.id IN (${answerIds.map(() => '?').join(',')})`, answerIds);
    const answerById = Object.fromEntries(ans.map(a => [a.id, a]));
    // The person who reported is the one on the portal's own case, also when the
    // answer was written on the case it was merged into (bridge plan P4).
    const [reporters] = await pool.execute(
      `SELECT case_id, email FROM case_reporter WHERE case_id IN (${page.map(() => '?').join(',')}) ORDER BY id DESC`, page.map(r => r.id));
    const reporterOf = Object.fromEntries(reporters.map(o => [o.case_id, o.email]));
    for (const r of page) {
      const a = answerById[r.answer_id];
      if (!a) continue;
      const reporterEmail = reporterOf[r.id];
      const toReporter = !!a.recipient_email && !!reporterEmail
        && a.recipient_email.trim().toLowerCase() === reporterEmail.trim().toLowerCase();
      const text = a.response_text || String(a.response_body_html || '')
        .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      answers[r.id] = { id: a.id, sent_at: a.sent_at, to_reporter: toReporter, subject: a.response_subject || null, text: toReporter ? text : null };
    }
  }
  // Bridge feature F2: a side effect reported as serious, and the day it must reach the
  // authorities by (the same clock as the case's hand-off deadline).
  const clocks = {};
  const { computeAeHandoffClock } = require('../services/caseGovernanceService');
  for (const r of page.filter(x => x.case_type === 'AE' && !(Number(x.is_deleted) && !x.live_id))) {
    try {
      const clock = await computeAeHandoffClock(r.work_id);
      clocks[r.id] = { serious: clock.priority !== 'standard', due: clock.priority !== 'standard' ? clock.dueDate : null };
    } catch (err) {
      logger.error({ err, case_id: r.work_id }, 'change feed: hand-off clock could not be read');
    }
  }
  // Bridge feature F3: questions for the reporter, on the case the work happens on.
  // None travel once the reporter's identity is erased: there is nobody left to ask.
  const questionsOf = {};
  const workIds = [...new Set(page.filter(r => !Number(r.reporter_erased)).map(r => r.work_id))];
  if (workIds.length) {
    const [qs] = await pool.execute(
      `SELECT id, case_id, question, DATE_FORMAT(asked_at, '%Y-%m-%d %H:%i:%s') AS asked_at,
              DATE_FORMAT(answered_at, '%Y-%m-%d %H:%i:%s') AS answered_at, withdrawn_at IS NOT NULL AS withdrawn
         FROM case_reporter_questions WHERE case_id IN (${workIds.map(() => '?').join(',')}) ORDER BY id ASC`, workIds);
    for (const q of qs) (questionsOf[q.case_id] = questionsOf[q.case_id] || []).push(
      { id: q.id, question: q.question, asked_at: q.asked_at, answered_at: q.answered_at, withdrawn: !!Number(q.withdrawn) });
  }
  res.json({
    changes: page.map(r => ({
      id: r.id, case_number: r.case_number, status: r.status, closed: !!Number(r.closed), updated_at: r.updated_at,
      owner_assigned: !!Number(r.owner_assigned), answer: answers[r.id] || null,
      // Bridge row 10: the reporter's identity has been erased on this case.
      reporter_erased: !!Number(r.reporter_erased),
      triaged_at: r.triaged_at || null,
      ...(clocks[r.id] ? { serious: clocks[r.id].serious, report_due_date: clocks[r.id].due } : {}),
      questions: Number(r.reporter_erased) ? [] : (questionsOf[r.work_id] || []),
      ...(r.live_id ? { merged_into: { id: r.live_id, case_number: r.live_number } } : {}),
      ...(Number(r.is_deleted) && !r.live_id ? { removed: true, closed: true } : {}),
    })),
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

// Bridge plan P6: the sending portal checks its list against MIMS. It sends the key
// and fingerprint of each report it believes MIMS holds; MIMS answers which keys it
// has no case for at all (lost — the portal sends those again) and which it holds
// from a different version. Only this connection's cases count; a merged or deleted
// case is not missing, because the change list already tells the portal about it.
router.post('/api/v1/cases/reconcile', scopeGuard('cases:read'), async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 1001) : [];
  if (!items.length || items.length > 1000) return res.status(400).json({ error: 'items must be a list of 1 to 1000 reports.' });
  const wanted = new Map();
  for (const it of items) {
    const key = typeof it?.key === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(it.key) ? it.key : null;
    if (!key) return res.status(400).json({ error: 'Each item needs the key the report was sent with.' });
    wanted.set(key, typeof it.fingerprint === 'string' ? it.fingerprint.toLowerCase() : null);
  }
  try {
    const keys = [...wanted.keys()];
    const [rows] = await pool.execute(
      `SELECT id, case_number, source_key, source_fingerprint FROM cases
        WHERE org_id = ? AND source_api_client_id = ? AND source_key IN (${keys.map(() => '?').join(',')})`,
      [req.apiClient.org_id, req.apiClient.id, ...keys]);
    const held = new Map(rows.map(r => [r.source_key, r]));
    const missing = keys.filter(k => !held.has(k));
    const different = [];
    for (const [key, fp] of wanted) {
      const r = held.get(key);
      if (r && fp && r.source_fingerprint && r.source_fingerprint !== fp) different.push({ key, id: r.id, case_number: r.case_number });
    }
    res.json({ checked: keys.length, missing, different });
  } catch (err) {
    res.status(500).json(intakeFailure(err, req, 'Failed to compare the reports.'));
  }
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
    // Only a case this connection created, as for follow-ups: another system in the
    // same organisation could erase the reporter on a portal case, recorded as the
    // portal's own erasure request. A merged or deleted case too (bridge plan P4): it
    // still holds the reporter's name and contact details, and a merge does not move them.
    const [[c]] = await conn.execute(
      'SELECT id FROM cases WHERE id = ? AND org_id = ? AND source_api_client_id = ? LIMIT 1',
      [req.params.id, req.apiClient.org_id, req.apiClient.id]
    );
    if (!c) return res.status(404).json({ error: 'Case not found.' });

    await conn.beginTransaction();
    const { reporter_rows, contact_rows } = await eraseReporterIdentity(conn, c.id, {
      userId: 0, userName: `API client: ${req.apiClient.name} (#${req.apiClient.id})`,
      note: "removed on the source portal's erasure request",
    });
    await conn.commit();
    // Counts are rows MATCHED (the pool runs with FOUND_ROWS), so they are the
    // same on a repeat call — the caller reads them as "a reporter row exists",
    // never as "something changed this time".
    res.json({ id: c.id, redacted: true, reporter_rows, contact_rows });
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

// Bridge plan P2 (decision 1, option A): the reporter's own seriousness answer ticks
// the matching criteria, recorded as reported and to be confirmed at triage, and a
// serious report starts at high priority. The portal offers Death, Life-threatening,
// Hospitalization, Disability, Congenital anomaly, Other and None of these.
const SERIOUSNESS_WORDS = [
  [/death|died|fatal/i, 'is_death'],
  [/life[\s-]*threat/i, 'is_life_threatening'],
  [/hospital/i, 'is_hospitalization'],
  [/disab|incapacit/i, 'is_disability'],
  [/congenital|birth defect/i, 'is_congenital_anomaly'],
  [/^other\b|medically important/i, 'is_other_medically_important'],
];
function reportedSeriousness(ae) {
  const raw = ae && typeof ae === 'object' ? ae.seriousness_reported : null;
  if (raw == null) return null;
  const answers = (Array.isArray(raw) ? raw : String(raw).split(/[\n,;]+/)).map(s => String(s).trim()).filter(Boolean);
  if (!answers.length) return null;
  const flags = {};
  for (const a of answers) for (const [re, key] of SERIOUSNESS_WORDS) if (re.test(a)) flags[key] = 1;
  if (Object.keys(flags).length) flags.is_serious = 1;
  const unmatched = answers.filter(a => !/^none\b/i.test(a) && !SERIOUSNESS_WORDS.some(([re]) => re.test(a)));
  return { text: answers.join(', ').slice(0, 500), flags, unmatched };
}

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
  // Bridge plan P5: the fingerprint of the report as it arrived, taken before anything
  // is shortened. A sender that gives its own value must match it, or the report
  // changed on the way and is refused rather than stored.
  const fingerprint = reportFingerprint(req.body);
  if (req.body?.payload_sha256 && String(req.body.payload_sha256).toLowerCase() !== fingerprint) {
    return res.status(400).json({ error: 'The report changed on its way to MIMS: its fingerprint does not match. Send it again.' });
  }
  const shortened = fitIntakeToLimits(req.body || {});
  // Bridge feature F4: ?dry_run=1 does everything a real report does and then undoes
  // it, so a portal's connection test proves its reports would land, without a case.
  const dryRun = req.query.dry_run === '1';
  // Bridge feature F1: the request's own page on the sending portal, opened from the case.
  const sourceLink = typeof req.body?.source_link === 'string' && /^https?:\/\/[^\s]{1,490}$/.test(req.body.source_link)
    ? req.body.source_link : null;
  const sourceCanReply = typeof req.body?.reporter_can_reply === 'boolean' ? (req.body.reporter_can_reply ? 1 : 0) : null;
  const conn = await pool.getConnection();
  const finish = () => (dryRun ? conn.rollback() : conn.commit());
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
    const seriousness = caseType === 'AE' ? reportedSeriousness(req.body.ae_intake) : null;
    if (seriousness) Object.assign(req.body.ae_intake, seriousness.flags);
    const priority = req.body.priority || (seriousness?.flags.is_serious ? 'high' : 'normal');
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
    // case — and a DIFFERENT report must never be handed this one. Post-merge review:
    // the sender's own key decides. A portal set up again on a fresh database (or a
    // second database on the same connection) numbers from the start again, and its new
    // CP-000150 was handed another person's case CP-000150 without any error.
    const sourceKey = typeof req.body.source_key === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(req.body.source_key)
      ? req.body.source_key : null;
    let storedReference = reference;
    let reusedFrom = null;
    if (sourceKey) {
      const [[same]] = await conn.execute(
        'SELECT id, case_number, source_fingerprint FROM cases WHERE source_api_client_id = ? AND source_key = ? AND is_deleted = 0 LIMIT 1',
        [req.apiClient.id, sourceKey]);
      if (same) {
        await finish();
        return res.status(200).json({ id: same.id, case_number: same.case_number, fingerprint: same.source_fingerprint, idempotent: true });
      }
    }
    if (reference) {
      const [[existing]] = await conn.execute(
        `SELECT id, case_number, source_key, source_fingerprint, created_at >= NOW() - INTERVAL 2 HOUR AS recent
           FROM cases WHERE source_api_client_id = ? AND source_reference = ? AND is_deleted = 0 LIMIT 1`,
        [req.apiClient.id, reference]
      );
      // The same report: no key from the sender (as before), or a case from before keys
      // were recorded that is under two hours old — a genuine retry (the portal's own
      // retries finish within about 40 minutes). Anything else carrying a key is a
      // different report that happens to reuse the number.
      if (existing && (!sourceKey || (!existing.source_key && Number(existing.recent)))) {
        if (sourceKey && !existing.source_key) {
          await conn.execute('UPDATE cases SET source_key = ?, updated_at = updated_at WHERE id = ?', [sourceKey, existing.id]);
        }
        await finish();
        return res.status(200).json({ id: existing.id, case_number: existing.case_number, fingerprint: existing.source_fingerprint, idempotent: true });
      }
      // A case deleted in MIMS still holds its reference under the unique key, so a
      // report sent again after that deletion (Sync Health › Retry) used to fail with
      // a 500 and could never arrive. It gets the next free suffix like a reused number.
      const [[held]] = existing ? [[existing]] : await conn.execute(
        'SELECT id FROM cases WHERE source_api_client_id = ? AND source_reference = ? LIMIT 1', [req.apiClient.id, reference]);
      if (existing) reusedFrom = existing;
      if (held) {
        // The reference stays unique per connection: the new report keeps it with a suffix.
        for (let n = 2; n <= 50; n++) {
          storedReference = `${reference.slice(0, 95)}~${n}`;
          const [[taken]] = await conn.execute(
            'SELECT id FROM cases WHERE source_api_client_id = ? AND source_reference = ? LIMIT 1', [req.apiClient.id, storedReference]);
          if (!taken) break;
        }
      } else if (!sourceKey) {
        // Created by this connection before MIMS recorded who created a case: same
        // number, no recorded creator, same intake channel. Claimed, then treated as
        // ours. Only for a sender without keys — one with keys sent nothing that old.
        const [[legacy]] = await conn.execute(
          `SELECT id, case_number FROM cases WHERE org_id = ? AND case_number = ? AND source_api_client_id IS NULL
              AND intake_channel = ? AND is_deleted = 0 LIMIT 1`,
          [orgId, reference, intakeChannel]
        );
        if (legacy) {
          await conn.execute(
            'UPDATE cases SET source_api_client_id = ?, source_reference = ?, updated_at = updated_at WHERE id = ?',
            [req.apiClient.id, reference, legacy.id]);
          await finish();
          return res.status(200).json({ id: legacy.id, case_number: legacy.case_number, fingerprint: null, idempotent: true });
        }
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
        `INSERT INTO cases (org_id, site_id, case_type, intake_channel, date_received, awareness_date, case_number, description, status_id, priority, created_by, source_api_client_id, source_reference, source_key, source_fingerprint, source_link, source_can_reply)
         VALUES (?, ?, ?, ?, CURRENT_DATE, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [orgId, site.id, caseType, intakeChannel, awarenessDate, caseNumber, desc, state?.id || null, priority, req.apiClient.id, storedReference, sourceKey, fingerprint, sourceLink, sourceCanReply]
      );
    } catch (err) {
      // Race: the same report pushed twice at once — the second loses on the
      // (connection, key) or (connection, reference) key and gets the first one's case.
      if (err.code === 'ER_DUP_ENTRY' && (sourceKey || reference)) {
        const [[dup]] = await conn.execute(
          sourceKey
            ? 'SELECT id, case_number, source_fingerprint FROM cases WHERE source_api_client_id = ? AND source_key = ? AND is_deleted = 0 LIMIT 1'
            : 'SELECT id, case_number, source_fingerprint FROM cases WHERE source_api_client_id = ? AND source_reference = ? AND is_deleted = 0 LIMIT 1',
          [req.apiClient.id, sourceKey || storedReference]
        );
        if (dup) { await finish(); return res.status(200).json({ id: dup.id, case_number: dup.case_number, fingerprint: dup.source_fingerprint, idempotent: true }); }
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
    let unmatchedProduct = null;
    let matchedProduct = null;
    if (mi && typeof mi === 'object' && caseType === 'MI') {
      // Bridge plan P2: the product the person named, matched by name to this
      // organisation's products. A name that matches none is kept in the case comment.
      let productId = null;
      const productName = mi.product_name ? String(mi.product_name).trim().slice(0, 255) : '';
      if (productName) {
        const [[p]] = await conn.execute(
          'SELECT id FROM products WHERE org_id = ? AND is_active = 1 AND LOWER(trade_name) = LOWER(?) ORDER BY id LIMIT 1',
          [orgId, productName]);
        if (p) { productId = p.id; matchedProduct = productName; } else unmatchedProduct = productName;
      }
      await conn.execute(
        `INSERT INTO case_mi (case_id, tab_index, mi_category, product_id, question_summary, detailed_question, status)
         VALUES (?, 1, ?, ?, ?, ?, 'Open')`,
        [caseId, mi.mi_category || null, productId, mi.question_summary || null, mi.detailed_question || null]
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

    let unmatchedOutcome = null;
    if (caseType === 'AE') {
      const aeData = (ae && typeof ae === 'object') ? ae : {};
      // case_ae_events.outcome holds six fixed values; the portal sends its own wording
      // ("Not recovered"). Unmatched, the database refused the whole safety report.
      // Same mapping as the AE screen (caseAE.js); words it cannot place are kept as
      // 'unknown' and written to the case history below, so nothing the person said is lost.
      const OUTCOMES = new Set(['recovered', 'recovering', 'not_recovered', 'recovered_with_sequelae', 'fatal', 'unknown']);
      const outcomeKey = String(aeData.outcome || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
      const outcome = !outcomeKey ? null : OUTCOMES.has(outcomeKey) ? outcomeKey : 'unknown';
      if (outcomeKey && !OUTCOMES.has(outcomeKey)) unmatchedOutcome = String(aeData.outcome);
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
        [aeVer, aeData.reaction_description || null, outcome, toDateOnly(aeData.reaction_onset_date),
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

    // Bridge feature F5: the same person about the same product within a week is often
    // the same report sent twice. The earlier case is flagged for a person to judge;
    // nothing is merged. Product names are compared as written (MI: the matched product).
    const dupEmail = reporter && typeof reporter === 'object' && reporter.email ? String(reporter.email).trim() : '';
    const dupProduct = String((caseType === 'AE' ? ae?.suspect_drug_name : caseType === 'PC' ? pc?.product_name : matchedProduct) || '').trim();
    let possibleDuplicate = null;
    if (dupEmail && dupProduct) {
      [[possibleDuplicate]] = await conn.execute(
        `SELECT c.id, c.case_number FROM cases c
           JOIN case_reporter r ON r.case_id = c.id
           LEFT JOIN case_ae_intake ai ON ai.case_id = c.id
           LEFT JOIN case_pc_intake pi ON pi.case_id = c.id
           LEFT JOIN case_mi m ON m.case_id = c.id AND m.tab_index = 1
           LEFT JOIN products p ON p.id = m.product_id
          WHERE c.org_id = ? AND c.id <> ? AND c.case_type = ? AND c.is_deleted = 0
            AND c.created_at >= NOW() - INTERVAL 7 DAY
            AND LOWER(TRIM(r.email)) = LOWER(?)
            AND LOWER(TRIM(COALESCE(ai.suspect_drug_name, pi.product_name, p.trade_name))) = LOWER(?)
          ORDER BY c.id DESC LIMIT 1`,
        [orgId, caseId, caseType, dupEmail, dupProduct]);
      if (possibleDuplicate) {
        await conn.execute('UPDATE cases SET possible_duplicate_of = ? WHERE id = ?', [possibleDuplicate.id, caseId]);
      }
    }

    // Bridge row 6: the case's own history says where it came from.
    const apiActor = `API client: ${req.apiClient.name} (#${req.apiClient.id})`;
    await writeCaseAudit(caseId, 0, apiActor, 'CASE_CREATED_VIA_API', 'source_reference', null,
      `${reference || '(no reference)'} — created from ${req.apiClient.name}`, conn);
    if (reusedFrom) {
      await writeCaseAudit(caseId, 0, apiActor, 'SOURCE_REFERENCE_REUSED', 'source_reference', reusedFrom.case_number,
        `${reference} already belongs to case ${reusedFrom.case_number} from ${req.apiClient.name}; this is a different report, so it has its own case`, conn);
    }

    // Bridge row 6: a report raised from an earlier one (a side effect confirmed from an
    // enquiry) is linked to that case both ways, so either case shows the other.
    if (req.body.related_reference) {
      // The related report's own key when the sender gives it, so a reused number can
      // never link the case to someone else's.
      const relatedKey = typeof req.body.related_source_key === 'string' ? req.body.related_source_key.slice(0, 64) : null;
      const [[related]] = await conn.execute(
        relatedKey
          ? 'SELECT id, case_number FROM cases WHERE source_api_client_id = ? AND source_key = ? AND is_deleted = 0 LIMIT 1'
          : 'SELECT id, case_number FROM cases WHERE source_api_client_id = ? AND source_reference = ? AND is_deleted = 0 LIMIT 1',
        [req.apiClient.id, relatedKey || String(req.body.related_reference).slice(0, 100)]);
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
    if (possibleDuplicate) {
      await writeCaseAudit(caseId, 0, apiActor, 'POSSIBLE_DUPLICATE', 'possible_duplicate_of', null, possibleDuplicate.case_number, conn);
    }
    if (unmatchedOutcome) {
      await writeCaseAudit(caseId, 0, apiActor, 'INTAKE_VALUE_NOT_MATCHED', 'ae_intake.outcome', unmatchedOutcome, 'unknown', conn);
    }

    // Bridge plan P2: what the reporter said that has no field of its own on the case
    // screen, in one comment the case handler sees, so nothing from the form is lost.
    const lines = [];
    if (seriousness) {
      lines.push(seriousness.flags.is_serious
        ? `Seriousness, as reported: ${seriousness.text}. The matching criteria are ticked; confirm them at triage.`
        : `Seriousness, as reported: ${seriousness.text}. No serious criterion is ticked; confirm at triage.`);
      if (seriousness.unmatched.length) lines.push(`Not matched to a seriousness criterion: ${seriousness.unmatched.join(', ')}. Assess at triage.`);
      await writeCaseAudit(caseId, 0, apiActor, 'SERIOUSNESS_AS_REPORTED', 'ae_intake.seriousness', null,
        `${seriousness.text} (as reported, to be confirmed at triage)`, conn);
    }
    if (possibleDuplicate) {
      lines.push(`Possibly the same report as case ${possibleDuplicate.case_number}: same reporter and product within 7 days. Check, and merge them if so.`);
    }
    if (unmatchedProduct) lines.push(`Product named: ${unmatchedProduct} (no MIMS product has this name).`);
    const others = Array.isArray(req.body.other_answers) ? req.body.other_answers.slice(0, 50) : [];
    for (const o of others) {
      if (!o || typeof o !== 'object' || o.answer == null || String(o.answer).trim() === '') continue;
      lines.push(`${String(o.question || 'Answer').slice(0, 200)}: ${String(o.answer).slice(0, 2000)}`);
    }
    if (lines.length) {
      await conn.execute('INSERT INTO case_comments (case_id, user_id, comment) VALUES (?, NULL, ?)',
        [caseId, `From the report on ${req.apiClient.name}${reference ? ` (${reference})` : ''}:\n${lines.join('\n')}`]);
    }

    await finish();
    if (dryRun) {
      return res.status(200).json({
        dry_run: true, would_create: true, case_type: caseType, fingerprint,
        possible_duplicate: !!possibleDuplicate, comment_lines: lines.length,
        ...(shortened.length ? { shortened: shortened.map(s => s.path) } : {}),
      });
    }
    res.status(201).json({ id: caseId, case_number: caseNumber, fingerprint, ...(shortened.length ? { shortened: shortened.map(s => s.path) } : {}) });
    // Bridge row 7: an unassigned side-effect or complaint case tells the supervisors;
    // one reported as serious, at once and as critical (bridge feature F2).
    notifyIntakeArrival({ orgId, caseId, caseNumber, caseType, sourceName: req.apiClient.name,
      serious: !!seriousness?.flags.is_serious, seriousText: seriousness?.text || null });
  } catch (err) {
    await conn.rollback().catch(() => {});
    res.status(500).json(intakeFailure(err, req, 'Failed to create case.'));
  } finally {
    conn.release();
  }
});

// Bridge row 9: the person adds information to a report already sent. It becomes a case
// comment, a history line and the case's follow-up date, and the case owner (or the
// supervisors) is told — new information can change how a side effect is assessed.
// Only on a case this connection created; once per sender's follow-up id.
router.post('/api/v1/cases/:id/follow-ups', scopeGuard('cases:write'), async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const followupId = String(req.body?.followup_id || '').slice(0, 100);
  if (text.length < 2 || text.length > 5000) return res.status(400).json({ error: 'text must be 2 to 5000 characters.' });
  if (!followupId) return res.status(400).json({ error: 'followup_id is required.' });
  const conn = await pool.getConnection();
  try {
    // Bridge plan P4: information added to a case MIMS merged into another goes to that case.
    const live = await ownCaseOrSurvivor(conn, req.params.id, req.apiClient);
    if (!live) return res.status(404).json({ error: 'Case not found.' });
    const [[c]] = await conn.execute(
      `SELECT c.id, c.case_number, c.case_type, c.org_id, c.case_owner_id, COALESCE(ws.is_closed, 0) AS closed
         FROM cases c LEFT JOIN workflow_states ws ON ws.id = c.status_id
        WHERE c.id = ? AND c.org_id = ? LIMIT 1`,
      [live.id, req.apiClient.org_id]);
    if (!c) return res.status(404).json({ error: 'Case not found.' });
    const [[done]] = await conn.execute(
      'SELECT comment_id FROM api_case_followups WHERE api_client_id = ? AND external_followup_id = ?', [req.apiClient.id, followupId]);
    if (done) return res.status(200).json({ id: done.comment_id, idempotent: true });

    await conn.beginTransaction();
    const reference = req.body?.reference ? String(req.body.reference).slice(0, 100) : c.case_number;
    const merged = live.mergedFrom ? `; ${live.mergedFrom.case_number} was merged into this case` : '';
    // Bridge feature F3: the answer to a question MIMS asked. Only a question on this
    // case; a withdrawn or already answered one still lands as a plain follow-up.
    const questionId = Number(req.body?.question_id) || 0;
    const [[question]] = questionId
      ? await conn.execute('SELECT id, question, asked_by, answered_at, withdrawn_at FROM case_reporter_questions WHERE id = ? AND case_id = ? FOR UPDATE', [questionId, c.id])
      : [[null]];
    const answers = question && !question.answered_at && !question.withdrawn_at ? question : null;
    const [cm] = await conn.execute('INSERT INTO case_comments (case_id, user_id, comment) VALUES (?, NULL, ?)',
      [c.id, answers
        ? `Answer from the reporter (${reference}, via ${req.apiClient.name}${merged}) to the question "${String(answers.question).slice(0, 300)}":\n${text}`
        : `Follow-up from the reporter (${reference}, via ${req.apiClient.name}${merged}):\n${text}`]);
    if (answers) {
      await conn.execute('UPDATE case_reporter_questions SET answered_at = NOW(), answer_comment_id = ? WHERE id = ?', [cm.insertId, answers.id]);
    }
    await conn.execute('UPDATE cases SET follow_up_received_date = CURDATE(), updated_at = NOW() WHERE id = ?', [c.id]);
    await conn.execute(
      'INSERT INTO api_case_followups (api_client_id, external_followup_id, case_id, comment_id) VALUES (?, ?, ?, ?)',
      [req.apiClient.id, followupId, c.id, cm.insertId]);
    await writeCaseAudit(c.id, 0, `API client: ${req.apiClient.name} (#${req.apiClient.id})`,
      'FOLLOW_UP_RECEIVED', 'case_comment', null, `comment #${cm.insertId} from ${reference}`, conn);
    await conn.commit();
    res.status(201).json({ id: cm.insertId });

    const { getCaseSupervisors } = require('../services/intakeAlertService');
    const users = c.case_owner_id ? [c.case_owner_id] : await getCaseSupervisors(c.org_id);
    // The person who asked hears about the answer as well as the case owner.
    if (answers?.asked_by && !users.includes(answers.asked_by)) users.push(answers.asked_by);
    require('../services/notificationCenterService').createNotifications(users, {
      category: 'follow_up',
      severity: c.case_type === 'AE' || Number(c.closed) ? 'warning' : 'info',
      title: `${answers ? 'The reporter answered your question' : Number(c.closed) ? 'Follow-up on a closed case' : 'Follow-up received'}: ${c.case_number}`,
      message: answers
        ? 'The reporter answered through the portal. Read it in the case comments.'
        : 'The reporter added information through the portal. Read it in the case comments.',
      linkUrl: `/cases/${c.id}`,
      metadata: { case_id: c.id, comment_id: cm.insertId },
      eventKey: `follow-up:${cm.insertId}`,
    }).catch(err => logger.error({ err, case_id: c.id, comment_id: cm.insertId }, 'follow-up notice could not be created'));
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (!res.headersSent) res.status(500).json(intakeFailure(err, req, 'Failed to add the follow-up.'));
  } finally {
    conn.release();
  }
});

// C1: attach a file to a case. Stored via the shared file-storage service and
// recorded in the generic attachments table (entity_type='case'). Org-scoped by key.
router.post('/api/v1/cases/:id/attachments', scopeGuard('cases:write'), attUpload.single('file'), validateUpload(['image', 'doc']), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required.' });
    // Only on a case this connection created, as for follow-ups; a merged one's file
    // goes to the case it was merged into (bridge plan P4).
    const c = await ownCaseOrSurvivor(pool, req.params.id, req.apiClient);
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
    await writeCaseAudit(c.id, 0, `API client: ${req.apiClient.name} (#${req.apiClient.id})`,
      'ATTACHMENT_ADDED_VIA_API', 'attachment', null, `${String(req.file.originalname || '').slice(0, 200)} (${req.file.size} bytes)${c.mergedFrom ? `, sent to ${c.mergedFrom.case_number}, which was merged into this case` : ''}`);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json(intakeFailure(err, req, 'Failed to store attachment.'));
  }
});

// No PUT /api/v1/cases/:id. The portal never rewrote a case, and the route changed the
// description and priority with no line in the case history (Rohith, 2026-10-10,
// bridge plan decision 3). A case changes in MIMS; the portal adds follow-ups.

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
