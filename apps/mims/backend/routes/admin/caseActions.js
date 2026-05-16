'use strict';

/**
 * caseActions.js — Theme 8 (Wave 4) surface.
 *
 * Endpoints (all gated by cf.theme8_smart_actions):
 *   GET    /api/case-templates?case_type=
 *   GET    /api/case-templates/:id
 *   POST   /api/admin/case-templates           (admin upsert)
 *   DELETE /api/admin/case-templates/:id
 *
 *   GET    /api/case-macros
 *   POST   /api/cases/:caseId/run-macro         body { macro_id }
 *
 *   POST   /api/cases/:caseId/clone             body { fields? }
 *   POST   /api/cases/bulk-update               body { case_ids:[], patch:{} }
 *
 *   GET    /api/cases/recent?limit=
 *   POST   /api/cases/:caseId/touch
 *   GET    /api/cases/pinned
 *   POST   /api/cases/:caseId/pin               body { note? } — toggles
 */

const express = require('express');
const router  = express.Router();
const { authenticate, requireRole } = require('../../middleware/auth');
const flags = require('../../services/featureFlagsService');
const actions = require('../../services/caseActionsService');

const FLAG  = 'cf.theme8_smart_actions';
const ADMIN = ['admin', 'superadmin'];

async function gated(req, res) {
  const on = await flags.isEnabledForOrg(FLAG, req.user.orgId);
  if (!on) { res.status(403).json({ error: 'Smart actions not enabled for this tenant.', flag: FLAG }); return false; }
  return true;
}

// ── Templates ────────────────────────────────────────────────────────────────
router.get('/case-templates', authenticate, async (req, res) => {
  try {
    const on = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!on) return res.json({ enabled: false, templates: [] });
    res.json({
      enabled: true,
      templates: await actions.listTemplates({ orgId: req.user.orgId, caseType: req.query.case_type || null }),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/case-templates/:id', authenticate, async (req, res) => {
  try {
    if (!(await gated(req, res))) return;
    const t = await actions.getTemplate({ orgId: req.user.orgId, id: req.params.id });
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json({ template: t });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/case-templates', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { id, case_type, name, description, payload, org_id } = req.body || {};
    await actions.upsertTemplate({
      id, orgId: org_id ?? req.user.orgId ?? null,
      caseType: case_type, name, description, payload,
      userId: req.user.userId,
    });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/admin/case-templates/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    await actions.removeTemplate({ orgId: req.user.orgId, id: req.params.id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Macros ───────────────────────────────────────────────────────────────────
router.get('/case-macros', authenticate, async (req, res) => {
  try {
    const on = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!on) return res.json({ enabled: false, macros: [] });
    res.json({ enabled: true, macros: await actions.listMacros({ orgId: req.user.orgId }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:caseId/run-macro', authenticate, async (req, res) => {
  try {
    if (!(await gated(req, res))) return;
    const { macro_id } = req.body || {};
    if (!macro_id) return res.status(400).json({ error: 'macro_id required' });
    const results = await actions.runMacro({
      orgId: req.user.orgId, caseId: Number(req.params.caseId),
      macroId: Number(macro_id), userId: req.user.userId,
    });
    res.json({ ok: results.every(r => r.ok), results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Clone + Bulk ─────────────────────────────────────────────────────────────
router.post('/cases/:caseId/clone', authenticate, async (req, res) => {
  try {
    if (!(await gated(req, res))) return;
    const out = await actions.cloneCase({
      orgId: req.user.orgId, caseId: Number(req.params.caseId),
      userId: req.user.userId, fields: req.body?.fields || {},
    });
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/bulk-update', authenticate, async (req, res) => {
  try {
    if (!(await gated(req, res))) return;
    const { case_ids, patch } = req.body || {};
    const out = await actions.bulkUpdate({
      orgId: req.user.orgId, caseIds: case_ids || [], patch: patch || {}, userId: req.user.userId,
    });
    res.json(out);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Recent + Pinned ──────────────────────────────────────────────────────────
router.get('/cases/recent', authenticate, async (req, res) => {
  try {
    res.json({ recent: await actions.listRecent({
      orgId: req.user.orgId, userId: req.user.userId, limit: req.query.limit,
    }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:caseId/touch', authenticate, async (req, res) => {
  try {
    await actions.recentTouch({
      orgId: req.user.orgId, userId: req.user.userId, caseId: Number(req.params.caseId),
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/cases/pinned', authenticate, async (req, res) => {
  try {
    res.json({ pinned: await actions.listPinned({ orgId: req.user.orgId, userId: req.user.userId }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:caseId/pin', authenticate, async (req, res) => {
  try {
    const out = await actions.togglePin({
      orgId: req.user.orgId, userId: req.user.userId,
      caseId: Number(req.params.caseId), note: req.body?.note || null,
    });
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
