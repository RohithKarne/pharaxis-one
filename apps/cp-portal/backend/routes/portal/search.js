/**
 * Portal Unified Search — /api/portal/search
 * Searches across all published content types for a client in one query.
 * Feature-gated: only content whose portal feature is enabled is searched.
 * v1 uses LIKE matching (FULLTEXT ranking is a future enhancement).
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { VISIBLE_DOCUMENT_SQL } = require('../../utils/documentVisibility');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');
const { canSee } = require('../../utils/audience');
const log = require('../../utils/logger');
const { applyTranslation } = require('../../utils/translator');

function snippet(text) {
  const s = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}

// The words around the first place a document's text matches, so the reader sees why
// a document whose title does not mention the term came up (row 4, 27 Oct review).
function textAround(text, q) {
  const s = String(text || '').replace(/\s+/g, ' ');
  const at = s.toLowerCase().indexOf(String(q).toLowerCase());
  if (at < 0) return '';
  let start = Math.max(0, at - 70);
  if (start > 0) start = s.indexOf(' ', start) + 1 || start; // begin on a whole word
  let end = Math.min(s.length, at + q.length + 90);
  if (end < s.length) end = s.lastIndexOf(' ', end) > at ? s.lastIndexOf(' ', end) : end;
  return (start > 0 ? '…' : '') + s.slice(start, end).trim() + (end < s.length ? '…' : '');
}

// E1 (27 Oct review): news and FAQs carry stored translations. A row matches when the
// term is in its own text or in any of its translations — checked on the parsed values,
// so a search for "title" does not match the JSON keys.
function inTranslations(json, fields, q) {
  let t = {};
  try { t = JSON.parse(json || '{}') || {}; } catch { return false; }
  const needle = q.toLowerCase();
  return Object.values(t).some(byLang => fields.some(f => String(byLang?.[f] || '').toLowerCase().includes(needle)));
}
function plainHas(row, fields, q) {
  const needle = q.toLowerCase();
  return fields.some(f => String(row[f] || '').replace(/<[^>]*>/g, ' ').toLowerCase().includes(needle));
}

// E2 (27 Oct review): what doctors search for, and what finds nothing, counted per day
// with no identity attached. Kept 90 days, because a term is whatever was typed.
// The same person repeating the same search within 10 seconds (a refresh, a language
// switch, React's development double-run) counts once. Held in memory only, never stored.
const recentlyCounted = new Map();
async function countSearch(clientId, userId, q, found) {
  const term = q.toLowerCase().replace(/\s+/g, ' ').slice(0, 100);
  const key = `${clientId}|${userId}|${term}`, now = Date.now();
  if (now - (recentlyCounted.get(key) || 0) < 10000) return;
  recentlyCounted.set(key, now);
  if (recentlyCounted.size > 5000) for (const [k, at] of recentlyCounted) if (now - at >= 10000) recentlyCounted.delete(k);
  await pool.execute(
    `INSERT INTO cp_search_terms (client_id, term, day, searches, no_result_searches) VALUES (?, ?, UTC_DATE(), 1, ?)
     ON DUPLICATE KEY UPDATE searches = searches + 1, no_result_searches = no_result_searches + VALUES(no_result_searches)`,
    [clientId, term, found ? 0 : 1]);
  await pool.execute('DELETE FROM cp_search_terms WHERE client_id = ? AND day < UTC_DATE() - INTERVAL 90 DAY', [clientId]);
}

// GET /api/portal/search?clientCode=xxx&q=term
// CPPM-25: search needs to know who is asking, so it can respect audience.
router.get('/', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const { clientCode } = req.query;
    const q = String(req.query.q || '').trim();
    if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });
    if (q.length < 2) return res.json({ query: q, results: [] });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const cid = client.id;
    const like = `%${q}%`;
    const userType = req.portalUser.user_type || 'other';
    const lang = /^[a-z]{2}$/.test(String(req.query.lang || '')) ? req.query.lang : 'en';

    const [featRows] = await pool.execute('SELECT feature_key FROM cp_features WHERE client_id = ? AND is_enabled = 1', [cid]);
    const enabled = new Set(featRows.map(r => r.feature_key));

    const results = [];

    if (enabled.has('news_announcements')) {
      const [rows] = await pool.execute(
        `SELECT id, title, body_html, target_types_json, translations_json FROM cp_news_posts WHERE client_id=? AND status='published' AND (title LIKE ? OR body_html LIKE ? OR translations_json LIKE ?) ORDER BY publish_at DESC LIMIT 40`,
        [cid, like, like, like]);
      rows.filter(r => canSee(r.target_types_json, userType))
        .filter(r => plainHas(r, ['title', 'body_html'], q) || inTranslations(r.translations_json, ['title', 'body_html'], q)).slice(0, 8)
        .map(r => applyTranslation(r, lang, ['title', 'body_html']))
        .forEach(r => results.push({ type: 'news', label: 'News', id: r.id, title: r.title, snippet: snippet(r.body_html), path: `news/${r.id}` }));
    }

    // Safety & FAQ are always-on portal pages
    {
      const [rows] = await pool.execute(
        `SELECT id, title, body_html, target_types_json FROM cp_safety_alerts WHERE client_id=? AND status='active' AND (publish_at IS NULL OR publish_at <= NOW()) AND (title LIKE ? OR body_html LIKE ?) ORDER BY publish_at DESC LIMIT 40`,
        [cid, like, like]);
      rows.filter(r => canSee(r.target_types_json, userType)).slice(0, 8)
        .forEach(r => results.push({ type: 'safety', label: 'Safety Alert', id: r.id, title: r.title, snippet: snippet(r.body_html), path: `safety#alert-${r.id}` }));
    }
    {
      const [rows] = await pool.execute(
        `SELECT id, question, answer, translations_json FROM cp_faq_items WHERE client_id=? AND is_published=1 AND (question LIKE ? OR answer LIKE ? OR translations_json LIKE ?) LIMIT 20`,
        [cid, like, like, like]);
      rows.filter(r => plainHas(r, ['question', 'answer'], q) || inTranslations(r.translations_json, ['question', 'answer'], q)).slice(0, 8)
        .map(r => applyTranslation(r, lang, ['question', 'answer']))
        .forEach(r => results.push({ type: 'faq', label: 'FAQ', id: r.id, title: r.question, snippet: snippet(r.answer), path: `faq` }));
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
        `SELECT id, title, visible_to_json, title LIKE ? AS in_title, search_text FROM cp_documents
          WHERE client_id=? AND is_active=1 AND ${VISIBLE_DOCUMENT_SQL} AND (title LIKE ? OR search_text LIKE ?)
          ORDER BY in_title DESC LIMIT 40`,
        [like, cid, like, like]);
      rows.filter(r => canSee(r.visible_to_json, userType)).slice(0, 8)
        .forEach(r => results.push({ type: 'document', label: 'Document', id: r.id, title: r.title,
          snippet: r.in_title ? '' : textAround(r.search_text, q), path: `documents?doc=${r.id}` }));
    }

    res.json({ query: q, results });
    countSearch(cid, req.portalUser.userId, q, results.length).catch(err => log.warn('portal.search.count_failed', { err: { message: err.message } }));
  } catch (err) {
    log.error('portal.search.error', { err, route: 'GET /', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/search/suggest?clientCode=xxx&q=term — lightweight typeahead (CP-12)
// Returns just titles across the main content types for an autocomplete dropdown.
router.get('/suggest', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const { clientCode } = req.query;
    const q = String(req.query.q || '').trim();
    if (!clientCode || q.length < 2) return res.json({ suggestions: [] });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.json({ suggestions: [] });
    const cid = client.id;
    const like = `%${q}%`;
    const userType = req.portalUser.user_type || 'other';
    const out = [];
    // F4 (27 Oct review): suggestions follow the same rules as the search itself — only
    // content whose portal feature is on, titles in the reader's language, words inside
    // documents — and each one opens the item, not its list.
    const lang = /^[a-z]{2}$/.test(String(req.query.lang || '')) ? req.query.lang : 'en';
    const [featRows] = await pool.execute('SELECT feature_key FROM cp_features WHERE client_id = ? AND is_enabled = 1', [cid]);
    const enabled = new Set(featRows.map(r => r.feature_key));

    if (enabled.has('news_announcements')) {
      const [news] = await pool.execute(
        `SELECT id, title, target_types_json, translations_json FROM cp_news_posts WHERE client_id=? AND status='published'
           AND (title LIKE ? OR translations_json LIKE ?) ORDER BY publish_at DESC LIMIT 25`, [cid, like, like]);
      news.filter(r => canSee(r.target_types_json, userType))
        .filter(r => plainHas(r, ['title'], q) || inTranslations(r.translations_json, ['title'], q)).slice(0, 5)
        .map(r => applyTranslation(r, lang, ['title']))
        .forEach(r => out.push({ title: r.title, type: 'news', label: 'News', path: `news/${r.id}` }));
    }

    const [faq] = await pool.execute(
      `SELECT id, question, translations_json FROM cp_faq_items WHERE client_id=? AND is_published=1 AND (question LIKE ? OR translations_json LIKE ?) LIMIT 15`,
      [cid, like, like]);
    faq.filter(r => plainHas(r, ['question'], q) || inTranslations(r.translations_json, ['question'], q)).slice(0, 5)
      .map(r => applyTranslation(r, lang, ['question']))
      .forEach(r => out.push({ title: r.question, type: 'faq', label: 'FAQ', path: 'faq' }));

    if (enabled.has('document_library')) {
      const [docs] = await pool.execute(
        `SELECT id, title, visible_to_json, title LIKE ? AS in_title FROM cp_documents
          WHERE client_id=? AND is_active=1 AND ${VISIBLE_DOCUMENT_SQL} AND (title LIKE ? OR search_text LIKE ?)
          ORDER BY in_title DESC LIMIT 25`, [like, cid, like, like]);
      docs.filter(r => canSee(r.visible_to_json, userType)).slice(0, 5)
        .forEach(r => out.push({ title: r.title, type: 'document', label: 'Document', path: `documents?doc=${r.id}` }));
    }

    res.json({ suggestions: out.slice(0, 8) });
  } catch (err) {
    log.error('portal.search.error', { err, route: 'GET /suggest', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
