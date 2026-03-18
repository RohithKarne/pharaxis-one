/**
 * Admin Clients — /api/admin/clients
 * Manage pharma company clients
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

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

// MED-33: cp_portal_users is NOT joined in any SELECT query in this file.
// The only reference to cp_portal_users is a COUNT(*) query in the soft-delete handler
// for cascade verification — it never returns user rows or password_hash to the API response.
// No password_hash stripping is required here.

// GET /api/admin/clients
router.get('/', authenticateAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT c.*, COUNT(s.id) as submission_count
    FROM cp_clients c
    LEFT JOIN cp_submissions s ON s.client_id = c.id
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all();
  res.json({ clients: rows });
});

// GET /api/admin/clients/:id
router.get('/:id', authenticateAdmin, (req, res) => {
  const client = db.prepare('SELECT * FROM cp_clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const branding  = db.prepare('SELECT * FROM cp_branding WHERE client_id = ?').get(req.params.id);
  const features  = db.prepare('SELECT * FROM cp_features WHERE client_id = ? ORDER BY display_order ASC').all(req.params.id);
  res.json({ client, branding: branding || null, features });
});

// POST /api/admin/clients — create client + seed defaults
router.post('/', authenticateAdmin, (req, res) => {
  const { name, code, description, contact_name, contact_email } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code are required.' });

  const exists = db.prepare('SELECT id FROM cp_clients WHERE code = ?').get(code.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Client code already exists.' });

  const info = db.prepare(`
    INSERT INTO cp_clients (name, code, description, contact_name, contact_email)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, code.toLowerCase(), description || null, contact_name || null, contact_email || null);

  const clientId = info.lastInsertRowid;

  // Seed default branding
  db.prepare(`INSERT INTO cp_branding (client_id, portal_name) VALUES (?, ?)`).run(clientId, name);

  // Seed default features (all enabled)
  const insFeature = db.prepare(`
    INSERT INTO cp_features (client_id, feature_key, is_enabled, display_name, display_order)
    VALUES (?, ?, 1, ?, ?)
  `);
  for (const f of DEFAULT_FEATURES) insFeature.run(clientId, f.key, f.label, f.order);

  // Seed default form fields for all 4 submission types
  const insField = db.prepare(`
    INSERT INTO cp_form_config (client_id, form_type, field_key, field_label, field_type, field_options, is_required, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [formType, fields] of Object.entries(DEFAULT_FORM_FIELDS)) {
    for (const f of fields) {
      insField.run(clientId, formType, f.key, f.label, f.type, f.options ? JSON.stringify(f.options) : null, f.required, f.order);
    }
  }

  // Seed empty chatbox config
  db.prepare(`INSERT INTO cp_chatbox_config (client_id) VALUES (?)`).run(clientId);

  // Seed gate config (off by default)
  db.prepare(`INSERT INTO cp_gate_config (client_id) VALUES (?)`).run(clientId);

  // Seed default gate user types
  const DEFAULT_GATE_TYPES = [
    { key: 'hcp',       label: 'Healthcare Professional (HCP)', desc: 'Licensed physician, nurse, pharmacist, or other credentialed healthcare provider.', icon: '🩺', order: 1 },
    { key: 'physician', label: 'Physician / Specialist',        desc: 'Medical doctor or specialist with prescribing authority.',                          icon: '👨‍⚕️', order: 2 },
    { key: 'patient',   label: 'Patient / Caregiver',           desc: 'Patient, family member, or caregiver seeking product or disease information.',       icon: '🙋', order: 3 },
    { key: 'non_hcp',   label: 'Non-HCP Professional',          desc: 'Healthcare-adjacent professional such as administrator, researcher, or student.',     icon: '💼', order: 4 },
    { key: 'other',     label: 'Other',                         desc: 'General member of the public or other interested party.',                            icon: '👤', order: 5 },
  ];
  const insGateType = db.prepare(`INSERT INTO cp_gate_user_types (client_id, type_key, label, description, icon, display_order) VALUES (?,?,?,?,?,?)`);
  for (const t of DEFAULT_GATE_TYPES) insGateType.run(clientId, t.key, t.label, t.desc, t.icon, t.order);

  // Seed feature access — all features allowed for all user types by default
  const insAccess = db.prepare(`INSERT OR IGNORE INTO cp_feature_access (client_id, feature_key, type_key, is_allowed) VALUES (?,?,?,1)`);
  for (const f of DEFAULT_FEATURES) {
    for (const t of DEFAULT_GATE_TYPES) insAccess.run(clientId, f.key, t.key);
  }

  audit(req.admin, clientId, 'CREATE', 'client', clientId, { name, code });
  res.status(201).json({ id: clientId, message: 'Client created with default configuration.' });
});

// PATCH /api/admin/clients/:id
router.patch('/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const { name, description, contact_name, contact_email, is_active } = req.body;
  const updates = [], params = [];
  if (name !== undefined)          { updates.push('name = ?');          params.push(name); }
  if (description !== undefined)   { updates.push('description = ?');   params.push(description); }
  if (contact_name !== undefined)  { updates.push('contact_name = ?');  params.push(contact_name); }
  if (contact_email !== undefined) { updates.push('contact_email = ?'); params.push(contact_email); }
  if (is_active !== undefined)     { updates.push('is_active = ?');     params.push(is_active ? 1 : 0); }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
  updates.push(`updated_at = datetime('now')`);
  params.push(id);
  db.prepare(`UPDATE cp_clients SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  audit(req.admin, Number(id), 'UPDATE', 'client', Number(id), req.body);
  res.json({ message: 'Client updated.' });
});

// DELETE /api/admin/clients/:id — soft delete
router.delete('/:id', authenticateAdmin, (req, res) => {
  const clientId = Number(req.params.id);
  db.prepare(`UPDATE cp_clients SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(clientId);

  // SYNC-01: Verify cascade health — soft delete does not fire SQLite CASCADE; hard delete does.
  // Log a warning if key child records remain after a hard delete would have been attempted.
  // For soft delete this is informational: child rows are expected to remain (they belong to the client).
  // If a future hard-delete path is used, these counts should be 0.
  try {
    const submissionCount = db.prepare('SELECT COUNT(*) as cnt FROM cp_submissions WHERE client_id = ?').get(clientId)?.cnt || 0;
    const userCount       = db.prepare('SELECT COUNT(*) as cnt FROM cp_portal_users WHERE client_id = ?').get(clientId)?.cnt || 0;
    if (submissionCount > 0 || userCount > 0) {
      console.warn(`[SYNC-01] Client ${clientId} deactivated — ${submissionCount} submission(s) and ${userCount} portal user(s) remain in child tables (expected for soft delete; would cascade on hard delete).`);
    }
  } catch (verifyErr) {
    console.error(`[SYNC-01] Cascade verification query failed for client ${clientId}:`, verifyErr.message);
  }

  audit(req.admin, clientId, 'DELETE', 'client', clientId, {});
  res.json({ message: 'Client deactivated.' });
});

module.exports = router;
