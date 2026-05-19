'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const causality = require('../../services/causalityService');

async function orgForCase(caseId, req) {
  const [[row]] = await pool.execute('SELECT org_id FROM cases WHERE id=? LIMIT 1', [caseId]);
  if (!row) return null;
  if (req.user.role !== 'superadmin' && Number(row.org_id) !== Number(req.user.orgId)) return null;
  return row.org_id;
}
function history(req, orgId, caseId, field, value) {
  return pool.execute(`INSERT INTO field_value_history (org_id, entity_type, entity_id, section_name, field_name, old_value, new_value, changed_by, reason, source) VALUES (?, 'case', ?, 'causality', ?, NULL, ?, ?, 'Causality assessment update', 'web')`, [orgId, caseId, field, value, req.user.userId]).catch(() => {});
}
router.get('/cases/:caseId/causality', authenticate, async (req, res) => {
  try { const orgId = await orgForCase(req.params.caseId, req); if (!orgId) return res.status(404).json({ error: 'Case not found.' }); res.json(await causality.getMatrix({ orgId, caseId: req.params.caseId, aeVersionId: req.query.ae_version_id })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/cases/:caseId/causality', authenticate, async (req, res) => {
  try {
    const orgId = await orgForCase(req.params.caseId, req); if (!orgId) return res.status(404).json({ error: 'Case not found.' });
    const b = req.body || {};
    await causality.upsertCell({ orgId, caseId: req.params.caseId, aeVersionId: b.ae_version_id, drugId: b.drug_id, aeEventId: b.ae_event_id, assessor: b.assessor, method: b.method, category: b.category, narrative: b.narrative, userId: req.user.userId });
    await history(req, orgId, req.params.caseId, `${b.drug_id}_${b.ae_event_id}_${b.assessor}`, b.category);
    res.status(201).json(await causality.getMatrix({ orgId, caseId: req.params.caseId, aeVersionId: b.ae_version_id }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});
router.delete('/cases/:caseId/causality/:id', authenticate, async (req, res) => {
  try { const orgId = await orgForCase(req.params.caseId, req); if (!orgId) return res.status(404).json({ error: 'Case not found.' }); await pool.execute('DELETE FROM case_causality WHERE id=? AND org_id=? AND case_id=?', [req.params.id, orgId, req.params.caseId]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;
