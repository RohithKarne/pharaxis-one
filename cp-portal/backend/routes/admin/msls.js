/**
 * Admin MSLs — /api/admin/msls
 * Medical Science Liaison directory per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

router.get('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_msls WHERE client_id = ? ORDER BY display_order ASC, name ASC', [req.params.clientId]);
    res.json({ msls: rows.map(r => {
      let tas = [];
      if (r.therapeutic_areas) {
        try { tas = JSON.parse(r.therapeutic_areas); }
        catch { tas = r.therapeutic_areas.split(',').map(s => s.trim()).filter(Boolean); }
      }
      return { ...r, therapeutic_areas: tas };
    }) });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const { name, title, specialty, region, territory, email, phone, profile_image_url, therapeutic_areas, display_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const [info] = await pool.execute(`
      INSERT INTO cp_msls (client_id, name, title, specialty, region, territory, email, phone, profile_image_url, therapeutic_areas, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.params.clientId, name, title || null, specialty || null, region || null, territory || null, email || null, phone || null, profile_image_url || null, therapeutic_areas ? JSON.stringify(therapeutic_areas) : null, display_order || 0]);
    await audit(req.admin, req.params.clientId, 'CREATE', 'msl', info.insertId, { name });
    res.status(201).json({ id: info.insertId, message: 'MSL created.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/:clientId/:id', authenticateAdmin, async (req, res) => {
  try {
    const allowed = ['name', 'title', 'specialty', 'region', 'territory', 'email', 'phone', 'profile_image_url', 'display_order', 'is_active'];
    const updates = [], params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) { updates.push(`${key} = ?`); params.push(req.body[key]); }
    }
    if (req.body.therapeutic_areas !== undefined) {
      updates.push('therapeutic_areas = ?');
      params.push(JSON.stringify(req.body.therapeutic_areas));
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(req.params.id, req.params.clientId);
    await pool.execute(`UPDATE cp_msls SET ${updates.join(', ')}, updated_at=NOW() WHERE id=? AND client_id=?`, params);
    await audit(req.admin, req.params.clientId, 'UPDATE', 'msl', req.params.id, {});
    res.json({ message: 'MSL updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:clientId/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.execute(`UPDATE cp_msls SET is_active=0, updated_at=NOW() WHERE id=? AND client_id=?`, [req.params.id, req.params.clientId]);
    await audit(req.admin, req.params.clientId, 'DELETE', 'msl', req.params.id, {});
    res.json({ message: 'MSL deactivated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── S5-8: MSL Booking management ─────────────────────────────

// GET /api/admin/msls/:clientId/bookings
router.get('/:clientId/bookings', authenticateAdmin, async (req, res) => {
  try {
    const [bookings] = await pool.execute(`
      SELECT b.id, b.msl_id, b.requester_name, b.requester_email, b.requester_user_type,
             b.preferred_date, b.topic, b.message, b.status, b.admin_notes, b.created_at,
             m.name as msl_name, m.title as msl_title
      FROM cp_msl_bookings b
      JOIN cp_msls m ON m.id = b.msl_id
      WHERE b.client_id = ?
      ORDER BY b.created_at DESC
    `, [req.params.clientId]);
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/msls/:clientId/bookings/:bookingId — update status + notes
router.put('/:clientId/bookings/:bookingId', authenticateAdmin, async (req, res) => {
  try {
    const { status, admin_notes } = req.body;
    const allowed = ['pending', 'confirmed', 'cancelled', 'completed'];
    if (status && !allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const fields = [], values = [];
    if (status !== undefined)      { fields.push('status = ?');      values.push(status); }
    if (admin_notes !== undefined) { fields.push('admin_notes = ?'); values.push(admin_notes?.trim() || null); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    fields.push('updated_at = NOW()');
    values.push(req.params.bookingId, req.params.clientId);
    await pool.execute(`UPDATE cp_msl_bookings SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`, values);
    await audit(req.admin, req.params.clientId, 'UPDATE', 'msl_booking', req.params.bookingId, { status });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/msls/:clientId/bookings/:bookingId
router.delete('/:clientId/bookings/:bookingId', authenticateAdmin, async (req, res) => {
  try {
    await pool.execute('DELETE FROM cp_msl_bookings WHERE id = ? AND client_id = ?', [req.params.bookingId, req.params.clientId]);
    await audit(req.admin, req.params.clientId, 'DELETE', 'msl_booking', req.params.bookingId, {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
