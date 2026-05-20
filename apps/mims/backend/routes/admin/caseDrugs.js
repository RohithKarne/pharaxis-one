'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const service = require('../../services/caseDrugsService');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
async function orgForCase(caseId, req) { const row = await service.verifyCase(req.user.orgId, caseId); if (row) return row.org_id; if (hasGlobalAdminScope(req.user)) { const [[c]] = await pool.execute('SELECT org_id FROM cases WHERE id=?', [caseId]); return c?.org_id || null; } return null; }
router.get('/cases/:caseId/drugs', authenticate, async (req, res) => { try { const orgId = await orgForCase(req.params.caseId, req); if (!orgId) return res.status(404).json({ error: 'Case not found.' }); res.json({ rows: await service.list({ orgId, caseId: req.params.caseId }) }); } catch (err) { res.status(500).json({ error: err.message }); } });
router.post('/cases/:caseId/drugs', authenticate, async (req, res) => { try { const orgId = await orgForCase(req.params.caseId, req); if (!orgId) return res.status(404).json({ error: 'Case not found.' }); const id = await service.create({ orgId, caseId: req.params.caseId, body: req.body || {}, userId: req.user.userId }); res.status(201).json({ id, rows: await service.list({ orgId, caseId: req.params.caseId }) }); } catch (err) { res.status(400).json({ error: err.message }); } });
router.put('/cases/:caseId/drugs/:drugId', authenticate, async (req, res) => { try { const orgId = await orgForCase(req.params.caseId, req); if (!orgId) return res.status(404).json({ error: 'Case not found.' }); const ok = await service.update({ orgId, caseId: req.params.caseId, drugId: req.params.drugId, body: req.body || {} }); if (!ok) return res.status(404).json({ error: 'Drug not found.' }); res.json({ rows: await service.list({ orgId, caseId: req.params.caseId }) }); } catch (err) { res.status(400).json({ error: err.message }); } });
router.delete('/cases/:caseId/drugs/:drugId', authenticate, async (req, res) => { try { const orgId = await orgForCase(req.params.caseId, req); if (!orgId) return res.status(404).json({ error: 'Case not found.' }); await service.remove({ orgId, caseId: req.params.caseId, drugId: req.params.drugId }); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
module.exports = router;
