/**
 * Admin Forms — /api/admin/forms
 * Configure submission form fields per client per form type
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { auditWrites } = require('../../utils/audit');
const log = require('../../utils/logger');
const { optionList } = require('../../services/formFields');

// CPPM-95: the page sent the choices already encoded and this route encoded them
// again, so the portal saw one garbled choice. Choices are now stored once, as a
// JSON list, whatever shape they arrive in; rows saved the broken way still read
// back correctly through optionList.
function storeOptions(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const list = optionList(raw);
  return list.length ? JSON.stringify(list) : null;
}

router.use('/:clientId', authenticateAdmin, requireClientAccess);
// CPPM-10: every write below leaves a who-did-what record, including any added later.
router.use('/:clientId', auditWrites('form_field'));

// GET /api/admin/forms/:clientId — all form configs grouped by form_type
router.get('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_form_config WHERE client_id = ? ORDER BY form_type, display_order ASC', [req.params.clientId]);
    const grouped = rows.reduce((acc, r) => {
      if (!acc[r.form_type]) acc[r.form_type] = [];
      acc[r.form_type].push({ ...r, field_options: r.field_options ? optionList(r.field_options) : null });
      return acc;
    }, {});
    res.json({ forms: grouped });
  } catch (err) {
    log.error('admin.forms.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/forms/:clientId/:formType
router.get('/:clientId/:formType', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_form_config WHERE client_id = ? AND form_type = ? ORDER BY display_order ASC', [req.params.clientId, req.params.formType]);
    res.json({ fields: rows.map(r => ({ ...r, field_options: r.field_options ? optionList(r.field_options) : null })) });
  } catch (err) {
    log.error('admin.forms.error', { err, route: 'GET /:clientId/:formType', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/forms/:clientId — add custom field
router.post('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const { form_type, field_key, field_label, field_type, field_options, placeholder, help_text, is_required, display_order } = req.body;
    if (!form_type || !field_key || !field_label) return res.status(400).json({ error: 'form_type, field_key and field_label are required.' });
    const [result] = await pool.execute(
      `INSERT INTO cp_form_config (client_id, form_type, field_key, field_label, field_type, field_options, placeholder, help_text, is_required, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, form_type, field_key, field_label, field_type || 'text', storeOptions(field_options), placeholder ?? null, help_text ?? null, is_required ? 1 : 0, display_order || 0]
    );
    res.status(201).json({ id: result.insertId, message: 'Field added.' });
  } catch (err) {
    // uq_form_config (client, form, key): the same key twice would give the portal two answers for one name.
    if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: `A field with the key "${req.body.field_key}" already exists on this form. Choose another key.` });
    log.error('admin.forms.error', { err, route: 'POST /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/forms/:clientId/:fieldId — update field
router.patch('/:clientId/:fieldId', authenticateAdmin, async (req, res) => {
  try {
    const { field_label, field_type, field_options, placeholder, help_text, is_required, is_active, display_order } = req.body;
    const updates = [], params = [];
    if (field_label !== undefined)   { updates.push('field_label = ?');   params.push(field_label); }
    if (field_type !== undefined)    { updates.push('field_type = ?');    params.push(field_type); }
    if (field_options !== undefined) { updates.push('field_options = ?'); params.push(storeOptions(field_options)); }
    if (placeholder !== undefined)   { updates.push('placeholder = ?');   params.push(placeholder); }
    if (help_text !== undefined)     { updates.push('help_text = ?');     params.push(help_text); }
    if (is_required !== undefined)   { updates.push('is_required = ?');   params.push(is_required ? 1 : 0); }
    if (is_active !== undefined)     { updates.push('is_active = ?');     params.push(is_active ? 1 : 0); }
    if (display_order !== undefined) { updates.push('display_order = ?'); params.push(display_order); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    updates.push(`updated_at = NOW()`);
    params.push(req.params.fieldId, req.params.clientId);
    const [result] = await pool.execute(`UPDATE cp_form_config SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`, params);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Field not found.' });
    res.json({ message: 'Field updated.' });
  } catch (err) {
    log.error('admin.forms.error', { err, route: 'PATCH /:clientId/:fieldId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/forms/:clientId/:fieldId
router.delete('/:clientId/:fieldId', authenticateAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('UPDATE cp_form_config SET is_active = 0 WHERE id = ? AND client_id = ?', [req.params.fieldId, req.params.clientId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Field not found.' });
    res.json({ message: 'Field deactivated.' });
  } catch (err) {
    log.error('admin.forms.error', { err, route: 'DELETE /:clientId/:fieldId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/forms/:clientId/reorder — bulk reorder
router.post('/:clientId/reorder', authenticateAdmin, async (req, res) => {
  try {
    const { fields } = req.body; // [{ id, display_order }]
    if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array.' });
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      for (const f of fields) {
        await conn.execute(
          `UPDATE cp_form_config SET display_order = ?, updated_at = NOW() WHERE id = ? AND client_id = ?`,
          [f.display_order, f.id, req.params.clientId]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    res.locals.audit = { action: 'REORDER', details: { count: fields.length } };
    res.json({ message: 'Order updated.' });
  } catch (err) {
    log.error('admin.forms.error', { err, route: 'POST /:clientId/reorder', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
