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

const router = express.Router();

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

router.post('/api/v1/cases', scopeGuard('cases:write'), async (req, res) => {
  const [[site]] = await pool.execute('SELECT id FROM sites WHERE org_id=? ORDER BY id ASC LIMIT 1', [req.apiClient.org_id]);
  if (!site?.id) return res.status(400).json({ error: 'No site is configured for this organisation.' });
  const [[state]] = await pool.execute('SELECT id FROM workflow_states WHERE org_id=? OR org_id IS NULL ORDER BY org_id IS NULL DESC, id ASC LIMIT 1', [req.apiClient.org_id]);
  const [result] = await pool.execute(
    `INSERT INTO cases (org_id, site_id, case_type, intake_channel, description, status_id, priority, created_by) VALUES (?, ?, ?, 'api', ?, ?, ?, ?)`,
    [req.apiClient.org_id, site.id, req.body.case_type || 'MI', req.body.description || req.body.subject || null, state?.id || null, req.body.priority || 'normal', null]
  );
  res.status(201).json({ id: result.insertId });
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
