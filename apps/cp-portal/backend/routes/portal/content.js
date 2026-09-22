/**
 * Portal Content — /api/portal/content
 * Public read-only content endpoints for the portal frontend
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal } = require('../../middleware/auth');
const { loadFormFields } = require('../../services/formFields');
const log = require('../../utils/logger');

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
    log.error('portal.content.error', { err, route: 'GET /:clientCode/therapeutic-areas', path: req.path, request_id: req.requestId || null });
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
    log.error('portal.content.error', { err, route: 'GET /:clientCode/therapeutic-areas/:slug', path: req.path, request_id: req.requestId || null });
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
    log.error('portal.content.error', { err, route: 'GET /:clientCode/drugs', path: req.path, request_id: req.requestId || null });
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
    log.error('portal.content.error', { err, route: 'GET /:clientCode/events', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/content/:clientCode/msls
router.get('/:clientCode/msls', authenticatePortal, async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const [rows] = await pool.execute(
      'SELECT id, name, title, specialty, region, territory, email, phone, profile_image_url FROM cp_msls WHERE client_id=? AND is_active=1 ORDER BY display_order ASC, name ASC',
      [client.id]
    );
    // SEC: contact PII (email/phone) is only returned to authenticated users so
    // anonymous scrapers can't harvest the MSL directory for phishing/spam.
    const items = req.portalUser ? rows : rows.map(({ email, phone, ...rest }) => rest);
    res.json({ items });
  } catch (err) {
    log.error('portal.content.error', { err, route: 'GET /:clientCode/msls', path: req.path, request_id: req.requestId || null });
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
    log.error('portal.content.error', { err, route: 'GET /:clientCode/resources', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});


// GET /api/portal/content/:clientCode/forms/:formType — field config for portal form rendering
router.get('/:clientCode/forms/:formType', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    // CPPM-7: the same loader the submit route validates against.
    const { fields, defaultTemplate } = await loadFormFields(client.id, req.params.formType);
    res.json(defaultTemplate ? { fields, default_template: true } : { fields });
  } catch (err) {
    log.error('portal.content.error', { err, route: 'GET /:clientCode/forms/:formType', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/content/:clientCode/trials — active clinical trials
router.get('/:clientCode/trials', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    // Only what the client's admin has entered. There is deliberately no
    // fallback list: an unconfigured portal shows nothing rather than showing
    // a trial that does not exist. Doctors act on what is on this screen.
    const [rows] = await pool.execute(
      `SELECT id, nct_id, title, phase, indication, status, site_location, pi
         FROM cp_clinical_trials
        WHERE client_id = ? AND is_active = 1
        ORDER BY id DESC`,
      [client.id]
    );
    res.json({ items: rows });
  } catch (err) {
    log.error('portal.content.error', { err, route: 'GET /:clientCode/trials', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/content/:clientCode/training — CME and REMS training modules
router.get('/:clientCode/training', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    // Same rule as trials: only the client's own approved modules, no fallback.
    const [rows] = await pool.execute(
      `SELECT id, title, type, duration, credits, pass_score, status
         FROM cp_training_modules
        WHERE client_id = ? AND is_active = 1
        ORDER BY id DESC`,
      [client.id]
    );
    res.json({ items: rows });
  } catch (err) {
    log.error('portal.content.error', { err, route: 'GET /:clientCode/training', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
