/**
 * Admin Content — /api/admin/content
 * Therapeutic Areas, Drugs, Events, Resources per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');

// ── THERAPEUTIC AREAS ─────────────────────────────────────────

router.get('/:clientId/therapeutic-areas', authenticateAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_therapeutic_areas WHERE client_id = ? ORDER BY display_order ASC').all(req.params.clientId);
  res.json({ therapeutic_areas: rows });
});

router.post('/:clientId/therapeutic-areas', authenticateAdmin, (req, res) => {
  const { name, slug, short_desc, content, image_url, display_order } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'name and slug are required.' });
  const info = db.prepare(`
    INSERT INTO cp_therapeutic_areas (client_id, name, slug, short_desc, content, image_url, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.clientId, name, slug, short_desc || null, content || null, image_url || null, display_order || 0);
  res.status(201).json({ id: info.lastInsertRowid, message: 'Therapeutic area created.' });
});

router.patch('/:clientId/therapeutic-areas/:id', authenticateAdmin, (req, res) => {
  const allowed = ['name', 'slug', 'short_desc', 'content', 'image_url', 'is_active', 'display_order'];
  const { updates, params } = buildUpdate(req.body, allowed);
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(req.params.id, req.params.clientId);
  db.prepare(`UPDATE cp_therapeutic_areas SET ${updates.join(', ')}, updated_at=datetime('now') WHERE id = ? AND client_id = ?`).run(...params);
  res.json({ message: 'Updated.' });
});

router.delete('/:clientId/therapeutic-areas/:id', authenticateAdmin, (req, res) => {
  db.prepare(`UPDATE cp_therapeutic_areas SET is_active=0, updated_at=datetime('now') WHERE id=? AND client_id=?`).run(req.params.id, req.params.clientId);
  res.json({ message: 'Deactivated.' });
});

// ── DRUGS ─────────────────────────────────────────────────────

router.get('/:clientId/drugs', authenticateAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_drugs WHERE client_id = ? ORDER BY display_order ASC').all(req.params.clientId);
  res.json({ drugs: rows });
});

router.post('/:clientId/drugs', authenticateAdmin, (req, res) => {
  const { therapeutic_area_id, brand_name, generic_name, indication, prescribing_info_url, storage_conditions, dosage_info, contraindications, side_effects, image_url, display_order } = req.body;
  if (!brand_name) return res.status(400).json({ error: 'brand_name is required.' });
  const info = db.prepare(`
    INSERT INTO cp_drugs (client_id, therapeutic_area_id, brand_name, generic_name, indication, prescribing_info_url, storage_conditions, dosage_info, contraindications, side_effects, image_url, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.clientId, therapeutic_area_id || null, brand_name, generic_name || null, indication || null, prescribing_info_url || null, storage_conditions || null, dosage_info || null, contraindications || null, side_effects || null, image_url || null, display_order || 0);
  res.status(201).json({ id: info.lastInsertRowid, message: 'Drug created.' });
});

router.patch('/:clientId/drugs/:id', authenticateAdmin, (req, res) => {
  const allowed = ['therapeutic_area_id', 'brand_name', 'generic_name', 'indication', 'prescribing_info_url', 'storage_conditions', 'dosage_info', 'contraindications', 'side_effects', 'image_url', 'is_active', 'display_order'];
  const { updates, params } = buildUpdate(req.body, allowed);
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(req.params.id, req.params.clientId);
  db.prepare(`UPDATE cp_drugs SET ${updates.join(', ')}, updated_at=datetime('now') WHERE id=? AND client_id=?`).run(...params);
  res.json({ message: 'Updated.' });
});

router.delete('/:clientId/drugs/:id', authenticateAdmin, (req, res) => {
  db.prepare(`UPDATE cp_drugs SET is_active=0, updated_at=datetime('now') WHERE id=? AND client_id=?`).run(req.params.id, req.params.clientId);
  res.json({ message: 'Deactivated.' });
});

// ── EVENTS ────────────────────────────────────────────────────

router.get('/:clientId/events', authenticateAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_events WHERE client_id = ? ORDER BY start_date ASC').all(req.params.clientId);
  res.json({ events: rows });
});

router.post('/:clientId/events', authenticateAdmin, (req, res) => {
  const { title, description, event_type, venue, city, country, start_date, end_date, registration_url, image_url, is_featured, display_order } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required.' });
  const info = db.prepare(`
    INSERT INTO cp_events (client_id, title, description, event_type, venue, city, country, start_date, end_date, registration_url, image_url, is_featured, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.clientId, title, description || null, event_type || 'conference', venue || null, city || null, country || null, start_date || null, end_date || null, registration_url || null, image_url || null, is_featured ? 1 : 0, display_order || 0);
  res.status(201).json({ id: info.lastInsertRowid, message: 'Event created.' });
});

router.patch('/:clientId/events/:id', authenticateAdmin, (req, res) => {
  const allowed = ['title', 'description', 'event_type', 'venue', 'city', 'country', 'start_date', 'end_date', 'registration_url', 'image_url', 'is_active', 'is_featured', 'display_order'];
  const { updates, params } = buildUpdate(req.body, allowed);
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(req.params.id, req.params.clientId);
  db.prepare(`UPDATE cp_events SET ${updates.join(', ')}, updated_at=datetime('now') WHERE id=? AND client_id=?`).run(...params);
  res.json({ message: 'Updated.' });
});

router.delete('/:clientId/events/:id', authenticateAdmin, (req, res) => {
  db.prepare(`UPDATE cp_events SET is_active=0, updated_at=datetime('now') WHERE id=? AND client_id=?`).run(req.params.id, req.params.clientId);
  res.json({ message: 'Deactivated.' });
});

// ── RESOURCES ─────────────────────────────────────────────────

router.get('/:clientId/resources', authenticateAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_resources WHERE client_id = ? ORDER BY display_order ASC').all(req.params.clientId);
  res.json({ resources: rows });
});

router.post('/:clientId/resources', authenticateAdmin, (req, res) => {
  const { title, description, resource_type, url, category, display_order } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required.' });
  const info = db.prepare(`
    INSERT INTO cp_resources (client_id, title, description, resource_type, url, category, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.clientId, title, description || null, resource_type || 'document', url || null, category || null, display_order || 0);
  res.status(201).json({ id: info.lastInsertRowid, message: 'Resource created.' });
});

router.patch('/:clientId/resources/:id', authenticateAdmin, (req, res) => {
  const allowed = ['title', 'description', 'resource_type', 'url', 'category', 'is_active', 'display_order'];
  const { updates, params } = buildUpdate(req.body, allowed);
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(req.params.id, req.params.clientId);
  db.prepare(`UPDATE cp_resources SET ${updates.join(', ')}, updated_at=datetime('now') WHERE id=? AND client_id=?`).run(...params);
  res.json({ message: 'Updated.' });
});

router.delete('/:clientId/resources/:id', authenticateAdmin, (req, res) => {
  db.prepare(`UPDATE cp_resources SET is_active=0, updated_at=datetime('now') WHERE id=? AND client_id=?`).run(req.params.id, req.params.clientId);
  res.json({ message: 'Deactivated.' });
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
