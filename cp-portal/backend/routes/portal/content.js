/**
 * Portal Content — /api/portal/content
 * Public read-only content endpoints for the portal frontend
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');

function getClient(code) {
  return db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(code);
}

// GET /api/portal/content/:clientCode/therapeutic-areas
router.get('/:clientCode/therapeutic-areas', (req, res) => {
  const client = getClient(req.params.clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });
  const rows = db.prepare(
    'SELECT id, name, slug, short_desc AS description, content AS overview, image_url, display_order FROM cp_therapeutic_areas WHERE client_id=? AND is_active=1 ORDER BY display_order ASC'
  ).all(client.id);
  res.json({ items: rows });
});

router.get('/:clientCode/therapeutic-areas/:slug', (req, res) => {
  const client = getClient(req.params.clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });
  const row = db.prepare(
    'SELECT id, name, slug, short_desc AS description, content AS overview, image_url FROM cp_therapeutic_areas WHERE client_id=? AND slug=? AND is_active=1'
  ).get(client.id, req.params.slug);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  res.json({ item: row });
});

// GET /api/portal/content/:clientCode/drugs  [?therapeutic_area_id=N]
router.get('/:clientCode/drugs', (req, res) => {
  const client = getClient(req.params.clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });
  const { therapeutic_area_id } = req.query;
  let query = `SELECT id, brand_name, generic_name, indication,
                      dosage_info, contraindications, side_effects,
                      prescribing_info_url, storage_conditions, image_url,
                      therapeutic_area_id, display_order
               FROM cp_drugs WHERE client_id=? AND is_active=1`;
  const params = [client.id];
  if (therapeutic_area_id) { query += ' AND therapeutic_area_id=?'; params.push(therapeutic_area_id); }
  query += ' ORDER BY display_order ASC';
  res.json({ items: db.prepare(query).all(...params) });
});

// GET /api/portal/content/:clientCode/events
router.get('/:clientCode/events', (req, res) => {
  const client = getClient(req.params.clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });
  const rows = db.prepare(
    `SELECT id, title, description, event_type,
            venue, city, country, start_date, end_date,
            registration_url, image_url, is_featured
     FROM cp_events WHERE client_id=? AND is_active=1 ORDER BY start_date ASC`
  ).all(client.id);
  res.json({ items: rows });
});

// GET /api/portal/content/:clientCode/msls
router.get('/:clientCode/msls', (req, res) => {
  const client = getClient(req.params.clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });
  const rows = db.prepare(
    'SELECT id, name, title, specialty, region, territory, email, phone, profile_image_url FROM cp_msls WHERE client_id=? AND is_active=1 ORDER BY display_order ASC, name ASC'
  ).all(client.id);
  res.json({ items: rows });
});

// GET /api/portal/content/:clientCode/resources
router.get('/:clientCode/resources', (req, res) => {
  const client = getClient(req.params.clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });
  const rows = db.prepare(
    'SELECT id, title, description, resource_type, url, file_path, category, display_order FROM cp_resources WHERE client_id=? AND is_active=1 ORDER BY display_order ASC'
  ).all(client.id);
  res.json({ items: rows });
});

// GET /api/portal/content/:clientCode/forms/:formType — field config for portal form rendering
router.get('/:clientCode/forms/:formType', (req, res) => {
  const client = getClient(req.params.clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });
  const rows = db.prepare(
    'SELECT id, field_key, field_label AS label, field_type, field_options AS options, placeholder, help_text, is_required, display_order FROM cp_form_config WHERE client_id=? AND form_type=? AND is_active=1 ORDER BY display_order ASC'
  ).all(client.id, req.params.formType);
  res.json({ fields: rows });
});

module.exports = router;
