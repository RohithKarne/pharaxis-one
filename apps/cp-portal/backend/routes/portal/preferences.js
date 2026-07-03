/**
 * Portal Preferences — /api/portal/preferences
 * S4-9: User notification preferences (news / documents / safety toggles)
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');

const DEFAULT_PREFS = { news: true, documents: true, safety: true, digest: true };

// GET /api/portal/preferences?clientCode=xxx
router.get('/', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const [[user]] = await pool.execute('SELECT notif_prefs_json FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    let prefs = DEFAULT_PREFS;
    try { prefs = { ...DEFAULT_PREFS, ...JSON.parse(user.notif_prefs_json || '{}') }; } catch {}
    res.json({ prefs });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/portal/preferences
router.patch('/', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const { news, documents, safety, digest } = req.body;
    const [[current]] = await pool.execute('SELECT notif_prefs_json FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    if (!current) return res.status(404).json({ error: 'User not found.' });

    let prefs = DEFAULT_PREFS;
    try { prefs = { ...DEFAULT_PREFS, ...JSON.parse(current.notif_prefs_json || '{}') }; } catch {}

    if (news      !== undefined) prefs.news      = !!news;
    if (documents !== undefined) prefs.documents = !!documents;
    if (safety    !== undefined) prefs.safety    = !!safety;
    if (digest    !== undefined) prefs.digest    = !!digest;

    await pool.execute(`UPDATE cp_portal_users SET notif_prefs_json = ? WHERE id = ?`,
      [JSON.stringify(prefs), req.portalUser.userId]);

    res.json({ prefs });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
