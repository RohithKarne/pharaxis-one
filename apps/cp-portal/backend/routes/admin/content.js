/**
 * Admin Content — /api/admin/content
 * Therapeutic Areas, Drugs, Events, Resources per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const log = require('../../utils/logger');

router.use('/:clientId', authenticateAdmin, requireClientAccess);

// ── THERAPEUTIC AREAS ─────────────────────────────────────────

router.get('/:clientId/therapeutic-areas', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_therapeutic_areas WHERE client_id = ? ORDER BY display_order ASC', [req.params.clientId]);
    res.json({ therapeutic_areas: rows });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'GET /:clientId/therapeutic-areas', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:clientId/therapeutic-areas', authenticateAdmin, async (req, res) => {
  try {
    const { name, slug, short_desc, content, image_url, display_order } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'name and slug are required.' });
    const [result] = await pool.execute(
      `INSERT INTO cp_therapeutic_areas (client_id, name, slug, short_desc, content, image_url, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, name, slug, short_desc ?? null, content ?? null, image_url ?? null, display_order || 0]
    );
    res.status(201).json({ id: result.insertId, message: 'Therapeutic area created.' });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'POST /:clientId/therapeutic-areas', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/:clientId/therapeutic-areas/:id', authenticateAdmin, async (req, res) => {
  try {
    const allowed = ['name', 'slug', 'short_desc', 'content', 'image_url', 'is_active', 'display_order', 'status'];
    const { updates, params } = buildUpdate(req.body, allowed);
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(req.params.id, req.params.clientId);
    await pool.execute(`UPDATE cp_therapeutic_areas SET ${updates.join(', ')}, updated_at=NOW() WHERE id = ? AND client_id = ?`, params);
    res.json({ message: 'Updated.' });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'PATCH /:clientId/therapeutic-areas/:id', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:clientId/therapeutic-areas/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.execute(`UPDATE cp_therapeutic_areas SET is_active=0, updated_at=NOW() WHERE id=? AND client_id=?`, [req.params.id, req.params.clientId]);
    res.json({ message: 'Deactivated.' });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'DELETE /:clientId/therapeutic-areas/:id', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── DRUGS ─────────────────────────────────────────────────────

router.get('/:clientId/drugs', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_drugs WHERE client_id = ? ORDER BY display_order ASC', [req.params.clientId]);
    res.json({ drugs: rows });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'GET /:clientId/drugs', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:clientId/drugs', authenticateAdmin, async (req, res) => {
  try {
    const { therapeutic_area_id, brand_name, generic_name, indication, prescribing_info_url, storage_conditions, dosage_info, contraindications, side_effects, image_url, display_order } = req.body;
    if (!brand_name) return res.status(400).json({ error: 'brand_name is required.' });
    const [result] = await pool.execute(
      `INSERT INTO cp_drugs (client_id, therapeutic_area_id, brand_name, generic_name, indication, prescribing_info_url, storage_conditions, dosage_info, contraindications, side_effects, image_url, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, therapeutic_area_id ?? null, brand_name, generic_name ?? null, indication ?? null, prescribing_info_url ?? null, storage_conditions ?? null, dosage_info ?? null, contraindications ?? null, side_effects ?? null, image_url ?? null, display_order || 0]
    );
    res.status(201).json({ id: result.insertId, message: 'Drug created.' });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'POST /:clientId/drugs', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/:clientId/drugs/:id', authenticateAdmin, async (req, res) => {
  try {
    const allowed = ['therapeutic_area_id', 'brand_name', 'generic_name', 'indication', 'prescribing_info_url', 'storage_conditions', 'dosage_info', 'contraindications', 'side_effects', 'image_url', 'is_active', 'display_order', 'status'];
    const { updates, params } = buildUpdate(req.body, allowed);
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(req.params.id, req.params.clientId);
    await pool.execute(`UPDATE cp_drugs SET ${updates.join(', ')}, updated_at=NOW() WHERE id=? AND client_id=?`, params);
    res.json({ message: 'Updated.' });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'PATCH /:clientId/drugs/:id', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:clientId/drugs/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.execute(`UPDATE cp_drugs SET is_active=0, updated_at=NOW() WHERE id=? AND client_id=?`, [req.params.id, req.params.clientId]);
    res.json({ message: 'Deactivated.' });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'DELETE /:clientId/drugs/:id', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── EVENTS ────────────────────────────────────────────────────

router.get('/:clientId/events', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_events WHERE client_id = ? ORDER BY start_date ASC', [req.params.clientId]);
    res.json({ events: rows });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'GET /:clientId/events', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:clientId/events', authenticateAdmin, async (req, res) => {
  try {
    const { title, description, event_type, venue, city, country, start_date, end_date, registration_url, image_url, is_featured, display_order } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required.' });
    const [result] = await pool.execute(
      `INSERT INTO cp_events (client_id, title, description, event_type, venue, city, country, start_date, end_date, registration_url, image_url, is_featured, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, title, description ?? null, event_type || 'conference', venue ?? null, city ?? null, country ?? null, start_date ?? null, end_date ?? null, registration_url ?? null, image_url ?? null, is_featured ? 1 : 0, display_order || 0]
    );
    res.status(201).json({ id: result.insertId, message: 'Event created.' });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'POST /:clientId/events', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/:clientId/events/:id', authenticateAdmin, async (req, res) => {
  try {
    const allowed = ['title', 'description', 'event_type', 'venue', 'city', 'country', 'start_date', 'end_date', 'registration_url', 'image_url', 'is_active', 'is_featured', 'display_order', 'status'];
    const { updates, params } = buildUpdate(req.body, allowed);
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(req.params.id, req.params.clientId);
    await pool.execute(`UPDATE cp_events SET ${updates.join(', ')}, updated_at=NOW() WHERE id=? AND client_id=?`, params);
    res.json({ message: 'Updated.' });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'PATCH /:clientId/events/:id', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:clientId/events/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.execute(`UPDATE cp_events SET is_active=0, updated_at=NOW() WHERE id=? AND client_id=?`, [req.params.id, req.params.clientId]);
    res.json({ message: 'Deactivated.' });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'DELETE /:clientId/events/:id', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── RESOURCES ─────────────────────────────────────────────────

router.get('/:clientId/resources', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_resources WHERE client_id = ? ORDER BY display_order ASC', [req.params.clientId]);
    res.json({ resources: rows });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'GET /:clientId/resources', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:clientId/resources', authenticateAdmin, async (req, res) => {
  try {
    const { title, description, resource_type, url, category, display_order } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required.' });
    const [result] = await pool.execute(
      `INSERT INTO cp_resources (client_id, title, description, resource_type, url, category, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, title, description ?? null, resource_type || 'document', url ?? null, category ?? null, display_order || 0]
    );
    res.status(201).json({ id: result.insertId, message: 'Resource created.' });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'POST /:clientId/resources', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/:clientId/resources/:id', authenticateAdmin, async (req, res) => {
  try {
    const allowed = ['title', 'description', 'resource_type', 'url', 'category', 'is_active', 'display_order', 'status'];
    const { updates, params } = buildUpdate(req.body, allowed);
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(req.params.id, req.params.clientId);
    await pool.execute(`UPDATE cp_resources SET ${updates.join(', ')}, updated_at=NOW() WHERE id=? AND client_id=?`, params);
    res.json({ message: 'Updated.' });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'PATCH /:clientId/resources/:id', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:clientId/resources/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.execute(`UPDATE cp_resources SET is_active=0, updated_at=NOW() WHERE id=? AND client_id=?`, [req.params.id, req.params.clientId]);
    res.json({ message: 'Deactivated.' });
  } catch (err) {
    log.error('admin.content.error', { err, route: 'DELETE /:clientId/resources/:id', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Helper ────────────────────────────────────────────────────

function buildUpdate(body, allowed) {
  const updates = [], params = [];
  for (const key of allowed) {
    if (body[key] !== undefined) { updates.push(`${key} = ?`); params.push(body[key]); }
  }
  return { updates, params };
}

module.exports = router;
