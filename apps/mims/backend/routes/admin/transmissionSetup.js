'use strict';

/**
 * Transmission Setup (MI response and hand-off review, Rohith 2026-10-14) —
 * where an organisation's AE cases go (its safety system) and its PC cases go
 * (its quality system), the key MIMS sends with, and how many working days a
 * case has to get there. Until now the menu item opened an empty page, and the
 * Transmission screen's "Transmit" button could never be used because nothing
 * could set a target.
 *
 *   GET  /api/admin/transmission-setup
 *   PUT  /api/admin/transmission-setup/:type          (safety_system | quality_system)
 *   POST /api/admin/transmission-setup/:type/test     sends a test message
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const { assertPublicHttpUrl } = require('../../utils/ssrfGuard');
const { TARGETS, getTargets, saveTarget, outboundKey } = require('../../services/transmissionTargets');

const ADMIN = ['admin', 'platform_admin'];
const resolveOrgId = (req) => (hasGlobalAdminScope(req.user)
  ? (Number(req.query.org_id || req.body?.org_id || 0) || req.user.orgId || 1)
  : req.user.orgId);

router.get('/transmission-setup', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    res.json({ org_id: orgId, targets: await getTargets(orgId) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/transmission-setup/:type', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    if (!TARGETS[req.params.type]) return res.status(400).json({ error: 'Unknown target.' });
    const orgId = resolveOrgId(req);
    const url = String(req.body?.endpoint_url || '').trim();
    if (url) {
      try { await assertPublicHttpUrl(url); } catch (e) { return res.status(400).json({ error: `Address not allowed: ${e.message}` }); }
    }
    if (req.body?.enabled && !url) return res.status(400).json({ error: 'Give the address before switching the target on.' });
    const before = (await getTargets(orgId)).find(t => t.type === req.params.type);
    const saved = await saveTarget(orgId, req.params.type, req.body || {});
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, 'UPDATE', 'transmission_setup', ?, ?)`,
      [req.user.userId, req.user.email || req.user.name || null, orgId,
        JSON.stringify({ target: req.params.type, before, after: saved, key_changed: !!(req.body?.api_key || req.body?.clear_key) })]
    ).catch(() => {});
    res.json(saved);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/transmission-setup/:type/test', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    if (!TARGETS[req.params.type]) return res.status(400).json({ error: 'Unknown target.' });
    const orgId = resolveOrgId(req);
    const [[row]] = await pool.execute(
      'SELECT endpoint_url, api_key, config FROM org_integrations WHERE org_id = ? AND integration_type = ? LIMIT 1', [orgId, req.params.type]);
    if (!row?.endpoint_url) return res.status(400).json({ ok: false, error: 'No address is set.' });
    await assertPublicHttpUrl(row.endpoint_url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const r = await fetch(row.endpoint_url, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': outboundKey(row) },
        body: JSON.stringify({ event: 'handoff.test', org_id: orgId, data: { message: 'MIMS Transmission Setup test' }, timestamp: new Date().toISOString() }),
      });
      res.json({ ok: r.ok, status: r.status, message: r.ok ? 'The target answered.' : `The target answered ${r.status}.` });
    } catch (e) {
      res.json({ ok: false, status: 0, message: `No answer: ${e.name === 'AbortError' ? 'timed out' : e.message}` });
    } finally { clearTimeout(timer); }
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
