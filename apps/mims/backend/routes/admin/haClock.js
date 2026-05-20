'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { listClocks, recalculateAll } = require('../../services/haClockService');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

async function orgForCase(caseId, req) {
  const [[row]] = await pool.execute('SELECT org_id FROM cases WHERE id=? LIMIT 1', [caseId]);
  if (!row) return null;
  if (!hasGlobalAdminScope(req.user) && Number(row.org_id) !== Number(req.user.orgId)) return null;
  return row.org_id;
}

router.get('/cases/:caseId/ha-clocks', authenticate, async (req, res) => {
  try {
    const orgId = await orgForCase(req.params.caseId, req);
    if (!orgId) return res.status(404).json({ error: 'Case not found.' });
    res.json({ clocks: await listClocks({ orgId, caseId: req.params.caseId }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:caseId/ha-clocks/recalc', authenticate, async (req, res) => {
  try {
    const orgId = await orgForCase(req.params.caseId, req);
    if (!orgId) return res.status(404).json({ error: 'Case not found.' });
    await recalculateAll({ orgId, caseId: req.params.caseId });
    res.json({ clocks: await listClocks({ orgId, caseId: req.params.caseId }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/health-authorities', authenticate, requireRole('admin', 'platform_admin'), async (_req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM health_authorities ORDER BY is_active DESC, id ASC');
    res.json({ rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
