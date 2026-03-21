/**
 * Portal Preferences — /api/portal/preferences
 * S4-9: User notification preferences (news / documents / safety toggles)
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');

const DEFAULT_PREFS = { news: true, documents: true, safety: true };

// GET /api/portal/preferences?clientCode=xxx
router.get('/', authenticatePortal, requirePortalAuth, (req, res) => {
  const user = db.prepare('SELECT notif_prefs_json FROM cp_portal_users WHERE id = ?').get(req.portalUser.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  let prefs = DEFAULT_PREFS;
  try { prefs = { ...DEFAULT_PREFS, ...JSON.parse(user.notif_prefs_json || '{}') }; } catch {}
  res.json({ prefs });
});

// PATCH /api/portal/preferences
router.patch('/', authenticatePortal, requirePortalAuth, (req, res) => {
  const { news, documents, safety } = req.body;
  const current = db.prepare('SELECT notif_prefs_json FROM cp_portal_users WHERE id = ?').get(req.portalUser.userId);
  if (!current) return res.status(404).json({ error: 'User not found.' });

  let prefs = DEFAULT_PREFS;
  try { prefs = { ...DEFAULT_PREFS, ...JSON.parse(current.notif_prefs_json || '{}') }; } catch {}

  if (news      !== undefined) prefs.news      = !!news;
  if (documents !== undefined) prefs.documents = !!documents;
  if (safety    !== undefined) prefs.safety    = !!safety;

  db.prepare(`UPDATE cp_portal_users SET notif_prefs_json = ? WHERE id = ?`)
    .run(JSON.stringify(prefs), req.portalUser.userId);

  res.json({ prefs });
});

module.exports = router;
