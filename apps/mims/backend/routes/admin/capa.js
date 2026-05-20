'use strict';

/**
 * capa.js — Sprint 2 #20 surface for CAPA workflow.
 *
 *   GET    /api/capa?status=&source_case_id=&assigned_to=&limit=
 *   GET    /api/capa/:id
 *   POST   /api/capa
 *   PUT    /api/capa/:id
 *   POST   /api/capa/:id/transition  body { to_status, note? }
 *   POST   /api/capa/:id/actions     body { action_type, description, assigned_to?, target_date? }
 *   PUT    /api/capa-actions/:actionId/complete  body { verification_notes? }
 *   POST   /api/capa/:id/effectiveness body { outcome, notes? }
 *   GET    /api/capa/meta/status-flow
 */

const express = require('express');
const router  = express.Router();
const { authenticate, requireRole } = require('../../middleware/auth');
const capa = require('../../services/capaService');

const QA_OR_ADMIN = ['admin','platform_admin','qa'];

router.get('/capa/meta/status-flow', authenticate, (_req, res) => {
  res.json({ flow: capa.STATUS_FLOW });
});

router.get('/capa', authenticate, async (req, res) => {
  try {
    res.json({
      records: await capa.list({
        orgId: req.user.orgId,
        status:        req.query.status || null,
        sourceCaseId:  req.query.source_case_id || null,
        assignedTo:    req.query.assigned_to || null,
        limit:         req.query.limit,
      }),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/capa/:id', authenticate, async (req, res) => {
  try {
    const r = await capa.get({ orgId: req.user.orgId, id: req.params.id });
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ record: r });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/capa', authenticate, requireRole(...QA_OR_ADMIN), async (req, res) => {
  try {
    const out = await capa.create({
      orgId: req.user.orgId, userId: req.user.userId, payload: req.body || {},
    });
    res.json({ ok: true, ...out });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/capa/:id', authenticate, requireRole(...QA_OR_ADMIN), async (req, res) => {
  try {
    await capa.update({
      orgId: req.user.orgId, id: req.params.id,
      patch: req.body || {}, userId: req.user.userId,
    });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/capa/:id/transition', authenticate, requireRole(...QA_OR_ADMIN), async (req, res) => {
  try {
    const { to_status, note } = req.body || {};
    const out = await capa.transition({
      orgId: req.user.orgId, id: req.params.id,
      toStatus: to_status, note, userId: req.user.userId,
    });
    res.json({ ok: true, ...out });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/capa/:id/actions', authenticate, requireRole(...QA_OR_ADMIN), async (req, res) => {
  try {
    const out = await capa.addAction({
      capaId: req.params.id, payload: req.body || {}, userId: req.user.userId,
    });
    res.json({ ok: true, ...out });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/capa-actions/:actionId/complete', authenticate, requireRole(...QA_OR_ADMIN), async (req, res) => {
  try {
    const { verification_notes } = req.body || {};
    await capa.completeAction({
      actionId: req.params.actionId, verificationNotes: verification_notes, userId: req.user.userId,
    });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/capa/:id/effectiveness', authenticate, requireRole(...QA_OR_ADMIN), async (req, res) => {
  try {
    const { outcome, notes } = req.body || {};
    await capa.logEffectiveness({
      orgId: req.user.orgId, id: req.params.id,
      outcome, notes, userId: req.user.userId,
    });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
