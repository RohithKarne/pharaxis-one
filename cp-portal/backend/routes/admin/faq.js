/**
 * Admin FAQ — /api/admin/faq
 * S5-5: FAQ management per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const { autoTranslate } = require('../../utils/translator');

// GET /api/admin/faq/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_faq_items WHERE client_id = ? ORDER BY category ASC, sort_order ASC, id ASC').all(req.params.clientId);
  res.json({ faqs: rows });
});

// POST /api/admin/faq/:clientId
router.post('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { question, answer, category, sort_order, is_published } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'question and answer are required.' });
  const result = db.prepare(`
    INSERT INTO cp_faq_items (client_id, question, answer, category, sort_order, is_published)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.params.clientId, question.trim(), answer.trim(), category?.trim() || null, sort_order || 0, is_published !== false ? 1 : 0);
  audit(req.admin, req.params.clientId, 'CREATE', 'faq', result.lastInsertRowid, { question });
  autoTranslate(req.params.clientId, 'cp_faq_items', result.lastInsertRowid, { question: question.trim(), answer: answer.trim() }).catch(() => {});
  res.json({ faq: db.prepare('SELECT * FROM cp_faq_items WHERE id = ?').get(result.lastInsertRowid) });
});

// PUT /api/admin/faq/:clientId/:faqId
router.put('/:clientId/:faqId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { question, answer, category, sort_order, is_published } = req.body;
  const fields = [], values = [];
  if (question    !== undefined) { fields.push('question = ?');     values.push(question.trim()); }
  if (answer      !== undefined) { fields.push('answer = ?');       values.push(answer.trim()); }
  if (category    !== undefined) { fields.push('category = ?');     values.push(category?.trim() || null); }
  if (sort_order  !== undefined) { fields.push('sort_order = ?');   values.push(sort_order); }
  if (is_published !== undefined) { fields.push('is_published = ?'); values.push(is_published ? 1 : 0); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  fields.push("updated_at = datetime('now')");
  values.push(req.params.faqId, req.params.clientId);
  db.prepare(`UPDATE cp_faq_items SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`).run(...values);
  audit(req.admin, req.params.clientId, 'UPDATE', 'faq', req.params.faqId, {});
  const transFields = {};
  if (question !== undefined) transFields.question = question.trim();
  if (answer   !== undefined) transFields.answer   = answer.trim();
  if (Object.keys(transFields).length) autoTranslate(req.params.clientId, 'cp_faq_items', req.params.faqId, transFields).catch(() => {});
  res.json({ ok: true });
});

// DELETE /api/admin/faq/:clientId/:faqId
router.delete('/:clientId/:faqId', authenticateAdmin, requireClientAccess, (req, res) => {
  db.prepare('DELETE FROM cp_faq_items WHERE id = ? AND client_id = ?').run(req.params.faqId, req.params.clientId);
  audit(req.admin, req.params.clientId, 'DELETE', 'faq', req.params.faqId, {});
  res.json({ ok: true });
});

module.exports = router;
