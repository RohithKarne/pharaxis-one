/**
 * Portal Content — /api/portal/content
 * Public read-only content endpoints for the portal frontend
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal } = require('../../middleware/auth');

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

// CP-10: default structured Adverse Event form, used when a client hasn't configured
// one. Covers the pharmacovigilance minimum criteria (identifiable patient, reporter,
// suspect product, event) as required fields. Clients can override in the form builder.
// Select options are newline-separated to match the portal form renderer.
const DEFAULT_AE_FIELDS = [
  { field_key: 'patient_initials',  label: 'Patient initials or identifier', field_type: 'text',     options: null, placeholder: 'e.g. J.D.',   help_text: 'An identifiable patient is required to report an adverse event.', is_required: 1, display_order: 1 },
  { field_key: 'patient_age',       label: 'Patient age',                    field_type: 'text',     options: null, placeholder: 'Years',      help_text: '', is_required: 0, display_order: 2 },
  { field_key: 'patient_sex',       label: 'Patient sex',                    field_type: 'select',   options: 'Male\nFemale\nOther\nUnknown', placeholder: '', help_text: '', is_required: 0, display_order: 3 },
  { field_key: 'suspect_product',   label: 'Suspect product',                field_type: 'text',     options: null, placeholder: 'Product name', help_text: '', is_required: 1, display_order: 4 },
  { field_key: 'event_description', label: 'Describe the adverse event',     field_type: 'textarea', options: null, placeholder: 'What happened, and when?', help_text: '', is_required: 1, display_order: 5 },
  { field_key: 'seriousness',       label: 'Seriousness',                    field_type: 'select',   options: 'Death\nLife-threatening\nHospitalization\nDisability\nCongenital anomaly\nOther', placeholder: '', help_text: '', is_required: 1, display_order: 6 },
  { field_key: 'onset_date',        label: 'Event onset date',               field_type: 'text',     options: null, placeholder: 'YYYY-MM-DD', help_text: '', is_required: 0, display_order: 7 },
  { field_key: 'outcome',           label: 'Outcome',                        field_type: 'select',   options: 'Recovered\nRecovering\nNot recovered\nFatal\nUnknown', placeholder: '', help_text: '', is_required: 0, display_order: 8 },
  { field_key: 'reporter_type',     label: 'Reporter',                       field_type: 'select',   options: 'Healthcare professional\nPatient\nOther', placeholder: '', help_text: '', is_required: 1, display_order: 9 },
  { field_key: 'reporter_contact',  label: 'Reporter contact (email or phone)', field_type: 'text',  options: null, placeholder: 'For follow-up', help_text: '', is_required: 0, display_order: 10 },
].map((f, i) => ({ id: `ae-default-${i}`, ...f }));

// GET /api/portal/content/:clientCode/forms/:formType — field config for portal form rendering
router.get('/:clientCode/forms/:formType', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const [rows] = await pool.execute(
      'SELECT id, field_key, field_label AS label, field_type, field_options AS options, placeholder, help_text, is_required, display_order FROM cp_form_config WHERE client_id=? AND form_type=? AND is_active=1 ORDER BY display_order ASC',
      [client.id, req.params.formType]
    );
    // Fall back to the structured AE template when no AE form is configured.
    if (rows.length === 0 && req.params.formType === 'adverse_event') {
      return res.json({ fields: DEFAULT_AE_FIELDS, default_template: true });
    }
    res.json({ fields: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/content/:clientCode/trials — active clinical trials
router.get('/:clientCode/trials', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    // Default mock/seeded clinical trial list for HCP referral
    const trials = [
      { id: 'nct-048291', nct_id: 'NCT048291', title: 'Phase III Evaluation of PX-104 in Relapsing Multiple Sclerosis', phase: 'Phase III', indication: 'Multiple Sclerosis', status: 'Recruiting', site_location: 'Basel, Switzerland & New York, USA', pi: 'Dr. E. Vance, MD' },
      { id: 'nct-059281', nct_id: 'NCT059281', title: 'Phase II Efficacy Study of Novel Biologic Target in Advanced Oncology', phase: 'Phase II', indication: 'Solid Tumors', status: 'Recruiting', site_location: 'London, UK & Zurich, Switzerland', pi: 'Dr. M. Rossi, MD' },
      { id: 'nct-062849', nct_id: 'NCT062849', title: 'Phase I Safety and Pharmacokinetics of Subcutaneous Monoclonal Antibody', phase: 'Phase I', indication: 'Immunology', status: 'Active, Not Recruiting', site_location: 'Boston, MA, USA', pi: 'Dr. S. Thorne, PhD' },
    ];
    res.json({ items: trials });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/content/:clientCode/training — CME and REMS training modules
router.get('/:clientCode/training', async (req, res) => {
  try {
    const client = await getClient(req.params.clientCode);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const modules = [
      { id: 'cme-101', title: 'Safe Prescribing & Risk Mitigation for PX-104', type: 'REMS Certification', duration: '20 mins', credits: '1.5 CME', pass_score: 80, status: 'Available' },
      { id: 'cme-202', title: 'Advances in Targeted Biologic Therapies in 2026', type: 'CME Accredited', duration: '45 mins', credits: '2.5 CME', pass_score: 80, status: 'Available' },
      { id: 'cme-303', title: 'Adverse Event Detection & Pharmacovigilance SOP', type: 'Mandatory Compliance', duration: '15 mins', credits: '1.0 CME', pass_score: 100, status: 'Available' },
    ];
    res.json({ items: modules });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
