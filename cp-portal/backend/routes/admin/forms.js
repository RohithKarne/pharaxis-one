/**
 * Admin Forms — /api/admin/forms
 * Configure submission form fields per client per form type
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');

// GET /api/admin/forms/:clientId — all form configs grouped by form_type
router.get('/:clientId', authenticateAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_form_config WHERE client_id = ? ORDER BY form_type, display_order ASC').all(req.params.clientId);
  const grouped = rows.reduce((acc, r) => {
    if (!acc[r.form_type]) acc[r.form_type] = [];
    acc[r.form_type].push({ ...r, field_options: r.field_options ? JSON.parse(r.field_options) : null });
    return acc;
  }, {});
  res.json({ forms: grouped });
});

// GET /api/admin/forms/:clientId/:formType
router.get('/:clientId/:formType', authenticateAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_form_config WHERE client_id = ? AND form_type = ? ORDER BY display_order ASC').all(req.params.clientId, req.params.formType);
  res.json({ fields: rows.map(r => ({ ...r, field_options: r.field_options ? JSON.parse(r.field_options) : null })) });
});

// POST /api/admin/forms/:clientId — add custom field
router.post('/:clientId', authenticateAdmin, (req, res) => {
  const { form_type, field_key, field_label, field_type, field_options, placeholder, help_text, is_required, display_order } = req.body;
  if (!form_type || !field_key || !field_label) return res.status(400).json({ error: 'form_type, field_key and field_label are required.' });
  const info = db.prepare(`
    INSERT INTO cp_form_config (client_id, form_type, field_key, field_label, field_type, field_options, placeholder, help_text, is_required, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.clientId, form_type, field_key, field_label, field_type || 'text', field_options ? JSON.stringify(field_options) : null, placeholder || null, help_text || null, is_required ? 1 : 0, display_order || 0);
  res.status(201).json({ id: info.lastInsertRowid, message: 'Field added.' });
});

// PATCH /api/admin/forms/:clientId/:fieldId — update field
router.patch('/:clientId/:fieldId', authenticateAdmin, (req, res) => {
  const { field_label, field_type, field_options, placeholder, help_text, is_required, is_active, display_order } = req.body;
  const updates = [], params = [];
  if (field_label !== undefined)   { updates.push('field_label = ?');   params.push(field_label); }
  if (field_type !== undefined)    { updates.push('field_type = ?');    params.push(field_type); }
  if (field_options !== undefined) { updates.push('field_options = ?'); params.push(JSON.stringify(field_options)); }
  if (placeholder !== undefined)   { updates.push('placeholder = ?');   params.push(placeholder); }
  if (help_text !== undefined)     { updates.push('help_text = ?');     params.push(help_text); }
  if (is_required !== undefined)   { updates.push('is_required = ?');   params.push(is_required ? 1 : 0); }
  if (is_active !== undefined)     { updates.push('is_active = ?');     params.push(is_active ? 1 : 0); }
  if (display_order !== undefined) { updates.push('display_order = ?'); params.push(display_order); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.fieldId, req.params.clientId);
  db.prepare(`UPDATE cp_form_config SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`).run(...params);
  res.json({ message: 'Field updated.' });
});

// DELETE /api/admin/forms/:clientId/:fieldId
router.delete('/:clientId/:fieldId', authenticateAdmin, (req, res) => {
  db.prepare('UPDATE cp_form_config SET is_active = 0 WHERE id = ? AND client_id = ?').run(req.params.fieldId, req.params.clientId);
  res.json({ message: 'Field deactivated.' });
});

// POST /api/admin/forms/:clientId/reorder — bulk reorder
router.post('/:clientId/reorder', authenticateAdmin, (req, res) => {
  const { fields } = req.body; // [{ id, display_order }]
  if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array.' });
  const upd = db.prepare(`UPDATE cp_form_config SET display_order = ?, updated_at = datetime('now') WHERE id = ? AND client_id = ?`);
  const tx  = db.transaction(() => fields.forEach(f => upd.run(f.display_order, f.id, req.params.clientId)));
  tx();
  res.json({ message: 'Order updated.' });
});

module.exports = router;
