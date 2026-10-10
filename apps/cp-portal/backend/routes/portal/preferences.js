/**
 * Portal Preferences — /api/portal/preferences
 * S4-9: User notification preferences (news / documents / safety toggles)
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');
const log = require('../../utils/logger');

// CPPM-101: the weekly email is off until the reader switches it on. It is stored as
// weekly_email, a new name, because the old "digest" value was on for everyone by
// default and so proves nothing; it is dropped when read, so every reader starts at no.
const DEFAULT_PREFS = { news: true, documents: true, safety: true, weekly_email: false };

function readPrefs(json) {
  let prefs = { ...DEFAULT_PREFS };
  try { prefs = { ...DEFAULT_PREFS, ...JSON.parse(json || '{}') }; } catch {}
  delete prefs.digest;
  return prefs;
}

// GET /api/portal/preferences?clientCode=xxx
router.get('/', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const [[user]] = await pool.execute('SELECT notif_prefs_json FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    res.json({ prefs: readPrefs(user.notif_prefs_json) });
  } catch (err) {
    log.error('portal.preferences.error', { err, route: 'GET /', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/portal/preferences
router.patch('/', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const { news, documents, safety, weekly_email } = req.body;
    const [[current]] = await pool.execute('SELECT notif_prefs_json FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    if (!current) return res.status(404).json({ error: 'User not found.' });

    const prefs = readPrefs(current.notif_prefs_json);

    if (news      !== undefined) prefs.news      = !!news;
    if (documents !== undefined) prefs.documents = !!documents;
    if (safety    !== undefined) prefs.safety    = !!safety;
    if (weekly_email !== undefined) prefs.weekly_email = !!weekly_email;

    await pool.execute(`UPDATE cp_portal_users SET notif_prefs_json = ? WHERE id = ?`,
      [JSON.stringify(prefs), req.portalUser.userId]);

    res.json({ prefs });
  } catch (err) {
    log.error('portal.preferences.error', { err, route: 'PATCH /', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
