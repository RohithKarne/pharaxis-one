/**
 * Admin Clients — /api/admin/clients
 * Manage pharma company clients
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const { getClientBundle, listClients } = require('../../services/clientService');

const DEFAULT_FEATURES = [
  { key: 'therapeutic_areas',   label: 'Therapeutic Areas & Research', order: 1 },
  { key: 'events',              label: 'Events & Conferences',          order: 2 },
  { key: 'medical_inquiry',     label: 'Submit Medical Inquiry',        order: 3 },
  { key: 'adverse_event',       label: 'Report Adverse Event',          order: 4 },
  { key: 'product_complaint',   label: 'Report Product Complaint',      order: 5 },
  { key: 'other_inquiry',       label: 'Other',                         order: 6 },
  { key: 'find_msl',            label: 'Find a MSL',                    order: 7 },
  { key: 'resources',           label: 'Resources',                     order: 8 },
  { key: 'drug_info',           label: 'Drug Information',              order: 9 },
  { key: 'chatbox',             label: 'Chat',                          order: 10 },
  { key: 'user_auth',           label: 'User Login / Registration',     order: 11 },
  { key: 'hcp_gate',            label: 'HCP Confirmation Gate',         order: 12 },
  { key: 'homepage_quicklinks', label: 'Homepage Quick Links',          order: 0 },
  { key: 'news_announcements', label: 'News & Announcements',           order: 13 },
  { key: 'document_library',   label: 'Document Library',               order: 14 },
];

const DEFAULT_FORM_FIELDS = {
  medical_inquiry: [
    { key: 'first_name',    label: 'First Name',       type: 'text',     required: 1, order: 1 },
    { key: 'last_name',     label: 'Last Name',        type: 'text',     required: 1, order: 2 },
    { key: 'email',         label: 'Email Address',    type: 'email',    required: 1, order: 3 },
    { key: 'phone',         label: 'Phone Number',     type: 'phone',    required: 0, order: 4 },
    { key: 'user_type',     label: 'You are a',        type: 'select',   required: 1, order: 5, options: ['HCP','Patient','Caregiver','Physician','Other'] },
    { key: 'product',       label: 'Product',          type: 'text',     required: 0, order: 6 },
    { key: 'question',      label: 'Your Question',    type: 'textarea', required: 1, order: 7 },
    { key: 'consent',       label: 'I consent to being contacted', type: 'checkbox', required: 1, order: 8 },
  ],
  adverse_event: [
    { key: 'reporter_name',  label: 'Reporter Name',   type: 'text',     required: 1, order: 1 },
    { key: 'reporter_email', label: 'Reporter Email',  type: 'email',    required: 1, order: 2 },
    { key: 'reporter_type',  label: 'Reporter Type',   type: 'select',   required: 1, order: 3, options: ['HCP','Patient','Caregiver','Physician','Other'] },
    { key: 'product_name',   label: 'Product Name',    type: 'text',     required: 1, order: 4 },
    { key: 'lot_number',     label: 'Lot Number',      type: 'text',     required: 0, order: 5 },
    { key: 'event_date',     label: 'Date of Event',   type: 'date',     required: 1, order: 6 },
    { key: 'description',    label: 'Event Description', type: 'textarea', required: 1, order: 7 },
    { key: 'patient_age',    label: 'Patient Age',     type: 'text',     required: 0, order: 8 },
    { key: 'outcome',        label: 'Outcome',         type: 'select',   required: 0, order: 9, options: ['Recovered','Recovering','Not Recovered','Fatal','Unknown'] },
  ],
  product_complaint: [
    { key: 'reporter_name',  label: 'Your Name',        type: 'text',     required: 1, order: 1 },
    { key: 'reporter_email', label: 'Email Address',    type: 'email',    required: 1, order: 2 },
    { key: 'product_name',   label: 'Product Name',     type: 'text',     required: 1, order: 3 },
    { key: 'lot_number',     label: 'Lot / Batch Number', type: 'text',   required: 0, order: 4 },
    { key: 'complaint_type', label: 'Complaint Type',   type: 'select',   required: 1, order: 5, options: ['Packaging Defect','Quality Issue','Wrong Product','Label Issue','Other'] },
    { key: 'description',    label: 'Complaint Description', type: 'textarea', required: 1, order: 6 },
    { key: 'purchase_date',  label: 'Purchase Date',    type: 'date',     required: 0, order: 7 },
  ],
  other_inquiry: [
    { key: 'name',    label: 'Your Name',    type: 'text',     required: 1, order: 1 },
    { key: 'email',   label: 'Email',        type: 'email',    required: 1, order: 2 },
    { key: 'subject', label: 'Subject',      type: 'text',     required: 1, order: 3 },
    { key: 'message', label: 'Message',      type: 'textarea', required: 1, order: 4 },
  ],
};

function requireSuperadmin(req, res, next) {
  if (req.admin?.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin access required.' });
  return next();
}

function requireClientScopeByIdParam(req, res, next) {
  if (req.admin?.role === 'superadmin') return next();
  const requestedClientId = String(req.params.id || '');
  const adminClientId = req.admin?.clientId != null ? String(req.admin.clientId) : null;
  if (!adminClientId || adminClientId !== requestedClientId) {
    return res.status(403).json({ error: 'Access denied. You can only manage your own client.' });
  }
  return next();
}

// MED-33: cp_portal_users is NOT joined in any SELECT query in this file.
// The only reference to cp_portal_users is a COUNT(*) query in the soft-delete handler
// for cascade verification — it never returns user rows or password_hash to the API response.
// No password_hash stripping is required here.

// GET /api/admin/clients
router.get('/', authenticateAdmin, requireSuperadmin, async (_req, res) => {
  try {
    res.json({ clients: await listClients(pool) });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/clients/:id
router.get('/:id', authenticateAdmin, requireClientScopeByIdParam, async (req, res) => {
  try {
    const bundle = await getClientBundle(pool, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Client not found.' });
    res.json(bundle);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/clients/:id/readiness — F5-01: 8 automated readiness checks
router.get('/:id/readiness', authenticateAdmin, requireClientScopeByIdParam, async (req, res) => {
  try {
    const id = req.params.id;
    const [[client]] = await pool.execute('SELECT * FROM cp_clients WHERE id = ?', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const [[branding]] = await pool.execute('SELECT * FROM cp_branding WHERE client_id = ?', [id]);
    const [[{ cnt: enabledFeatureCount }]] = await pool.execute('SELECT COUNT(*) as cnt FROM cp_features WHERE client_id = ? AND is_enabled = 1', [id]);
    const [[{ cnt: newsCount }]] = await pool.execute("SELECT COUNT(*) as cnt FROM cp_news_posts WHERE client_id = ? AND status = 'published'", [id]);
    const [[{ cnt: safetyCount }]] = await pool.execute("SELECT COUNT(*) as cnt FROM cp_safety_alerts WHERE client_id = ? AND status = 'active'", [id]);
    const [[{ cnt: docCount }]] = await pool.execute("SELECT COUNT(*) as cnt FROM cp_documents WHERE client_id = ? AND is_active = 1 AND status = 'published'", [id]);
    const [[{ cnt: mslCount }]] = await pool.execute('SELECT COUNT(*) as cnt FROM cp_msls WHERE client_id = ? AND is_active = 1', [id]);
    const [[compliance]] = await pool.execute('SELECT * FROM cp_compliance_config WHERE client_id = ?', [id]);

    const checks = [
      { key: 'branding',     label: 'Branding configured',          done: !!(branding?.logo_url && branding?.portal_name),          hint: 'Upload a logo and set a portal name', path: 'branding' },
      { key: 'logo',         label: 'Logo uploaded',                done: !!branding?.logo_url,                                      hint: 'Upload a logo in Branding & Theme', path: 'branding' },
      { key: 'compliance',   label: 'Compliance enabled',           done: !!(compliance && compliance.jurisdictions_json !== '[]'),  hint: 'Configure compliance jurisdictions', path: 'compliance' },
      { key: 'features',     label: 'Features configured',          done: enabledFeatureCount > 0,                                   hint: 'Enable at least one portal feature', path: 'features' },
      { key: 'news',         label: 'News post published',          done: newsCount > 0,                                             hint: 'Publish at least one news post', path: 'news' },
      { key: 'content',      label: 'Safety alert or document live', done: safetyCount > 0 || docCount > 0,                          hint: 'Add a safety alert or publish a document', path: 'documents' },
      { key: 'msl',          label: 'MSL added',                    done: mslCount > 0,                                              hint: 'Add at least one Medical Science Liaison', path: 'msls' },
      { key: 'portal_url',   label: 'Custom brand color set',       done: !!(branding?.primary_color && branding.primary_color !== '#2563EB'), hint: 'Set a custom brand color in Branding & Theme', path: 'branding' },
    ];

    const doneCount = checks.filter(c => c.done).length;
    const score = Math.round((doneCount / checks.length) * 100);
    const label = score >= 90 ? 'Ready' : score >= 60 ? 'Almost Ready' : 'Not Ready';

    res.json({ checks, score, label, done: doneCount, total: checks.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/clients — create client + seed defaults
router.post('/', authenticateAdmin, requireSuperadmin, async (req, res) => {
  try {
    const { name, code, description, contact_name, contact_email } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'name and code are required.' });

    const [[exists]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ?', [code.toLowerCase()]);
    if (exists) return res.status(409).json({ error: 'Client code already exists.' });

    const [info] = await pool.execute(`
      INSERT INTO cp_clients (name, code, description, contact_name, contact_email)
      VALUES (?, ?, ?, ?, ?)
    `, [name, code.toLowerCase(), description ?? null, contact_name ?? null, contact_email ?? null]);

    const clientId = info.insertId;

    // Seed default branding
    await pool.execute(`INSERT INTO cp_branding (client_id, portal_name) VALUES (?, ?)`, [clientId, name]);

    // Seed default features (all enabled)
    for (const f of DEFAULT_FEATURES) {
      await pool.execute(`
        INSERT INTO cp_features (client_id, feature_key, is_enabled, display_name, display_order)
        VALUES (?, ?, 1, ?, ?)
      `, [clientId, f.key, f.label, f.order]);
    }

    // Seed default form fields for all 4 submission types
    for (const [formType, fields] of Object.entries(DEFAULT_FORM_FIELDS)) {
      for (const f of fields) {
        await pool.execute(`
          INSERT INTO cp_form_config (client_id, form_type, field_key, field_label, field_type, field_options, is_required, display_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [clientId, formType, f.key, f.label, f.type, f.options ? JSON.stringify(f.options) : null, f.required, f.order]);
      }
    }

    // Seed empty chatbox config
    await pool.execute(`INSERT INTO cp_chatbox_config (client_id) VALUES (?)`, [clientId]);

    // Seed gate config (off by default)
    await pool.execute(`INSERT INTO cp_gate_config (client_id) VALUES (?)`, [clientId]);

    // Seed default gate user types
    const DEFAULT_GATE_TYPES = [
      { key: 'hcp',       label: 'Healthcare Professional (HCP)', desc: 'Licensed physician, nurse, pharmacist, or other credentialed healthcare provider.', icon: '🩺', order: 1 },
      { key: 'physician', label: 'Physician / Specialist',        desc: 'Medical doctor or specialist with prescribing authority.',                          icon: '👨‍⚕️', order: 2 },
      { key: 'patient',   label: 'Patient / Caregiver',           desc: 'Patient, family member, or caregiver seeking product or disease information.',       icon: '🙋', order: 3 },
      { key: 'non_hcp',   label: 'Non-HCP Professional',          desc: 'Healthcare-adjacent professional such as administrator, researcher, or student.',     icon: '💼', order: 4 },
      { key: 'other',     label: 'Other',                         desc: 'General member of the public or other interested party.',                            icon: '👤', order: 5 },
    ];
    for (const t of DEFAULT_GATE_TYPES) {
      await pool.execute(`INSERT INTO cp_gate_user_types (client_id, type_key, label, description, icon, display_order) VALUES (?,?,?,?,?,?)`,
        [clientId, t.key, t.label, t.desc, t.icon, t.order]);
    }

    // Seed feature access — all features allowed for all user types by default
    for (const f of DEFAULT_FEATURES) {
      for (const t of DEFAULT_GATE_TYPES) {
        await pool.execute(`INSERT IGNORE INTO cp_feature_access (client_id, feature_key, type_key, is_allowed) VALUES (?,?,?,1)`,
          [clientId, f.key, t.key]);
      }
    }

    await audit(req.admin, clientId, 'CREATE', 'client', clientId, { name, code });
    res.status(201).json({ id: clientId, message: 'Client created with default configuration.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/clients/:id
router.patch('/:id', authenticateAdmin, requireClientScopeByIdParam, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, contact_name, contact_email, is_active } = req.body;
    const updates = [], params = [];
    if (name !== undefined)          { updates.push('name = ?');          params.push(name); }
    if (description !== undefined)   { updates.push('description = ?');   params.push(description); }
    if (contact_name !== undefined)  { updates.push('contact_name = ?');  params.push(contact_name); }
    if (contact_email !== undefined) { updates.push('contact_email = ?'); params.push(contact_email); }
    if (is_active !== undefined)     { updates.push('is_active = ?');     params.push(is_active ? 1 : 0); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    updates.push(`updated_at = NOW()`);
    params.push(id);
    await pool.execute(`UPDATE cp_clients SET ${updates.join(', ')} WHERE id = ?`, params);
    await audit(req.admin, Number(id), 'UPDATE', 'client', Number(id), req.body);
    res.json({ message: 'Client updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/clients/:id — soft delete
router.delete('/:id', authenticateAdmin, requireClientScopeByIdParam, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    await pool.execute(`UPDATE cp_clients SET is_active = 0, updated_at = NOW() WHERE id = ?`, [clientId]);

    // SYNC-01: Verify cascade health — soft delete does not fire MySQL CASCADE; hard delete does.
    // Log a warning if key child records remain after a hard delete would have been attempted.
    // For soft delete this is informational: child rows are expected to remain (they belong to the client).
    // If a future hard-delete path is used, these counts should be 0.
    try {
      const [[{ cnt: submissionCount }]] = await pool.execute('SELECT COUNT(*) as cnt FROM cp_submissions WHERE client_id = ?', [clientId]);
      const [[{ cnt: userCount }]] = await pool.execute('SELECT COUNT(*) as cnt FROM cp_portal_users WHERE client_id = ?', [clientId]);
      if (submissionCount > 0 || userCount > 0) {
        console.warn(`[SYNC-01] Client ${clientId} deactivated — ${submissionCount} submission(s) and ${userCount} portal user(s) remain in child tables (expected for soft delete; would cascade on hard delete).`);
      }
    } catch (verifyErr) {
      console.error(`[SYNC-01] Cascade verification query failed for client ${clientId}:`, verifyErr.message);
    }

    await audit(req.admin, clientId, 'DELETE', 'client', clientId, {});
    res.json({ message: 'Client deactivated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
