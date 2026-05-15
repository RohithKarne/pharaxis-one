'use strict';

const express = require('express');
const crypto = require('crypto');
const pool = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { issueClientCredentials, createApiClient } = require('../services/api-platform/tokenIssuer');
const { apiKeyAuth } = require('../services/api-platform/apiKeyAuth');
const { scopeGuard } = require('../services/api-platform/scopeGuard');
const { publicApiRateLimiter } = require('../services/api-platform/rateLimiter');
const { signPayload } = require('../services/api-platform/webhookDispatcher');

const router = express.Router();

async function logCall(req, res, start) {
  if (!req.apiClient) return;
  await pool.execute(
    `INSERT INTO api_call_log (client_id, method, path, status_code, duration_ms, request_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.apiClient.id, req.method, req.originalUrl, res.statusCode, Date.now() - start, req.headers['x-request-id'] || crypto.randomUUID()]
  ).catch(() => {});
}

router.post('/oauth/token', async (req, res) => {
  try {
    if (req.body.grant_type && req.body.grant_type !== 'client_credentials') return res.status(400).json({ error: 'unsupported_grant_type' });
    const token = await issueClientCredentials(req.body || {});
    if (!token) return res.status(401).json({ error: 'invalid_client' });
    res.json(token);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/api-clients', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const client = await createApiClient({ org_id: req.body.org_id || req.user.orgId, name: req.body.name, scopes: req.body.scopes || ['cases:read'], rate_limit_per_min: req.body.rate_limit_per_min || 60, created_by: req.user.userId });
    res.status(201).json(client);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/openapi.yaml', (_req, res) => {
  res.type('text/yaml').send(`openapi: 3.1.0
info:
  title: MIMS Public API
  version: 1.0.0
paths:
  /oauth/token:
    post:
      summary: Issue OAuth2 client credentials token
  /api/v1/cases:
    get:
      summary: List cases
    post:
      summary: Create a case
  /api/v1/webhook-subscriptions:
    get:
      summary: List webhook subscriptions
    post:
      summary: Create webhook subscription
`);
});

router.use('/api/v1', apiKeyAuth, publicApiRateLimiter, (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => logCall(req, res, start));
  next();
});

router.get('/api/v1/cases', scopeGuard('cases:read'), async (req, res) => {
  const [rows] = await pool.execute('SELECT id, case_number, case_type, status, priority, created_at FROM cases WHERE org_id=? ORDER BY created_at DESC LIMIT 100', [req.apiClient.org_id]);
  res.json({ rows, pagination: { limit: 100 } });
});

router.post('/api/v1/cases', scopeGuard('cases:write'), async (req, res) => {
  const [result] = await pool.execute(
    `INSERT INTO cases (org_id, case_type, subject, description, status, priority, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.apiClient.org_id, req.body.case_type || 'MI', req.body.subject || 'API case', req.body.description || null, req.body.status || 'New', req.body.priority || 'Normal', null]
  );
  res.status(201).json({ id: result.insertId });
});

router.put('/api/v1/cases/:id', scopeGuard('cases:write'), async (req, res) => {
  await pool.execute('UPDATE cases SET subject=COALESCE(?, subject), description=COALESCE(?, description), status=COALESCE(?, status), priority=COALESCE(?, priority) WHERE id=? AND org_id=?', [req.body.subject || null, req.body.description || null, req.body.status || null, req.body.priority || null, req.params.id, req.apiClient.org_id]);
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
  const [rows] = await pool.execute('SELECT id, name, email, role FROM users ORDER BY name ASC LIMIT 100');
  res.json({ rows });
});
router.get('/api/v1/organisations', scopeGuard('admin:read'), async (_req, res) => {
  const [rows] = await pool.execute('SELECT id, name, data_region FROM organisations ORDER BY name ASC LIMIT 100');
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
  const secret = crypto.randomBytes(32).toString('hex');
  const [result] = await pool.execute('INSERT INTO webhook_subscriptions (client_id, url, events, signing_secret, status) VALUES (?, ?, ?, ?, ?)', [req.apiClient.id, req.body.url, JSON.stringify(req.body.events || []), secret, 'active']);
  res.status(201).json({ id: result.insertId, signing_secret: secret });
});
router.put('/api/v1/webhook-subscriptions/:id', scopeGuard('webhooks:write'), async (req, res) => {
  await pool.execute('UPDATE webhook_subscriptions SET url=COALESCE(?, url), events=COALESCE(?, events), status=COALESCE(?, status) WHERE id=? AND client_id=?', [req.body.url || null, req.body.events ? JSON.stringify(req.body.events) : null, req.body.status || null, req.params.id, req.apiClient.id]);
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
  await pool.execute('UPDATE webhook_deliveries SET attempt_count=0, next_retry_at=CURRENT_TIMESTAMP WHERE id=?', [req.params.dId]);
  res.json({ queued: true });
});

router.post('/api/v1/graphql', scopeGuard('graphql:read'), async (req, res) => {
  const query = String(req.body?.query || '');
  if (query.includes('cases')) {
    const [rows] = await pool.execute('SELECT id, case_number, case_type, status FROM cases WHERE org_id=? LIMIT 20', [req.apiClient.org_id]);
    return res.json({ data: { cases: rows } });
  }
  res.json({ data: { viewer: { clientId: req.apiClient.client_id, orgId: req.apiClient.org_id } } });
});

router.get('/api/v1/webhook-signature-example', scopeGuard('webhooks:write'), (req, res) => {
  const payload = { event: 'case.created', id: 1 };
  res.json({ payload, signature: signPayload('example-secret', payload) });
});

module.exports = router;
