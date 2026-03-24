/**
 * Admin Language Config — /api/admin/language
 * S5-9: Per-client language configuration
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const { autoTranslate } = require('../../utils/translator');

const SUPPORTED = ['en', 'fr', 'de', 'es', 'ja', 'zh'];

// GET /api/admin/language/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT language_config_json FROM cp_clients WHERE id = ?', [req.params.clientId]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    let config = { default: 'en', enabled: ['en'] };
    try { config = JSON.parse(client.language_config_json || '{}'); } catch {}
    res.json({ language: config });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/language/:clientId
router.put('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    let { default: defaultLang, enabled } = req.body;
    if (!defaultLang || !SUPPORTED.includes(defaultLang)) return res.status(400).json({ error: 'Invalid default language.' });
    if (!Array.isArray(enabled) || enabled.length === 0) return res.status(400).json({ error: 'enabled must be a non-empty array.' });
    enabled = enabled.filter(l => SUPPORTED.includes(l));
    if (!enabled.includes(defaultLang)) enabled.push(defaultLang);
    const config = JSON.stringify({ default: defaultLang, enabled });
    await pool.execute("UPDATE cp_clients SET language_config_json = ?, updated_at = NOW() WHERE id = ?", [config, req.params.clientId]);
    await audit(req.admin, req.params.clientId, 'UPDATE', 'language_config', req.params.clientId, { default: defaultLang, enabled });
    res.json({ ok: true, language: { default: defaultLang, enabled } });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/language/:clientId/retranslate
// Re-translates all existing content for this client into all enabled languages.
// Fire-and-forget: responds immediately, translation runs in background.
router.post('/:clientId/retranslate', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE id = ?', [clientId]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    res.json({ ok: true, message: 'Retranslation started in background.' });

    // Run in background — do not await
    (async () => {
      try {
        const [news]   = await pool.execute('SELECT id, title, body_html FROM cp_news_posts WHERE client_id = ?', [clientId]);
        const [safety] = await pool.execute('SELECT id, title, body_html FROM cp_safety_alerts WHERE client_id = ?', [clientId]);
        const [faqs]   = await pool.execute('SELECT id, question, answer FROM cp_faq_items WHERE client_id = ?', [clientId]);
        const [docs]   = await pool.execute('SELECT id, title FROM cp_documents WHERE client_id = ?', [clientId]);

        for (const row of news)   await autoTranslate(clientId, 'cp_news_posts',    row.id, { title: row.title, body_html: row.body_html }).catch(() => {});
        for (const row of safety) await autoTranslate(clientId, 'cp_safety_alerts', row.id, { title: row.title, body_html: row.body_html }).catch(() => {});
        for (const row of faqs)   await autoTranslate(clientId, 'cp_faq_items',     row.id, { question: row.question, answer: row.answer }).catch(() => {});
        for (const row of docs)   await autoTranslate(clientId, 'cp_documents',     row.id, { title: row.title }).catch(() => {});

        console.log(`[retranslate] client ${clientId} — done`);
      } catch (err) {
        console.error(`[retranslate] client ${clientId}:`, err.message);
      }
    })();
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
