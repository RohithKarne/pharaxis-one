'use strict';

/**
 * fieldActions.js — Sprint 2 #28 surface for PC field actions / recalls.
 *
 *   GET    /api/field-actions?status=&product_id=&limit=
 *   GET    /api/field-actions/:id
 *   POST   /api/field-actions
 *   PUT    /api/field-actions/:id
 *   POST   /api/field-actions/:id/transition  body { to_status, note? }
 *   POST   /api/field-actions/:id/cases       body { case_id, relation? }
 *   DELETE /api/field-actions/:id/cases/:caseId
 *   GET    /api/admin/field-actions/status-flow      (admin reference)
 */

const express = require('express');
const router  = express.Router();
const { authenticate, requireRole } = require('../../middleware/auth');
const fieldActions = require('../../services/fieldActionsService');

const ADMIN = ['admin', 'platform_admin'];
const QA_OR_ADMIN = ['admin', 'superadmin', 'qa'];

router.get('/field-actions/status-flow', authenticate, (_req, res) => {
  res.json({ flow: fieldActions.STATUS_FLOW });
});

router.get('/field-actions', authenticate, async (req, res) => {
  try {
    res.json({
      records: await fieldActions.list({
        orgId: req.user.orgId,
        status:    req.query.status || null,
        productId: req.query.product_id || null,
        limit:     req.query.limit,
      }),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/field-actions/:id', authenticate, async (req, res) => {
  try {
    const r = await fieldActions.get({ orgId: req.user.orgId, id: req.params.id });
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ record: r });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/field-actions', authenticate, requireRole(...QA_OR_ADMIN), async (req, res) => {
  try {
    const out = await fieldActions.create({
      orgId: req.user.orgId, userId: req.user.userId, payload: req.body || {},
    });
    res.json({ ok: true, ...out });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/field-actions/:id', authenticate, requireRole(...QA_OR_ADMIN), async (req, res) => {
  try {
    await fieldActions.update({
      orgId: req.user.orgId, id: req.params.id,
      patch: req.body || {}, userId: req.user.userId,
    });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/field-actions/:id/transition', authenticate, requireRole(...QA_OR_ADMIN), async (req, res) => {
  try {
    const { to_status, note } = req.body || {};
    if (!to_status) return res.status(400).json({ error: 'to_status required' });
    const out = await fieldActions.transition({
      orgId: req.user.orgId, id: req.params.id,
      toStatus: to_status, note, userId: req.user.userId,
    });
    res.json({ ok: true, ...out });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/field-actions/:id/cases', authenticate, requireRole(...QA_OR_ADMIN), async (req, res) => {
  try {
    const { case_id, relation } = req.body || {};
    if (!case_id) return res.status(400).json({ error: 'case_id required' });
    await fieldActions.linkCase({
      id: req.params.id, caseId: Number(case_id),
      relation: relation || 'affected', userId: req.user.userId,
    });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/field-actions/:id/cases/:caseId', authenticate, requireRole(...QA_OR_ADMIN), async (req, res) => {
  try {
    await fieldActions.unlinkCase({
      id: req.params.id, caseId: Number(req.params.caseId), userId: req.user.userId,
    });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
