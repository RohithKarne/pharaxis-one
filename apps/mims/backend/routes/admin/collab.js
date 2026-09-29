'use strict';

/**
 * collab.js — Theme 5 surface (Wave 4).
 *
 * Endpoints:
 *   (GET / POST /api/cases/:caseId/comments are served by routes/cases.js)
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
// Listing and posting case comments is answered by routes/cases.js. The copies
// that lived here were mounted first, so they shadowed it: behind this flag they
// refused every post, and with the flag on they read columns the deployed
// case_comments table does not have (it is the migration 007 shape).
// Resolve and delete are gone too: the deployed table has no resolved /
// deleted_at / org_id columns, so both always failed (T16). Comments are kept
// as written — they are part of the case record.

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
