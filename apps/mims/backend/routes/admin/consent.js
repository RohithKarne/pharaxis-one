'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

function orgScope(req) {
  return hasGlobalAdminScope(req.user) ? (Number(req.query.org_id || req.body?.org_id || 0) || null) : req.user.orgId;
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
  const body = req.body || {};
  await pool.execute(
    `UPDATE consent_records SET subject_identifier = COALESCE(?, subject_identifier),
      consent_type = COALESCE(?, consent_type), status = COALESCE(?, status),
      expires_at = COALESCE(?, expires_at), evidence_url = COALESCE(?, evidence_url), updated_at = NOW()
     WHERE id = ?`,
    [body.subject_identifier || null, body.consent_type || null, body.status || null, body.expires_at || null, body.evidence_url || null, req.params.id]
  );
  res.json({ ok: true });
});

router.delete('/consent/records/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  await pool.execute('DELETE FROM consent_records WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

router.post('/consent/:id/withdraw', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  await pool.execute(`UPDATE consent_records SET status = 'withdrawn', withdrawn_at = NOW(), updated_at = NOW() WHERE id = ?`, [req.params.id]);
  const [[consent]] = await pool.execute('SELECT * FROM consent_records WHERE id = ?', [req.params.id]);
  const [rules] = await pool.execute(
    `SELECT * FROM dppr_rules WHERE org_id = ? AND is_active = 1 AND consent_trigger_id = ?`,
    [consent?.org_id || 0, req.params.id]
  );
  res.json({ ok: true, triggered_rules: rules });
});

module.exports = router;
