/**
 * utils/retrieve.js — Keyword retrieval over a client's published content.
 *
 * Used by the RAG chatbox to ground answers in the client's own approved
 * material (news, FAQ, safety alerts, drug info, therapeutic areas, and — from
 * 27 Oct 2026, enhancement E3 — approved documents such as prescribing
 * information). v1 uses LIKE matching; a future v2 can swap in embeddings/semantic
 * search behind the same interface without changing callers.
 *
 * 27 Oct 2026: the whole question used to be matched as one phrase, so "What is the
 * dose of Glimepiride?" found nothing while "Glimepiride" did. The question is now
 * split into keywords, and each source is ranked by how many of them it contains.
 */

const { pool } = require('../database/db')
const { canSee } = require('./audience')
const { VISIBLE_DOCUMENT_SQL } = require('./documentVisibility')

// Words that say nothing about what is being asked.
const STOP = new Set(('a an and any are about be been but by can could do does for from had has have how i if in into is it its me my '
  + 'no not of on or our please should so tell than that the their them there these this those to us was we were what when where which '
  + 'who why will with would you your').split(' '))

function clean(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function keywords(q) {
  const words = String(q || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || []
  return [...new Set(words.filter(w => w.length >= 3 && !STOP.has(w)))].slice(0, 6)
}

// How many of the keywords a piece of text contains.
function score(text, terms) {
  const t = String(text || '').toLowerCase()
  return terms.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0)
}

// A document is long: hand the model the passage around the first keyword it contains.
function passage(text, terms, size = 700) {
  const s = clean(text)
  const lower = s.toLowerCase()
  const at = Math.min(...terms.map(w => lower.indexOf(w)).filter(i => i >= 0))
  if (!Number.isFinite(at)) return s.slice(0, size)
  const start = Math.max(0, at - 150)
  return s.slice(start, start + size)
}

/**
 * Retrieve up to `limit` relevant content snippets for a free-text question.
 * @returns {Promise<Array<{source:string,title:string,text:string}>>}
 */
async function retrieveContext(clientId, query, limit = 6, userType = null) {
  const terms = keywords(query)
  if (!terms.length) return []
  const likes = terms.map(w => `%${w}%`)
  // "(a LIKE ? OR b LIKE ? ...)" for every keyword across the given columns.
  const anyOf = cols => '(' + terms.flatMap(() => cols.map(c => `${c} LIKE ?`)).join(' OR ') + ')'
  const params = cols => likes.flatMap(l => cols.map(() => l))
  const found = []
  const add = (source, rank, title, text, body = text) => {
    const c = clean(text)
    if (c) found.push({ source, rank, score: score(`${title} ${clean(body)}`, terms), title: clean(title), text: c.slice(0, 700) })
  }

  const [safety] = await pool.execute(
    `SELECT title, body_html, target_types_json FROM cp_safety_alerts WHERE client_id=? AND status='active'
       AND (publish_at IS NULL OR publish_at <= NOW()) AND ${anyOf(['title', 'body_html'])} LIMIT 20`,
    [clientId, ...params(['title', 'body_html'])])
  // CPPM-16: never ground an answer in content outside the asker's audience.
  safety.filter(r => canSee(r.target_types_json, userType)).forEach(r => add('Safety Alert', 1, r.title, r.body_html))

  const [drugs] = await pool.execute(
    `SELECT brand_name, generic_name, indication, dosage_info, contraindications, side_effects
       FROM cp_drugs WHERE client_id=? AND is_active=1 AND status='published'
       AND ${anyOf(['brand_name', 'generic_name', 'indication', 'dosage_info', 'side_effects'])} LIMIT 10`,
    [clientId, ...params(['brand_name', 'generic_name', 'indication', 'dosage_info', 'side_effects'])])
  drugs.forEach(r => add('Drug Info', 2, r.brand_name || r.generic_name,
    [r.generic_name, r.indication, r.dosage_info, r.contraindications, r.side_effects].filter(Boolean).join('. ')))

  // E3: approved, published, unexpired documents this person may see — only where the
  // client offers the document library. Never a draft.
  const [[docsOn]] = await pool.execute(
    `SELECT 1 AS yes FROM cp_features WHERE client_id = ? AND feature_key = 'document_library' AND is_enabled = 1`, [clientId])
  if (docsOn) {
    const [docs] = await pool.execute(
      `SELECT title, search_text, visible_to_json FROM cp_documents
        WHERE client_id=? AND is_active=1 AND approved_at IS NOT NULL AND ${VISIBLE_DOCUMENT_SQL}
          AND ${anyOf(['title', 'search_text'])} LIMIT 20`,
      [clientId, ...params(['title', 'search_text'])])
    docs.filter(r => canSee(r.visible_to_json, userType))
      .forEach(r => add('Document', 3, r.title, passage(r.search_text || '', terms), r.search_text))
  }

  const [faq] = await pool.execute(
    `SELECT question, answer FROM cp_faq_items WHERE client_id=? AND is_published=1 AND ${anyOf(['question', 'answer'])} LIMIT 10`,
    [clientId, ...params(['question', 'answer'])])
  faq.forEach(r => add('FAQ', 4, r.question, r.answer))

  const [news] = await pool.execute(
    `SELECT title, body_html, target_types_json FROM cp_news_posts WHERE client_id=? AND status='published'
       AND ${anyOf(['title', 'body_html'])} ORDER BY publish_at DESC LIMIT 15`,
    [clientId, ...params(['title', 'body_html'])])
  news.filter(r => canSee(r.target_types_json, userType)).forEach(r => add('News', 5, r.title, r.body_html))

  const [ta] = await pool.execute(
    `SELECT name, short_desc, content FROM cp_therapeutic_areas WHERE client_id=? AND is_active=1 AND status='published'
       AND ${anyOf(['name', 'short_desc', 'content'])} LIMIT 5`,
    [clientId, ...params(['name', 'short_desc', 'content'])])
  ta.forEach(r => add('Therapeutic Area', 6, r.name, r.short_desc || r.content, `${r.short_desc} ${r.content}`))

  // Most keywords matched first; among equals, safety before product before the rest.
  return found
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
    .slice(0, limit)
    .map(({ source, title, text }) => ({ source, title, text }))
}

// Format retrieved snippets into a context block for the system prompt.
function formatContext(snippets) {
  if (!snippets.length) return ''
  return snippets.map((s, i) => `[${i + 1}] (${s.source}) ${s.title}\n${s.text}`).join('\n\n')
}

module.exports = { retrieveContext, formatContext }
