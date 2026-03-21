/**
 * Portal FAQ — /api/portal/faq
 * S5-5: Public FAQ for portal visitors
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { applyTranslation } = require('../../utils/translator');

// GET /api/portal/faq/:clientCode?lang=fr
router.get('/:clientCode', (req, res) => {
  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(req.params.clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });
  const lang = req.query.lang || 'en';
  const rows = db.prepare('SELECT id, question, answer, category, sort_order, translations_json FROM cp_faq_items WHERE client_id = ? AND is_published = 1 ORDER BY category ASC, sort_order ASC, id ASC').all(client.id);
  const faqs = rows.map(r => applyTranslation(r, lang, ['question', 'answer']));
  res.json({ faqs });
});

module.exports = router;
