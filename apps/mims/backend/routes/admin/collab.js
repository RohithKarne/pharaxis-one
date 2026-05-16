'use strict';

/**
 * collab.js — Theme 5 surface (Wave 4).
 *
 * Endpoints:
 *   GET    /api/cases/:caseId/comments?section=&field=
 *   POST   /api/cases/:caseId/comments     body { body, section?, field?, parent_id? }
 *   PUT    /api/cases/:caseId/comments/:id/resolve
 *   DELETE /api/cases/:caseId/comments/:id
 *
 *   GET    /api/cases/:caseId/watchers
 *   POST   /api/cases/:caseId/watchers     body { user_id, reason? }
 *   DELETE /api/cases/:caseId/watchers/:userId
 *
 *   GET    /api/mentions/me?unread=1
 *   PUT    /api/mentions/:id/seen
 *
 * Gated by cf.theme5_realtime_collab (trimmed). When off, all writes return 403
 * and reads return empty lists so legacy UI keeps working.
 */

const express = require('express');
const router  = express.Router();
const { authenticate } = require('../../middleware/auth');
const flags = require('../../services/featureFlagsService');
const collab = require('../../services/collabService');

const FLAG = 'cf.theme5_realtime_collab';

async function gated(req, res) {
  const on = await flags.isEnabledForOrg(FLAG, req.user.orgId);
  if (!on) {
    res.status(403).json({ error: 'Real-time collaboration not enabled for this tenant.', flag: FLAG });
    return false;
  }
  return true;
}

// ── Comments ─────────────────────────────────────────────────────────────────
router.get('/cases/:caseId/comments', authenticate, async (req, res) => {
  try {
    const on = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!on) return res.json({ enabled: false, comments: [] });
    const comments = await collab.listComments({
      orgId: req.user.orgId, caseId: Number(req.params.caseId),
      section: req.query.section || null, field: req.query.field || null,
    });
    res.json({ enabled: true, comments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:caseId/comments', authenticate, async (req, res) => {
  try {
    if (!(await gated(req, res))) return;
    const { body, section, field, parent_id } = req.body || {};
    const c = await collab.postComment({
      orgId: req.user.orgId, caseId: Number(req.params.caseId),
      section: section || null, field: field || null,
      parentId: parent_id || null, body,
      authorId: req.user.userId,
    });
    res.json({ ok: true, comment: c });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/cases/:caseId/comments/:id/resolve', authenticate, async (req, res) => {
  try {
    if (!(await gated(req, res))) return;
    await collab.resolveComment({ orgId: req.user.orgId, commentId: req.params.id, userId: req.user.userId });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/cases/:caseId/comments/:id', authenticate, async (req, res) => {
  try {
    if (!(await gated(req, res))) return;
    await collab.deleteComment({ orgId: req.user.orgId, commentId: req.params.id, userId: req.user.userId });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Watchers ─────────────────────────────────────────────────────────────────
router.get('/cases/:caseId/watchers', authenticate, async (req, res) => {
  try {
    const on = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!on) return res.json({ enabled: false, watchers: [] });
    const watchers = await collab.listWatchers({ orgId: req.user.orgId, caseId: Number(req.params.caseId) });
    res.json({ enabled: true, watchers });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:caseId/watchers', authenticate, async (req, res) => {
  try {
    if (!(await gated(req, res))) return;
    const { user_id, reason } = req.body || {};
    await collab.addWatcher({
      orgId: req.user.orgId, caseId: Number(req.params.caseId),
      userId: Number(user_id || req.user.userId), reason: reason || 'manual',
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/cases/:caseId/watchers/:userId', authenticate, async (req, res) => {
  try {
    if (!(await gated(req, res))) return;
    await collab.removeWatcher({
      orgId: req.user.orgId, caseId: Number(req.params.caseId), userId: Number(req.params.userId),
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Mentions (current user) ──────────────────────────────────────────────────
router.get('/mentions/me', authenticate, async (req, res) => {
  try {
    const on = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!on) return res.json({ enabled: false, mentions: [] });
    const mentions = await collab.listMentions({
      orgId: req.user.orgId, userId: req.user.userId,
      unreadOnly: req.query.unread === '1',
      limit: Number(req.query.limit) || 50,
    });
    res.json({ enabled: true, mentions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/mentions/:id/seen', authenticate, async (req, res) => {
  try {
    await collab.markMentionSeen({
      orgId: req.user.orgId, mentionId: req.params.id, userId: req.user.userId,
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
