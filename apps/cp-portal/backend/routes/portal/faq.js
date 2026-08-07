/**
 * Portal FAQ — /api/portal/faq
 * S5-5: Public FAQ for portal visitors
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { applyTranslation } = require('../../utils/translator');
const log = require('../../utils/logger');

// GET /api/portal/faq/:clientCode?lang=fr
router.get('/:clientCode', async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const lang = req.query.lang || 'en';
    const [rows] = await pool.execute(
      'SELECT id, question, answer, category, sort_order, translations_json FROM cp_faq_items WHERE client_id = ? AND is_published = 1 ORDER BY category ASC, sort_order ASC, id ASC',
      [client.id]
    );
    const faqs = rows.map(r => applyTranslation(r, lang, ['question', 'answer']));
    res.json({ faqs });
  } catch (err) {
    log.error('portal.faq.error', { err, route: 'GET /:clientCode', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
