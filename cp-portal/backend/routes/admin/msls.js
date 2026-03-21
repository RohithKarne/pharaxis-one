/**
 * Admin MSLs — /api/admin/msls
 * Medical Science Liaison directory per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

router.get('/:clientId', authenticateAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_msls WHERE client_id = ? ORDER BY display_order ASC, name ASC').all(req.params.clientId);
  res.json({ msls: rows.map(r => {
    let tas = [];
    if (r.therapeutic_areas) {
      try { tas = JSON.parse(r.therapeutic_areas); }
      catch { tas = r.therapeutic_areas.split(',').map(s => s.trim()).filter(Boolean); }
    }
    return { ...r, therapeutic_areas: tas };
  }) });
});

router.post('/:clientId', authenticateAdmin, (req, res) => {
  const { name, title, specialty, region, territory, email, phone, profile_image_url, therapeutic_areas, display_order } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const info = db.prepare(`
    INSERT INTO cp_msls (client_id, name, title, specialty, region, territory, email, phone, profile_image_url, therapeutic_areas, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.clientId, name, title || null, specialty || null, region || null, territory || null, email || null, phone || null, profile_image_url || null, therapeutic_areas ? JSON.stringify(therapeutic_areas) : null, display_order || 0);
  audit(req.admin, req.params.clientId, 'CREATE', 'msl', info.lastInsertRowid, { name });
  res.status(201).json({ id: info.lastInsertRowid, message: 'MSL created.' });
});

router.patch('/:clientId/:id', authenticateAdmin, (req, res) => {
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
  db.prepare(`UPDATE cp_msls SET ${updates.join(', ')}, updated_at=datetime('now') WHERE id=? AND client_id=?`).run(...params);
  audit(req.admin, req.params.clientId, 'UPDATE', 'msl', req.params.id, {});
  res.json({ message: 'MSL updated.' });
});

router.delete('/:clientId/:id', authenticateAdmin, (req, res) => {
  db.prepare(`UPDATE cp_msls SET is_active=0, updated_at=datetime('now') WHERE id=? AND client_id=?`).run(req.params.id, req.params.clientId);
  audit(req.admin, req.params.clientId, 'DELETE', 'msl', req.params.id, {});
  res.json({ message: 'MSL deactivated.' });
});

// ── S5-8: MSL Booking management ─────────────────────────────

// GET /api/admin/msls/:clientId/bookings
router.get('/:clientId/bookings', authenticateAdmin, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.id, b.msl_id, b.requester_name, b.requester_email, b.requester_user_type,
           b.preferred_date, b.topic, b.message, b.status, b.admin_notes, b.created_at,
           m.name as msl_name, m.title as msl_title
    FROM cp_msl_bookings b
    JOIN cp_msls m ON m.id = b.msl_id
    WHERE b.client_id = ?
    ORDER BY b.created_at DESC
  `).all(req.params.clientId);
  res.json({ bookings });
});

// PUT /api/admin/msls/:clientId/bookings/:bookingId — update status + notes
router.put('/:clientId/bookings/:bookingId', authenticateAdmin, (req, res) => {
  const { status, admin_notes } = req.body;
  const allowed = ['pending', 'confirmed', 'cancelled', 'completed'];
  if (status && !allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const fields = [], values = [];
  if (status !== undefined)      { fields.push('status = ?');      values.push(status); }
  if (admin_notes !== undefined) { fields.push('admin_notes = ?'); values.push(admin_notes?.trim() || null); }
  if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
  fields.push("updated_at = datetime('now')");
  values.push(req.params.bookingId, req.params.clientId);
  db.prepare(`UPDATE cp_msl_bookings SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`).run(...values);
  audit(req.admin, req.params.clientId, 'UPDATE', 'msl_booking', req.params.bookingId, { status });
  res.json({ ok: true });
});

// DELETE /api/admin/msls/:clientId/bookings/:bookingId
router.delete('/:clientId/bookings/:bookingId', authenticateAdmin, (req, res) => {
  db.prepare('DELETE FROM cp_msl_bookings WHERE id = ? AND client_id = ?').run(req.params.bookingId, req.params.clientId);
  audit(req.admin, req.params.clientId, 'DELETE', 'msl_booking', req.params.bookingId, {});
  res.json({ ok: true });
});

module.exports = router;
