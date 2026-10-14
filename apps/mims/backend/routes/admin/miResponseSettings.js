'use strict';

/**
 * MI Response Settings (MI response review, Rohith 2026-10-14) — one admin
 * screen for what an organisation decides about its answers: the off-label
 * statement, the closing statement, whether an off-label answer must enclose
 * the prescribing information, the working days a routine and an urgent
 * question have, and when an answer needs a second signer.
 *
 *   GET /api/admin/mi-response-settings
 *   PUT /api/admin/mi-response-settings
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const { getSettings, saveSettings } = require('../../services/miResponseSettings');

const ADMIN = ['admin', 'platform_admin'];
const resolveOrgId = (req) => (hasGlobalAdminScope(req.user)
  ? (Number(req.query.org_id || req.body?.org_id || 0) || req.user.orgId || 1)
  : req.user.orgId);

// The two-signer rules this screen manages: off-label answers, and every answer.
// A platform-wide rule (org_id NULL) applies and cannot be switched off here.
async function signerState(orgId) {
  const [rows] = await pool.execute(
    `SELECT org_id, condition_type, is_active FROM mi_two_signer_rules
      WHERE (org_id = ? OR org_id IS NULL) AND condition_type IN ('off_label', 'always')`, [orgId]);
  const state = (type) => ({
    on: rows.some(r => r.condition_type === type && r.is_active),
    platform: rows.some(r => r.condition_type === type && r.org_id === null && r.is_active),
  });
  return { off_label: state('off_label'), always: state('always') };
}

async function setSignerRule(orgId, type, on) {
  const [[row]] = await pool.execute(
    'SELECT id FROM mi_two_signer_rules WHERE org_id = ? AND condition_type = ? LIMIT 1', [orgId, type]);
  if (row) await pool.execute('UPDATE mi_two_signer_rules SET is_active = ?, updated_at = NOW() WHERE id = ?', [on ? 1 : 0, row.id]);
  else if (on) await pool.execute('INSERT INTO mi_two_signer_rules (org_id, condition_type, is_active) VALUES (?, ?, 1)', [orgId, type]);
}

router.get('/mi-response-settings', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    res.json({ org_id: orgId, ...(await getSettings(orgId)), two_signers: await signerState(orgId) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/mi-response-settings', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const before = { ...(await getSettings(orgId)), two_signers: await signerState(orgId) };
    const saved = await saveSettings(orgId, req.body || {}, req.user.userId);
    const ts = req.body?.two_signers || {};
    if (ts.off_label !== undefined) await setSignerRule(orgId, 'off_label', !!ts.off_label);
    if (ts.always !== undefined) await setSignerRule(orgId, 'always', !!ts.always);
    const after = { ...saved, two_signers: await signerState(orgId) };
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, 'UPDATE', 'mi_response_settings', ?, ?)`,
      [req.user.userId, req.user.email || req.user.name || null, orgId, JSON.stringify({ before, after })]
    ).catch(() => {});
    res.json({ org_id: orgId, ...after });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
