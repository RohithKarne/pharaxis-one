/**
 * Portal Notifications — /api/portal/notifications
 * S4-3: In-app notifications for portal users (new news, docs, safety alerts)
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');

// GET /api/portal/notifications?clientCode=xxx
router.get('/', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const { clientCode } = req.query;
    if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const [notifications] = await pool.execute(`
      SELECT * FROM cp_notifications
      WHERE portal_user_id = ? AND client_id = ?
      ORDER BY created_at DESC LIMIT 30
    `, [req.portalUser.id, client.id]);

    const unread_count = notifications.filter(n => !n.is_read).length;
    res.json({ notifications, unread_count });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/portal/notifications/read-all — mark all as read
router.patch('/read-all', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const { clientCode } = req.body;
    if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    await pool.execute(`UPDATE cp_notifications SET is_read = 1 WHERE portal_user_id = ? AND client_id = ?`,
      [req.portalUser.id, client.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/portal/notifications/:id/read — mark single as read
router.patch('/:id/read', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    await pool.execute(`UPDATE cp_notifications SET is_read = 1 WHERE id = ? AND portal_user_id = ?`,
      [req.params.id, req.portalUser.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
