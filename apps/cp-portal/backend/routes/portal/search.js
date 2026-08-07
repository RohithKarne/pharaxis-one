/**
 * Portal Unified Search — /api/portal/search
 * Searches across all published content types for a client in one query.
 * Feature-gated: only content whose portal feature is enabled is searched.
 * v1 uses LIKE matching (FULLTEXT ranking is a future enhancement).
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const log = require('../../utils/logger');

function snippet(text) {
  const s = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}

// GET /api/portal/search?clientCode=xxx&q=term
router.get('/', async (req, res) => {
  try {
    const { clientCode } = req.query;
    const q = String(req.query.q || '').trim();
    if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });
    if (q.length < 2) return res.json({ query: q, results: [] });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const cid = client.id;
    const like = `%${q}%`;

    const [featRows] = await pool.execute('SELECT feature_key FROM cp_features WHERE client_id = ? AND is_enabled = 1', [cid]);
    const enabled = new Set(featRows.map(r => r.feature_key));

    const results = [];

    if (enabled.has('news_announcements')) {
      const [rows] = await pool.execute(
        `SELECT id, title, body_html FROM cp_news_posts WHERE client_id=? AND status='published' AND (title LIKE ? OR body_html LIKE ?) ORDER BY publish_at DESC LIMIT 8`,
        [cid, like, like]);
      rows.forEach(r => results.push({ type: 'news', label: 'News', id: r.id, title: r.title, snippet: snippet(r.body_html), path: `news/${r.id}` }));
    }

    // Safety & FAQ are always-on portal pages
    {
      const [rows] = await pool.execute(
        `SELECT id, title, body_html FROM cp_safety_alerts WHERE client_id=? AND status='active' AND (title LIKE ? OR body_html LIKE ?) ORDER BY publish_at DESC LIMIT 8`,
        [cid, like, like]);
      rows.forEach(r => results.push({ type: 'safety', label: 'Safety Alert', id: r.id, title: r.title, snippet: snippet(r.body_html), path: `safety` }));
    }
    {
      const [rows] = await pool.execute(
        `SELECT id, question, answer FROM cp_faq_items WHERE client_id=? AND is_published=1 AND (question LIKE ? OR answer LIKE ?) LIMIT 8`,
        [cid, like, like]);
      rows.forEach(r => results.push({ type: 'faq', label: 'FAQ', id: r.id, title: r.question, snippet: snippet(r.answer), path: `faq` }));
    }

    if (enabled.has('therapeutic_areas')) {
      const [rows] = await pool.execute(
        `SELECT id, name, short_desc, content FROM cp_therapeutic_areas WHERE client_id=? AND is_active=1 AND status='published' AND (name LIKE ? OR short_desc LIKE ? OR content LIKE ?) LIMIT 8`,
        [cid, like, like, like]);
      rows.forEach(r => results.push({ type: 'ta', label: 'Therapeutic Area', id: r.id, title: r.name, snippet: snippet(r.short_desc || r.content), path: `therapeutic-areas` }));
    }

    if (enabled.has('drug_info')) {
      const [rows] = await pool.execute(
        `SELECT id, brand_name, generic_name, indication FROM cp_drugs WHERE client_id=? AND is_active=1 AND status='published' AND (brand_name LIKE ? OR generic_name LIKE ? OR indication LIKE ?) LIMIT 8`,
        [cid, like, like, like]);
      rows.forEach(r => results.push({ type: 'drug', label: 'Drug', id: r.id, title: r.brand_name || r.generic_name, snippet: snippet(r.indication), path: `drug-info` }));
    }

    if (enabled.has('resources')) {
      const [rows] = await pool.execute(
        `SELECT id, title, description FROM cp_resources WHERE client_id=? AND is_active=1 AND status='published' AND (title LIKE ? OR description LIKE ?) LIMIT 8`,
        [cid, like, like]);
      rows.forEach(r => results.push({ type: 'resource', label: 'Resource', id: r.id, title: r.title, snippet: snippet(r.description), path: `resources` }));
    }

    if (enabled.has('document_library')) {
      const [rows] = await pool.execute(
        `SELECT id, title FROM cp_documents WHERE client_id=? AND is_active=1 AND status='published' AND title LIKE ? LIMIT 8`,
        [cid, like]);
      rows.forEach(r => results.push({ type: 'document', label: 'Document', id: r.id, title: r.title, snippet: '', path: `documents` }));
    }

    res.json({ query: q, results });
  } catch (err) {
    log.error('portal.search.error', { err, route: 'GET /', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/search/suggest?clientCode=xxx&q=term — lightweight typeahead (CP-12)
// Returns just titles across the main content types for an autocomplete dropdown.
router.get('/suggest', async (req, res) => {
  try {
    const { clientCode } = req.query;
    const q = String(req.query.q || '').trim();
    if (!clientCode || q.length < 2) return res.json({ suggestions: [] });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.json({ suggestions: [] });
    const cid = client.id;
    const like = `%${q}%`;
    const out = [];

    const [news] = await pool.execute(
      `SELECT title FROM cp_news_posts WHERE client_id=? AND status='published' AND title LIKE ? ORDER BY publish_at DESC LIMIT 5`, [cid, like]);
    news.forEach(r => out.push({ title: r.title, type: 'news', path: 'news' }));

    const [faq] = await pool.execute(
      `SELECT question FROM cp_faq_items WHERE client_id=? AND is_published=1 AND question LIKE ? LIMIT 5`, [cid, like]);
    faq.forEach(r => out.push({ title: r.question, type: 'faq', path: 'faq' }));

    const [docs] = await pool.execute(
      `SELECT title FROM cp_documents WHERE client_id=? AND is_active=1 AND status='published' AND title LIKE ? LIMIT 5`, [cid, like]);
    docs.forEach(r => out.push({ title: r.title, type: 'document', path: 'documents' }));

    res.json({ suggestions: out.slice(0, 8) });
  } catch (err) {
    log.error('portal.search.error', { err, route: 'GET /suggest', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
