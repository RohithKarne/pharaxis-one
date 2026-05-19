'use strict';

/**
 * caseTimeline.js — Sprint 2 #13 read surface.
 *
 *   GET /api/cases/:caseId/timeline?since=2026-04-01&limit=200
 *     → unified chronology of every event related to the case
 */

const express = require('express');
const router  = express.Router();
const { authenticate } = require('../../middleware/auth');
const timeline = require('../../services/caseTimelineService');

router.get('/cases/:caseId/timeline', authenticate, async (req, res) => {
  try {
    const events = await timeline.getTimeline({
      orgId:  req.user.orgId,
      caseId: Number(req.params.caseId),
      since:  req.query.since || null,
      limit:  req.query.limit,
    });
    res.json({ events });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
