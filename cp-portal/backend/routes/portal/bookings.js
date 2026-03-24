/**
 * Portal MSL Bookings — /api/portal/bookings
 * S5-8: Portal users request meetings with MSLs
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal } = require('../../middleware/auth');

// POST /api/portal/bookings/:clientCode/:mslId — request a meeting
router.post('/:clientCode/:mslId', authenticatePortal, async (req, res) => {
  try {
    const { clientCode, mslId } = req.params;
    const { requester_name, requester_email, preferred_date, topic, message } = req.body;

    if (!requester_name || !requester_email) {
      return res.status(400).json({ error: 'requester_name and requester_email are required.' });
    }

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    const [[msl]] = await pool.execute('SELECT id FROM cp_msls WHERE id = ? AND client_id = ? AND is_active = 1', [mslId, client.id]);
    if (!msl) return res.status(404).json({ error: 'MSL not found.' });

    // Deduplicate: prevent the same email requesting the same MSL more than once per day
    const [[existing]] = await pool.execute(`
      SELECT id FROM cp_msl_bookings
      WHERE msl_id = ? AND requester_email = ? AND DATE(created_at) = DATE(NOW())
    `, [mslId, requester_email.toLowerCase().trim()]);
    if (existing) return res.status(409).json({ error: 'You have already requested a meeting with this MSL today.' });

    const portalUserId = req.portalUser?.id || null;
    const userType     = req.portalUser?.user_type || null;

    const [result] = await pool.execute(`
      INSERT INTO cp_msl_bookings
        (client_id, msl_id, portal_user_id, requester_name, requester_email, requester_user_type, preferred_date, topic, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      client.id, mslId, portalUserId,
      requester_name.trim(), requester_email.toLowerCase().trim(), userType,
      preferred_date || null, topic?.trim() || null, message?.trim() || null,
    ]);

    res.status(201).json({ ok: true, bookingId: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/bookings/:clientCode — list user's own bookings (requires auth)
router.get('/:clientCode', authenticatePortal, async (req, res) => {
  try {
    if (!req.portalUser) return res.status(401).json({ error: 'Authentication required.' });
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    const [bookings] = await pool.execute(`
      SELECT b.id, b.preferred_date, b.topic, b.message, b.status, b.admin_notes, b.created_at,
             m.name as msl_name, m.title as msl_title, m.specialty as msl_specialty
      FROM cp_msl_bookings b
      JOIN cp_msls m ON m.id = b.msl_id
      WHERE b.client_id = ? AND b.portal_user_id = ?
      ORDER BY b.created_at DESC
    `, [client.id, req.portalUser.id]);

    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
