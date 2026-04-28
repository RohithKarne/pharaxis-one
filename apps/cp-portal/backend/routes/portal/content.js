/**
 * Portal Content — /api/portal/content
 * Public read-only content endpoints for the portal frontend
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');

async function getClient(code) {
  const [[row]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [code]);
  return row || null;
}

// GET /api/portal/content/:clientCode/therapeutic-areas
router.get('/:clientCode/therapeutic-areas', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const [rows] = await pool.execute(
      "SELECT id, name, slug, short_desc AS description, content AS overview, image_url, display_order FROM cp_therapeutic_areas WHERE client_id=? AND is_active=1 AND status='published' ORDER BY display_order ASC",
      [client.id]
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/:clientCode/therapeutic-areas/:slug', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const [[row]] = await pool.execute(
      "SELECT id, name, slug, short_desc AS description, content AS overview, image_url FROM cp_therapeutic_areas WHERE client_id=? AND slug=? AND is_active=1 AND status='published'",
      [client.id, req.params.slug]
    );
    if (!row) return res.status(404).json({ error: 'Not found.' });
    res.json({ item: row });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/content/:clientCode/drugs  [?therapeutic_area_id=N]
router.get('/:clientCode/drugs', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const { therapeutic_area_id } = req.query;
    let query = `SELECT id, brand_name, generic_name, indication,
                        dosage_info, contraindications, side_effects,
                        prescribing_info_url, storage_conditions, image_url,
                        therapeutic_area_id, display_order
                 FROM cp_drugs WHERE client_id=? AND is_active=1 AND status='published'`;
    const params = [client.id];
    if (therapeutic_area_id) { query += ' AND therapeutic_area_id=?'; params.push(therapeutic_area_id); }
    query += ' ORDER BY display_order ASC';
    const [items] = await pool.execute(query, params);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/content/:clientCode/events
router.get('/:clientCode/events', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const [rows] = await pool.execute(
      `SELECT id, title, description, event_type,
              venue, city, country, start_date, end_date,
              registration_url, image_url, is_featured
       FROM cp_events WHERE client_id=? AND is_active=1 AND status='published' ORDER BY start_date ASC`,
      [client.id]
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/content/:clientCode/msls
router.get('/:clientCode/msls', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const [rows] = await pool.execute(
      'SELECT id, name, title, specialty, region, territory, email, phone, profile_image_url FROM cp_msls WHERE client_id=? AND is_active=1 ORDER BY display_order ASC, name ASC',
      [client.id]
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/content/:clientCode/resources
router.get('/:clientCode/resources', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const [rows] = await pool.execute(
      "SELECT id, title, description, resource_type, url, file_path, category, display_order FROM cp_resources WHERE client_id=? AND is_active=1 AND status='published' ORDER BY display_order ASC",
      [client.id]
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/content/:clientCode/forms/:formType — field config for portal form rendering
router.get('/:clientCode/forms/:formType', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const [rows] = await pool.execute(
      'SELECT id, field_key, field_label AS label, field_type, field_options AS options, placeholder, help_text, is_required, display_order FROM cp_form_config WHERE client_id=? AND form_type=? AND is_active=1 ORDER BY display_order ASC',
      [client.id, req.params.formType]
    );
    res.json({ fields: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
