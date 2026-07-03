/**
 * utils/retrieve.js — Keyword retrieval over a client's published content.
 *
 * Used by the RAG chatbox to ground answers in the client's own approved
 * material (news, FAQ, safety alerts, drug info, therapeutic areas). v1 uses
 * LIKE matching; a future v2 can swap in embeddings/semantic search behind the
 * same interface without changing callers.
 */

const { pool } = require('../database/db')

function clean(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Retrieve up to `limit` relevant content snippets for a free-text query.
 * @returns {Promise<Array<{source:string,title:string,text:string}>>}
 */
async function retrieveContext(clientId, query, limit = 6) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const like = `%${q}%`
  const snippets = []
  const push = (source, title, text) => {
    const c = clean(text)
    if (c) snippets.push({ source, title: clean(title), text: c.slice(0, 500) })
  }

  const [news] = await pool.execute(
    `SELECT title, body_html FROM cp_news_posts WHERE client_id=? AND status='published' AND (title LIKE ? OR body_html LIKE ?) ORDER BY publish_at DESC LIMIT 3`,
    [clientId, like, like])
  news.forEach(r => push('News', r.title, r.body_html))

  const [faq] = await pool.execute(
    `SELECT question, answer FROM cp_faq_items WHERE client_id=? AND is_published=1 AND (question LIKE ? OR answer LIKE ?) LIMIT 3`,
    [clientId, like, like])
  faq.forEach(r => push('FAQ', r.question, r.answer))

  const [safety] = await pool.execute(
    `SELECT title, body_html FROM cp_safety_alerts WHERE client_id=? AND status='active' AND (title LIKE ? OR body_html LIKE ?) LIMIT 2`,
    [clientId, like, like])
  safety.forEach(r => push('Safety Alert', r.title, r.body_html))

  const [drugs] = await pool.execute(
    `SELECT brand_name, generic_name, indication, dosage_info, contraindications, side_effects
       FROM cp_drugs WHERE client_id=? AND is_active=1 AND status='published'
       AND (brand_name LIKE ? OR generic_name LIKE ? OR indication LIKE ?) LIMIT 2`,
    [clientId, like, like, like])
  drugs.forEach(r => push('Drug Info', r.brand_name || r.generic_name,
    [r.indication, r.dosage_info, r.contraindications, r.side_effects].filter(Boolean).join('. ')))

  const [ta] = await pool.execute(
    `SELECT name, short_desc, content FROM cp_therapeutic_areas WHERE client_id=? AND is_active=1 AND status='published'
       AND (name LIKE ? OR short_desc LIKE ? OR content LIKE ?) LIMIT 2`,
    [clientId, like, like, like])
  ta.forEach(r => push('Therapeutic Area', r.name, r.short_desc || r.content))

  return snippets.slice(0, limit)
}

// Format retrieved snippets into a context block for the system prompt.
function formatContext(snippets) {
  if (!snippets.length) return ''
  return snippets.map((s, i) => `[${i + 1}] (${s.source}) ${s.title}\n${s.text}`).join('\n\n')
}

module.exports = { retrieveContext, formatContext }
