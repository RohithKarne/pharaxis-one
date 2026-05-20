'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { convertMiToAe, convertMiToPc } = require('../../services/caseConversionService');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
async function canAccessMi(miTabId, req) { const [[row]] = await pool.execute('SELECT c.org_id FROM case_mi m JOIN cases c ON c.id=m.case_id WHERE m.id=? LIMIT 1', [miTabId]); if (!row) return false; return hasGlobalAdminScope(req.user) || Number(row.org_id) === Number(req.user.orgId); }
router.post('/cases/mi/:miTabId/convert', authenticate, async (req, res) => {
  try {
    if (!await canAccessMi(req.params.miTabId, req)) return res.status(404).json({ error: 'MI tab not found.' });
    const target = String(req.body?.target || '').toLowerCase();
    if (!['ae', 'pc'].includes(target)) return res.status(400).json({ error: "target must be 'ae' or 'pc'." });
    const result = target === 'ae' ? await convertMiToAe(req.params.miTabId, req.user.userId) : await convertMiToPc(req.params.miTabId, req.user.userId);
    res.status(result?.alreadyConverted ? 200 : 201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;
