'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const meddra = require('../../services/meddraService');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

async function orgForCase(caseId, req) {
  const [[row]] = await pool.execute('SELECT org_id FROM cases WHERE id=? LIMIT 1', [caseId]);
  if (!row) return null;
  if (!hasGlobalAdminScope(req.user) && Number(row.org_id) !== Number(req.user.orgId)) return null;
  return row.org_id;
}

async function audit(req, action, entity, entityId, details) {
  await pool.execute('INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)', [req.user.userId, req.user.email, action, entity, entityId || null, JSON.stringify(details || {})]).catch(() => {});
}

router.get('/meddra/search', authenticate, async (req, res) => {
  try { res.json({ results: await meddra.search({ q: req.query.q, level: req.query.level || 'PT', limit: req.query.limit || 20 }) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/meddra/term/:id/hierarchy', authenticate, async (req, res) => {
  try { res.json({ hierarchy: await meddra.getHierarchy(req.params.id) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/cases/:caseId/meddra', authenticate, async (req, res) => {
  try {
    const orgId = await orgForCase(req.params.caseId, req);
    if (!orgId) return res.status(404).json({ error: 'Case not found.' });
    const [events] = await pool.execute(`SELECT e.* FROM case_ae_versions v JOIN case_ae_events e ON e.version_id=v.id WHERE v.case_id=? ORDER BY v.version_number DESC, e.id ASC`, [req.params.caseId]);
    const [codes] = await pool.execute(`SELECT c.*, t.code, t.term, t.level AS term_level FROM case_meddra_codes c LEFT JOIN meddra_terms t ON t.id=c.approved_term_id WHERE c.org_id=? AND c.case_id=? ORDER BY c.id DESC`, [orgId, req.params.caseId]);
    res.json({ events, codes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:caseId/meddra/approve', authenticate, async (req, res) => {
  try {
    const orgId = await orgForCase(req.params.caseId, req);
    if (!orgId) return res.status(404).json({ error: 'Case not found.' });
    const id = await meddra.codeReaction({ orgId, caseId: req.params.caseId, aeEventId: req.body.ae_event_id, verbatim: req.body.verbatim, termId: req.body.term_id, approvedBy: req.user.userId });
    await audit(req, 'MEDDRA_APPROVED', 'case_meddra_codes', id, req.body);
    await pool.execute('INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)', [req.user.userId, req.user.email, 'ESIGN_MEDDRA_APPROVAL', 'case_meddra_codes', id, JSON.stringify({ term_id: req.body.term_id })]).catch(() => {});
    res.status(201).json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/meddra/import', authenticate, requireRole('admin', 'platform_admin'), async (_req, res) => {
  res.status(202).json({ message: 'MedDRA importer endpoint ready. Use the licensed file-loader script for bulk imports.' });
});

module.exports = router;
