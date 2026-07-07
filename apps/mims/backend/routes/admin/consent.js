'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const { logger } = require('../../services/logger');

function orgScope(req) {
  return hasGlobalAdminScope(req.user) ? (Number(req.query.org_id || req.body?.org_id || 0) || null) : req.user.orgId;
}

// Org-ownership clause for by-id lookups. Platform admins bypass (1=1);
// tenant admins are pinned to their own org_id. Modelled on icsr.js loadIcsr.
function orgByIdClause(req) {
  return hasGlobalAdminScope(req.user)
    ? { sql: '1=1', params: [] }
    : { sql: 'org_id = ?', params: [req.user.orgId] };
}

// Fetch a consent_records row scoped to the caller's org. Returns null when the
// row does not exist OR is outside the caller's org (caller should 404).
async function getScopedConsent(req, id) {
  const scope = orgByIdClause(req);
  const [[row]] = await pool.execute(
    `SELECT * FROM consent_records WHERE id = ? AND ${scope.sql}`,
    [id, ...scope.params]
  );
  return row || null;
}

router.get('/consent/records', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const orgId = orgScope(req);
  if (!orgId) return res.status(400).json({ error: 'org_id required.' });
  const [rows] = await pool.execute('SELECT * FROM consent_records WHERE org_id = ? ORDER BY updated_at DESC', [orgId]);
  res.json({ records: rows });
});

router.post('/consent/records', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const orgId = orgScope(req);
  if (!orgId) return res.status(400).json({ error: 'org_id required.' });
  const body = req.body || {};
  const [result] = await pool.execute(
    `INSERT INTO consent_records
      (org_id, subject_identifier, consent_type, status, granted_at, expires_at, evidence_url, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [orgId, body.subject_identifier, body.consent_type || 'processing', body.status || 'granted', body.granted_at || new Date(), body.expires_at || null, body.evidence_url || null, req.user.userId]
  );
  res.status(201).json({ id: result.insertId });
});

router.put('/consent/records/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const existing = await getScopedConsent(req, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Consent record not found.' });
    const body = req.body || {};
    await pool.execute(
      `UPDATE consent_records SET subject_identifier = COALESCE(?, subject_identifier),
        consent_type = COALESCE(?, consent_type), status = COALESCE(?, status),
        expires_at = COALESCE(?, expires_at), evidence_url = COALESCE(?, evidence_url), updated_at = NOW()
       WHERE id = ?`,
      [body.subject_identifier || null, body.consent_type || null, body.status || null, body.expires_at || null, body.evidence_url || null, existing.id]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id: req.params.id }, 'consent update failed');
    res.status(500).json({ error: 'Failed to update consent record.' });
  }
});

router.delete('/consent/records/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const existing = await getScopedConsent(req, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Consent record not found.' });
    await pool.execute('DELETE FROM consent_records WHERE id = ?', [existing.id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id: req.params.id }, 'consent delete failed');
    res.status(500).json({ error: 'Failed to delete consent record.' });
  }
});

router.post('/consent/:id/withdraw', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const existing = await getScopedConsent(req, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Consent record not found.' });
    await pool.execute(`UPDATE consent_records SET status = 'withdrawn', withdrawn_at = NOW(), updated_at = NOW() WHERE id = ?`, [existing.id]);
    const [rules] = await pool.execute(
      `SELECT * FROM dppr_rules WHERE org_id = ? AND is_active = 1 AND consent_trigger_id = ?`,
      [existing.org_id || 0, existing.id]
    );
    res.json({ ok: true, triggered_rules: rules });
  } catch (err) {
    logger.error({ err, id: req.params.id }, 'consent withdraw failed');
    res.status(500).json({ error: 'Failed to withdraw consent record.' });
  }
});

module.exports = router;
