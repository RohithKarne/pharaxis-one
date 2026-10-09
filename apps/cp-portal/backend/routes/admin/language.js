/**
 * Admin Language Config — /api/admin/language
 * S5-9: Per-client language configuration
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const { autoTranslate, isMachineTranslationEnabled, missingTranslations } = require('../../utils/translator');
const log = require('../../utils/logger');
const cache = require('../../utils/cache');

const SUPPORTED = ['en', 'fr', 'de', 'es', 'ja', 'zh'];

// CPPM-9: the content that can carry translations, and the fields that must all be
// present before an item counts as translated. Mirrors the retranslate lists below.
const TRANSLATABLE_CONTENT = [
  { type: 'news',      table: 'cp_news_posts',    labelField: 'title',    fields: ['title', 'body_html'] },
  { type: 'safety',    table: 'cp_safety_alerts', labelField: 'title',    fields: ['title', 'body_html'] },
  { type: 'faq',       table: 'cp_faq_items',     labelField: 'question', fields: ['question', 'answer'] },
  { type: 'documents', table: 'cp_documents',     labelField: 'title',    fields: ['title'] },
];

// GET /api/admin/language/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT language_config_json FROM cp_clients WHERE id = ?', [req.params.clientId]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    let config = { default: 'en', enabled: ['en'] };
    try { config = JSON.parse(client.language_config_json || '{}'); } catch {}
    // CPPM-9: report the outside-translation switch explicitly, so its state is never
    // a guess. It is read-only here — see the note on the PUT below.
    res.json({ language: { ...config, machine_translation: isMachineTranslationEnabled(config) } });
  } catch (err) {
    log.error('admin.language.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
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
    // CPPM-9: the outside-translation switch is carried over untouched. It cannot be
    // turned on or off from this endpoint — editing the language list must not change
    // whether content leaves the building — and an existing opt-in is not wiped either.
    const [[current]] = await pool.execute('SELECT language_config_json FROM cp_clients WHERE id = ?', [req.params.clientId]);
    let existing = {};
    try { existing = JSON.parse(current?.language_config_json || '{}'); } catch {}
    const config = JSON.stringify(isMachineTranslationEnabled(existing)
      ? { default: defaultLang, enabled, machine_translation: true }
      : { default: defaultLang, enabled });
    await pool.execute("UPDATE cp_clients SET language_config_json = ?, updated_at = NOW() WHERE id = ?", [config, req.params.clientId]);
    await audit(req.admin, req.params.clientId, 'UPDATE', 'language_config', req.params.clientId, { default: defaultLang, enabled });
    cache.invalidate('config:'); // CP-22: the portal reads the language list from its cached config — show the change at once
    res.json({ ok: true, language: { default: defaultLang, enabled, machine_translation: isMachineTranslationEnabled(existing) } });
  } catch (err) {
    log.error('admin.language.error', { err, route: 'PUT /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/language/:clientId/coverage
// CPPM-9: what is missing a translation. Anything listed here is shown to readers in
// the language it was written in, using the same all-or-nothing rule as the portal.
router.get('/:clientId/coverage', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const [[client]] = await pool.execute('SELECT language_config_json FROM cp_clients WHERE id = ?', [clientId]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    let config = { default: 'en', enabled: ['en'] };
    try { config = JSON.parse(client.language_config_json || '{}'); } catch {}
    const defaultLang = config.default || 'en';
    const langs = (config.enabled || ['en']).filter(l => l !== defaultLang);

    const content = [];
    for (const c of TRANSLATABLE_CONTENT) {
      const cols = [...new Set(['id', c.labelField, ...c.fields])].map(f => `\`${f}\``).join(', ');
      const [rows] = await pool.execute(
        `SELECT ${cols}, translations_json FROM \`${c.table}\` WHERE client_id = ? ORDER BY id ASC`, [clientId]
      );
      const missing = [];
      for (const row of rows) {
        const miss = missingTranslations(row, c.fields, langs);
        if (miss.length) missing.push({ id: row.id, label: String(row[c.labelField] || '').slice(0, 120), missing: miss });
      }
      content.push({ type: c.type, total: rows.length, complete: rows.length - missing.length, missing });
    }

    res.json({
      default: defaultLang,
      languages: langs,
      machine_translation: isMachineTranslationEnabled(config),
      content,
    });
  } catch (err) {
    log.error('admin.language.error', { err, route: 'GET /:clientId/coverage', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/language/:clientId/translation/:type/:id — one item's original text and its
// stored translations, for the team to type a translation (outside machine translation is off).
router.get('/:clientId/translation/:type/:id', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const c = TRANSLATABLE_CONTENT.find(x => x.type === req.params.type);
    if (!c) return res.status(400).json({ error: 'Unknown content type.' });
    const cols = [...new Set(['id', c.labelField, ...c.fields])].map(f => `\`${f}\``).join(', ');
    const [[row]] = await pool.execute(`SELECT ${cols}, translations_json FROM \`${c.table}\` WHERE id = ? AND client_id = ?`, [req.params.id, req.params.clientId]);
    if (!row) return res.status(404).json({ error: 'Item not found.' });
    let translations = {};
    try { translations = JSON.parse(row.translations_json || '{}') || {}; } catch {}
    const original = {}; for (const f of c.fields) original[f] = row[f];
    res.json({ type: c.type, id: row.id, label: String(row[c.labelField] || '').slice(0, 120), fields: c.fields, original, translations });
  } catch (err) {
    log.error('admin.language.error', { err, route: 'GET /:clientId/translation', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/language/:clientId/translation/:type/:id — { lang, fields: { title: '…', … } }
// Stores the team's own translation for one language; an empty field removes that field's translation.
router.put('/:clientId/translation/:type/:id', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const c = TRANSLATABLE_CONTENT.find(x => x.type === req.params.type);
    if (!c) return res.status(400).json({ error: 'Unknown content type.' });
    const lang = String(req.body.lang || '');
    if (!SUPPORTED.includes(lang) || lang === 'en') return res.status(400).json({ error: 'lang must be one of the supported languages other than English.' });
    const given = req.body.fields && typeof req.body.fields === 'object' ? req.body.fields : {};
    const [[row]] = await pool.execute(`SELECT translations_json FROM \`${c.table}\` WHERE id = ? AND client_id = ?`, [req.params.id, req.params.clientId]);
    if (!row) return res.status(404).json({ error: 'Item not found.' });
    let all = {};
    try { all = JSON.parse(row.translations_json || '{}') || {}; } catch {}
    const entry = { ...(all[lang] || {}) };
    for (const f of c.fields) {
      if (!(f in given)) continue;
      const v = String(given[f] || '').trim();
      if (v) entry[f] = v; else delete entry[f];
    }
    if (Object.keys(entry).length) all[lang] = entry; else delete all[lang];
    await pool.execute(`UPDATE \`${c.table}\` SET translations_json = ? WHERE id = ?`, [JSON.stringify(all), req.params.id]);
    await audit(req.admin, req.params.clientId, 'TRANSLATE', c.type, Number(req.params.id), { lang, fields: Object.keys(given) });
    const complete = c.fields.every(f => entry[f]);
    res.json({ ok: true, lang, complete, message: complete ? `Saved. Readers in ${lang.toUpperCase()} now see this translation.` : `Saved. Until every field has a translation, readers in ${lang.toUpperCase()} see the original.` });
  } catch (err) {
    log.error('admin.language.error', { err, route: 'PUT /:clientId/translation', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/language/:clientId/retranslate
// Re-translates all existing content for this client into all enabled languages.
// Fire-and-forget: responds immediately, translation runs in background.
router.post('/:clientId/retranslate', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const [[client]] = await pool.execute('SELECT id, language_config_json FROM cp_clients WHERE id = ?', [clientId]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    // CPPM-9: with outside translation off (the default) there is nothing this can do.
    // Say so instead of reporting a background job that would silently translate nothing.
    let config = {};
    try { config = JSON.parse(client.language_config_json || '{}'); } catch {}
    if (!isMachineTranslationEnabled(config)) {
      return res.status(409).json({
        error: 'Outside machine translation is turned off for this client, so there is nothing to re-translate. Translations must be supplied and stored by the team; content without one is shown in the language it was written in.',
      });
    }

    // CPPM-10: a re-translation rewrites published content — record who started it.
    await audit(req.admin, clientId, 'RETRANSLATE', 'language_config', Number(clientId), {});

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
    log.error('admin.language.error', { err, route: 'POST /:clientId/retranslate', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
