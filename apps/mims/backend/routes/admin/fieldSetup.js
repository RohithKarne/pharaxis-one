'use strict';

/**
 * admin/fieldSetup.js — Case Form Field Configuration API
 * Manages which fields appear in each case form section and their properties.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

const DEFAULT_FIELDS = [
  // ── Contact / Requestor ──────────────────────────────────────────────────────
  { section_name: 'Contact / Requestor', field_name: 'First Name',        field_type: 'text',     is_required: 1, sort_order: 1 },
  { section_name: 'Contact / Requestor', field_name: 'Last Name',         field_type: 'text',     is_required: 1, sort_order: 2 },
  { section_name: 'Contact / Requestor', field_name: 'Contact Type',      field_type: 'dropdown', is_required: 1, sort_order: 3, picklist_type: 'contact_type' },
  { section_name: 'Contact / Requestor', field_name: 'Email',             field_type: 'text',     is_required: 0, sort_order: 4 },
  { section_name: 'Contact / Requestor', field_name: 'Phone',             field_type: 'text',     is_required: 0, sort_order: 5 },
  { section_name: 'Contact / Requestor', field_name: 'Specialty',         field_type: 'text',     is_required: 0, sort_order: 6 },
  { section_name: 'Contact / Requestor', field_name: 'Institution',       field_type: 'text',     is_required: 0, sort_order: 7 },
  { section_name: 'Contact / Requestor', field_name: 'Country',           field_type: 'dropdown', is_required: 0, sort_order: 8, picklist_type: 'country' },
  { section_name: 'Contact / Requestor', field_name: 'Do Not Update Master Data', field_type: 'checkbox', is_required: 0, sort_order: 9 },

  // ── Case Information ─────────────────────────────────────────────────────────
  { section_name: 'Case Information', field_name: 'Case Number',          field_type: 'text',     is_required: 1, sort_order: 1 },
  { section_name: 'Case Information', field_name: 'Date Received',        field_type: 'date',     is_required: 1, sort_order: 2 },
  { section_name: 'Case Information', field_name: 'Date of Intake',       field_type: 'date',     is_required: 0, sort_order: 3 },
  { section_name: 'Case Information', field_name: 'Case Type',            field_type: 'dropdown', is_required: 1, sort_order: 4, picklist_type: 'case_type' },
  { section_name: 'Case Information', field_name: 'Case Status',          field_type: 'dropdown', is_required: 1, sort_order: 5, picklist_type: 'case_status' },
  { section_name: 'Case Information', field_name: 'Case Owner',           field_type: 'lookup',   is_required: 0, sort_order: 6, lookup_target: 'user' },
  { section_name: 'Case Information', field_name: 'Organisation',         field_type: 'lookup',   is_required: 1, sort_order: 7, lookup_target: 'org' },
  { section_name: 'Case Information', field_name: 'Site',                 field_type: 'lookup',   is_required: 0, sort_order: 8, lookup_target: 'site' },
  { section_name: 'Case Information', field_name: 'Intake Channel',       field_type: 'dropdown', is_required: 0, sort_order: 9, picklist_type: 'intake_channel' },
  { section_name: 'Case Information', field_name: 'Priority',             field_type: 'dropdown', is_required: 0, sort_order: 10, picklist_type: 'priority' },
  { section_name: 'Case Information', field_name: 'Description',          field_type: 'textarea', is_required: 0, sort_order: 11 },
  { section_name: 'Case Information', field_name: 'Internal Notes',       field_type: 'textarea', is_required: 0, sort_order: 12 },

  // ── MI — Category & Product ──────────────────────────────────────────────────
  { section_name: 'MI — Category & Product', field_name: 'MI Category',   field_type: 'dropdown', is_required: 1, sort_order: 1, picklist_type: 'mi_category' },
  { section_name: 'MI — Category & Product', field_name: 'MI Subcategory',field_type: 'dropdown', is_required: 0, sort_order: 2, picklist_type: 'mi_subcategory' },
  { section_name: 'MI — Category & Product', field_name: 'Product',       field_type: 'lookup',   is_required: 0, sort_order: 3, lookup_target: 'product' },

  // ── MI — Question Details ────────────────────────────────────────────────────
  { section_name: 'MI — Question Details', field_name: 'Question Summary',field_type: 'text',     is_required: 1, sort_order: 1 },
  { section_name: 'MI — Question Details', field_name: 'Detailed Question',field_type: 'textarea',is_required: 0, sort_order: 2 },

  // ── MI — Response ────────────────────────────────────────────────────────────
  { section_name: 'MI — Response', field_name: 'Response Required By',    field_type: 'date',     is_required: 0, sort_order: 1 },
  { section_name: 'MI — Response', field_name: 'Response Provided',       field_type: 'textarea', is_required: 0, sort_order: 2 },
  { section_name: 'MI — Response', field_name: 'Response Date',           field_type: 'date',     is_required: 0, sort_order: 3 },
  { section_name: 'MI — Response', field_name: 'Response Channel',        field_type: 'dropdown', is_required: 0, sort_order: 4, picklist_type: 'response_channel' },

  // ── AE — General ────────────────────────────────────────────────────────────
  { section_name: 'AE — General', field_name: 'AE Version',               field_type: 'text',     is_required: 0, sort_order: 1 },
  { section_name: 'AE — General', field_name: 'AE Status',                field_type: 'dropdown', is_required: 1, sort_order: 2, picklist_type: 'ae_status' },
  { section_name: 'AE — General', field_name: 'Date of Awareness',        field_type: 'date',     is_required: 0, sort_order: 3 },
  { section_name: 'AE — General', field_name: 'Report Type',              field_type: 'dropdown', is_required: 0, sort_order: 4, picklist_type: 'ae_report_type' },
  { section_name: 'AE — General', field_name: 'Regulatory Reportability', field_type: 'dropdown', is_required: 0, sort_order: 5, picklist_type: 'regulatory_reportability' },

  // ── AE — Events & Seriousness ───────────────────────────────────────────────
  { section_name: 'AE — Events & Seriousness', field_name: 'Event Description', field_type: 'textarea', is_required: 0, sort_order: 1 },
  { section_name: 'AE — Events & Seriousness', field_name: 'Onset Date',        field_type: 'date',     is_required: 0, sort_order: 2 },
  { section_name: 'AE — Events & Seriousness', field_name: 'Outcome',           field_type: 'dropdown', is_required: 0, sort_order: 3, picklist_type: 'ae_outcome' },
  { section_name: 'AE — Events & Seriousness', field_name: 'Serious — Death',              field_type: 'checkbox', is_required: 0, sort_order: 4 },
  { section_name: 'AE — Events & Seriousness', field_name: 'Serious — Life Threatening',   field_type: 'checkbox', is_required: 0, sort_order: 5 },
  { section_name: 'AE — Events & Seriousness', field_name: 'Serious — Hospitalisation',    field_type: 'checkbox', is_required: 0, sort_order: 6 },
  { section_name: 'AE — Events & Seriousness', field_name: 'Serious — Disability',         field_type: 'checkbox', is_required: 0, sort_order: 7 },
  { section_name: 'AE — Events & Seriousness', field_name: 'Serious — Congenital Anomaly', field_type: 'checkbox', is_required: 0, sort_order: 8 },
  { section_name: 'AE — Events & Seriousness', field_name: 'Serious — Other Medically Important', field_type: 'checkbox', is_required: 0, sort_order: 9 },

  // ── AE — Patient Information ─────────────────────────────────────────────────
  { section_name: 'AE — Patient Information', field_name: 'Patient Initials',   field_type: 'text',     is_required: 0, sort_order: 1 },
  { section_name: 'AE — Patient Information', field_name: 'Date of Birth',      field_type: 'date',     is_required: 0, sort_order: 2 },
  { section_name: 'AE — Patient Information', field_name: 'Age',                field_type: 'number',   is_required: 0, sort_order: 3 },
  { section_name: 'AE — Patient Information', field_name: 'Age Unit',           field_type: 'dropdown', is_required: 0, sort_order: 4, picklist_type: 'age_unit' },
  { section_name: 'AE — Patient Information', field_name: 'Gender',             field_type: 'dropdown', is_required: 0, sort_order: 5, picklist_type: 'gender' },
  { section_name: 'AE — Patient Information', field_name: 'Weight (kg)',        field_type: 'number',   is_required: 0, sort_order: 6 },
  { section_name: 'AE — Patient Information', field_name: 'Height (cm)',        field_type: 'number',   is_required: 0, sort_order: 7 },
  { section_name: 'AE — Patient Information', field_name: 'Pregnant',           field_type: 'dropdown', is_required: 0, sort_order: 8, picklist_type: 'yes_no' },
  { section_name: 'AE — Patient Information', field_name: 'Patient Country',    field_type: 'dropdown', is_required: 0, sort_order: 9, picklist_type: 'country' },

  // ── AE — Lab Results ────────────────────────────────────────────────────────
  { section_name: 'AE — Lab Results', field_name: 'Lab Name',             field_type: 'text', is_required: 0, sort_order: 1 },
  { section_name: 'AE — Lab Results', field_name: 'Test Date',            field_type: 'date', is_required: 0, sort_order: 2 },
  { section_name: 'AE — Lab Results', field_name: 'Test Name',            field_type: 'text', is_required: 0, sort_order: 3 },
  { section_name: 'AE — Lab Results', field_name: 'Result Value',         field_type: 'text', is_required: 0, sort_order: 4 },
  { section_name: 'AE — Lab Results', field_name: 'Normal Range',         field_type: 'text', is_required: 0, sort_order: 5 },

  // ── AE — Lab Notes ──────────────────────────────────────────────────────────
  { section_name: 'AE — Lab Notes', field_name: 'Lab Notes',              field_type: 'textarea', is_required: 0, sort_order: 1 },

  // ── AE — Medical History ─────────────────────────────────────────────────────
  { section_name: 'AE — Medical History', field_name: 'Medical History',  field_type: 'textarea', is_required: 0, sort_order: 1 },
  { section_name: 'AE — Medical History', field_name: 'Relevant History', field_type: 'textarea', is_required: 0, sort_order: 2 },

  // ── AE — Medical Notes ───────────────────────────────────────────────────────
  { section_name: 'AE — Medical Notes', field_name: 'Medical Notes',      field_type: 'textarea', is_required: 0, sort_order: 1 },
  { section_name: 'AE — Medical Notes', field_name: 'Narrative',          field_type: 'textarea', is_required: 0, sort_order: 2 },

  // ── AE — Product Information ─────────────────────────────────────────────────
  { section_name: 'AE — Product Information', field_name: 'Product Name',       field_type: 'lookup',   is_required: 0, sort_order: 1, lookup_target: 'product' },
  { section_name: 'AE — Product Information', field_name: 'Batch / Lot Number', field_type: 'text',     is_required: 0, sort_order: 2 },
  { section_name: 'AE — Product Information', field_name: 'Dose',               field_type: 'text',     is_required: 0, sort_order: 3 },
  { section_name: 'AE — Product Information', field_name: 'Dose Unit',          field_type: 'dropdown', is_required: 0, sort_order: 4, picklist_type: 'dose_unit' },
  { section_name: 'AE — Product Information', field_name: 'Route of Administration', field_type: 'dropdown', is_required: 0, sort_order: 5, picklist_type: 'route_of_admin' },
  { section_name: 'AE — Product Information', field_name: 'Start Date',         field_type: 'date',     is_required: 0, sort_order: 6 },
  { section_name: 'AE — Product Information', field_name: 'Stop Date',          field_type: 'date',     is_required: 0, sort_order: 7 },
  { section_name: 'AE — Product Information', field_name: 'Indication',         field_type: 'text',     is_required: 0, sort_order: 8 },
  { section_name: 'AE — Product Information', field_name: 'Action Taken',       field_type: 'dropdown', is_required: 0, sort_order: 9, picklist_type: 'action_taken' },
  { section_name: 'AE — Product Information', field_name: 'Concomitant Medications', field_type: 'textarea', is_required: 0, sort_order: 10 },

  // ── PC — General ─────────────────────────────────────────────────────────────
  { section_name: 'PC — General', field_name: 'PC Version',               field_type: 'text',     is_required: 0, sort_order: 1 },
  { section_name: 'PC — General', field_name: 'PC Status',                field_type: 'dropdown', is_required: 1, sort_order: 2, picklist_type: 'pc_status' },
  { section_name: 'PC — General', field_name: 'PC Category',              field_type: 'dropdown', is_required: 1, sort_order: 3, picklist_type: 'pc_category' },
  { section_name: 'PC — General', field_name: 'Complaint Description',    field_type: 'textarea', is_required: 1, sort_order: 4 },
  { section_name: 'PC — General', field_name: 'Date of Complaint',        field_type: 'date',     is_required: 0, sort_order: 5 },

  // ── PC — Patient Information ─────────────────────────────────────────────────
  { section_name: 'PC — Patient Information', field_name: 'Patient Name',  field_type: 'text',     is_required: 0, sort_order: 1 },
  { section_name: 'PC — Patient Information', field_name: 'Date of Birth', field_type: 'date',     is_required: 0, sort_order: 2 },
  { section_name: 'PC — Patient Information', field_name: 'Gender',        field_type: 'dropdown', is_required: 0, sort_order: 3, picklist_type: 'gender' },
  { section_name: 'PC — Patient Information', field_name: 'Injury Experienced', field_type: 'dropdown', is_required: 0, sort_order: 4, picklist_type: 'yes_no' },

  // ── PC — Product Information ─────────────────────────────────────────────────
  { section_name: 'PC — Product Information', field_name: 'Product Name',       field_type: 'lookup',   is_required: 0, sort_order: 1, lookup_target: 'product' },
  { section_name: 'PC — Product Information', field_name: 'Batch / Lot Number', field_type: 'text',     is_required: 0, sort_order: 2 },
  { section_name: 'PC — Product Information', field_name: 'Expiry Date',        field_type: 'date',     is_required: 0, sort_order: 3 },
  { section_name: 'PC — Product Information', field_name: 'Manufacturing Date', field_type: 'date',     is_required: 0, sort_order: 4 },
  { section_name: 'PC — Product Information', field_name: 'Pack Size',          field_type: 'text',     is_required: 0, sort_order: 5 },

  // ── PC — Return & Retrieval ──────────────────────────────────────────────────
  { section_name: 'PC — Return & Retrieval', field_name: 'Return Requested',  field_type: 'dropdown', is_required: 0, sort_order: 1, picklist_type: 'yes_no' },
  { section_name: 'PC — Return & Retrieval', field_name: 'Return Date',       field_type: 'date',     is_required: 0, sort_order: 2 },
  { section_name: 'PC — Return & Retrieval', field_name: 'Return Address',    field_type: 'textarea', is_required: 0, sort_order: 3 },
  { section_name: 'PC — Return & Retrieval', field_name: 'Retrieval Method',  field_type: 'dropdown', is_required: 0, sort_order: 4, picklist_type: 'retrieval_method' },
  { section_name: 'PC — Return & Retrieval', field_name: 'Return Notes',      field_type: 'textarea', is_required: 0, sort_order: 5 },

  // ── PC — Replacement ────────────────────────────────────────────────────────
  { section_name: 'PC — Replacement', field_name: 'Replacement Approved', field_type: 'dropdown', is_required: 0, sort_order: 1, picklist_type: 'yes_no' },
  { section_name: 'PC — Replacement', field_name: 'Replacement Quantity', field_type: 'number',   is_required: 0, sort_order: 2 },
  { section_name: 'PC — Replacement', field_name: 'Replacement Ship Date',field_type: 'date',     is_required: 0, sort_order: 3 },
  { section_name: 'PC — Replacement', field_name: 'Replacement Notes',    field_type: 'textarea', is_required: 0, sort_order: 4 },

  // ── PC — Refund & Credit ─────────────────────────────────────────────────────
  { section_name: 'PC — Refund & Credit', field_name: 'Refund Approved',   field_type: 'dropdown', is_required: 0, sort_order: 1, picklist_type: 'yes_no' },
  { section_name: 'PC — Refund & Credit', field_name: 'Refund Amount',     field_type: 'number',   is_required: 0, sort_order: 2 },
  { section_name: 'PC — Refund & Credit', field_name: 'Credit Note Number',field_type: 'text',     is_required: 0, sort_order: 3 },
  { section_name: 'PC — Refund & Credit', field_name: 'Refund Notes',      field_type: 'textarea', is_required: 0, sort_order: 4 },
];

async function seedDefaultFields(conn) {
  for (const f of DEFAULT_FIELDS) {
    await conn.execute(
      `INSERT IGNORE INTO field_setup
         (section_name, field_name, field_type, is_required, is_hidden, is_disabled, picklist_type, lookup_target, sort_order)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?)`,
      [f.section_name, f.field_name, f.field_type, f.is_required, f.picklist_type || null, f.lookup_target || null, f.sort_order]
    );
  }
}

// GET /api/admin/field-setup — returns all fields grouped by section_name
router.get('/field-setup', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    // Fields are seeded on org creation via seedService.js

    const isSA = hasGlobalAdminScope(req.user);
    const [fields] = await pool.execute(
      `SELECT * FROM field_setup ${isSA ? '' : 'WHERE org_id = ? OR org_id IS NULL'} ORDER BY section_name, sort_order, id`,
      isSA ? [] : [req.user.orgId]
    );

    // Group by section_name
    const grouped = {};
    for (const field of fields) {
      if (!grouped[field.section_name]) grouped[field.section_name] = [];
      grouped[field.section_name].push(field);
    }

    res.json({ fields, grouped });
  } catch (err) {
    console.error('GET /field-setup error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/field-setup — bulk save entire field setup
router.put('/field-setup', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { fields } = req.body;
    if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array.' });

    for (const f of fields) {
      if (!f.id) continue;
      await pool.execute(
        `UPDATE field_setup SET
           is_required = ?, is_hidden = ?, is_disabled = ?, custom_label = ?,
           help_text = ?, picklist_type = ?, lookup_target = ?,
           do_not_update_master = ?, max_length = ?, default_value = ?,
           sort_order = ?, field_type = ?
         WHERE id = ?`,
        [
          f.is_required ? 1 : 0,
          f.is_hidden ? 1 : 0,
          f.is_disabled ? 1 : 0,
          f.custom_label || null,
          f.help_text || null,
          f.picklist_type || null,
          f.lookup_target || null,
          f.do_not_update_master ? 1 : 0,
          f.max_length || null,
          f.default_value || null,
          f.sort_order || 0,
          f.field_type || 'text',
          f.id,
        ]
      );
    }

    res.json({ message: 'Field setup saved.' });
  } catch (err) {
    console.error('PUT /field-setup error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/field-setup/flex — add a flex field to a section
router.post('/field-setup/flex', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { section_name, field_name, field_type, is_required, custom_label, help_text, picklist_type, lookup_target, do_not_update_master, max_length, default_value, sort_order } = req.body;
    if (!section_name || !field_name) {
      return res.status(400).json({ error: 'section_name and field_name are required.' });
    }
    const orgId = hasGlobalAdminScope(req.user) ? (req.body.org_id || null) : req.user.orgId;
    const [result] = await pool.execute(
      `INSERT INTO field_setup (section_name, field_name, field_type, is_required, custom_label, help_text, picklist_type, lookup_target, do_not_update_master, max_length, default_value, sort_order, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [section_name, field_name, field_type || 'text', is_required ? 1 : 0, custom_label || null, help_text || null, picklist_type || null, lookup_target || null, do_not_update_master ? 1 : 0, max_length || null, default_value || null, sort_order || 0, orgId]
    );
    const [[created]] = await pool.execute('SELECT * FROM field_setup WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Flex field added.', id: result.insertId, field: created });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A field with this name already exists in the section.' });
    }
    console.error('POST /field-setup/flex error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/field-setup/flex/:id — remove a flex field
router.delete('/field-setup/flex/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute('SELECT id, field_name FROM field_setup WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Field not found.' });

    await pool.execute('DELETE FROM field_setup WHERE id = ?', [id]);
    res.json({ message: 'Flex field removed.' });
  } catch (err) {
    console.error('DELETE /field-setup/flex/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
