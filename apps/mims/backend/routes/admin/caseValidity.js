'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { assess } = require('../../services/caseValidityService');
const cache = new Map();
async function orgForCase(caseId, req) { const [[row]] = await pool.execute('SELECT org_id FROM cases WHERE id=? LIMIT 1', [caseId]); if (!row) return null; if (req.user.role !== 'superadmin' && Number(row.org_id) !== Number(req.user.orgId)) return null; return row.org_id; }
router.get('/cases/:caseId/validity', authenticate, async (req, res) => {
  try {
    const orgId = await orgForCase(req.params.caseId, req); if (!orgId) return res.status(404).json({ error: 'Case not found.' });
    const key = `${orgId}:${req.params.caseId}`; const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < 30000) return res.json(hit.value);
    const value = await assess({ orgId, caseId: req.params.caseId }); cache.set(key, { ts: Date.now(), value }); res.json(value);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;
