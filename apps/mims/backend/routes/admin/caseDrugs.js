'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const service = require('../../services/caseDrugsService');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
async function orgForCase(caseId, req) { const row = await service.verifyCase(req.user.orgId, caseId); if (row) return row.org_id; if (hasGlobalAdminScope(req.user)) { const [[c]] = await pool.execute('SELECT org_id FROM cases WHERE id=?', [caseId]); return c?.org_id || null; } return null; }
// MIPM-162: adding, changing or removing a drug needs the same case.update
// permission as the case, and stops once the case is closed. It checked
// organisation membership only, so a reviewer could change the drug list.
const verifyCaseScoped = require('../../services/caseHelpers').verifyCaseOrg;
// MIPM-169: each drug added, changed or removed goes to the case audit trail.
const { auditChanges } = require('../../services/componentAudit');
const drugRow = async (id) => (await pool.execute('SELECT * FROM case_drugs WHERE id = ?', [id]))[0][0] || null;
async function writeBlock(caseId, req) {
  if (!await verifyCaseScoped(caseId, req, 'case.update')) return { status: 403, error: 'You do not have permission to change this case.' };
  const [[c]] = await pool.execute('SELECT ws.is_closed FROM cases c LEFT JOIN workflow_states ws ON ws.id = c.status_id WHERE c.id = ?', [caseId]);
  if (Number(c?.is_closed) === 1) return { status: 409, error: 'This case is closed. Reopen it to change its drugs.' };
  return null;
}
router.get('/cases/:caseId/drugs', authenticate, async (req, res) => { try { const orgId = await orgForCase(req.params.caseId, req); if (!orgId) return res.status(404).json({ error: 'Case not found.' }); res.json({ rows: await service.list({ orgId, caseId: req.params.caseId }) }); } catch (err) { res.status(500).json({ error: err.message }); } });
router.post('/cases/:caseId/drugs', authenticate, async (req, res) => { try { const orgId = await orgForCase(req.params.caseId, req); if (!orgId) return res.status(404).json({ error: 'Case not found.' }); const block = await writeBlock(req.params.caseId, req); if (block) return res.status(block.status).json({ error: block.error }); const id = await service.create({ orgId, caseId: req.params.caseId, body: req.body || {}, userId: req.user.userId }); await auditChanges(req.params.caseId, req, 'DRUG_ADDED', `Drug #${id}`, null, await drugRow(id)); res.status(201).json({ id, rows: await service.list({ orgId, caseId: req.params.caseId }) }); } catch (err) { res.status(400).json({ error: err.message }); } });
router.put('/cases/:caseId/drugs/:drugId', authenticate, async (req, res) => { try { const orgId = await orgForCase(req.params.caseId, req); if (!orgId) return res.status(404).json({ error: 'Case not found.' }); const block = await writeBlock(req.params.caseId, req); if (block) return res.status(block.status).json({ error: block.error }); const before = await drugRow(req.params.drugId); const ok = await service.update({ orgId, caseId: req.params.caseId, drugId: req.params.drugId, body: req.body || {} }); if (!ok) return res.status(404).json({ error: 'Drug not found.' }); await auditChanges(req.params.caseId, req, 'DRUG_UPDATED', `Drug #${req.params.drugId}`, before, await drugRow(req.params.drugId)); res.json({ rows: await service.list({ orgId, caseId: req.params.caseId }) }); } catch (err) { res.status(400).json({ error: err.message }); } });
router.delete('/cases/:caseId/drugs/:drugId', authenticate, async (req, res) => { try { const orgId = await orgForCase(req.params.caseId, req); if (!orgId) return res.status(404).json({ error: 'Case not found.' }); const block = await writeBlock(req.params.caseId, req); if (block) return res.status(block.status).json({ error: block.error }); const gone = await drugRow(req.params.drugId); await service.remove({ orgId, caseId: req.params.caseId, drugId: req.params.drugId }); if (gone && Number(gone.case_id) === Number(req.params.caseId)) await auditChanges(req.params.caseId, req, 'DRUG_REMOVED', `Drug #${req.params.drugId}`, gone, null); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
module.exports = router;
