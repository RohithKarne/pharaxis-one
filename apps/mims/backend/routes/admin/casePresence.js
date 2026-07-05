'use strict';

/**
 * casePresence.js — read-only HTTP surface for case-room presence.
 *
 * The actual transport is WebSocket (/api/cases/ws) — this route lets:
 *   - The case form audit chip read "currently viewing"
 *   - Theme 9 compliance UI check "who has this field focused"
 *   - Tests and operators inspect a room without a socket
 */

const express = require('express');
const router  = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const presence = require('../../services/casePresenceService');

// GET /api/cases/:id/presence — { users:[...], focus:[...] }
router.get('/cases/:id/presence', authenticate, async (req, res) => {
  const caseId = Number(req.params.id || 0);
  if (!caseId) return res.status(400).json({ error: 'caseId required' });
  const [[c]] = await pool.execute('SELECT id FROM cases WHERE id = ? AND org_id = ?', [caseId, req.user.orgId]);
  if (!c && !hasGlobalAdminScope(req.user)) return res.status(403).json({ error: 'Case not found in your organisation.' });
  res.json({
    caseId,
    users: presence.getRoomUsers(caseId),
    focus: presence.getRoomFocus(caseId),
  });
});

module.exports = router;
