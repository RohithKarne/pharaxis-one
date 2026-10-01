/**
 * utils/digest.js — Weekly content digest emails.
 *
 * Summarises the last 7 days of new content per client and emails opted-in
 * portal users. Deduped per ISO week via cp_digest_state so each client gets
 * at most one digest per week. Sending uses the client's own SMTP config
 * (utils/mailer.js) and is best-effort per user — one failure never aborts the run.
 */

const { pool } = require('../database/db')
const { sendEmail } = require('./mailer')
const { canSee } = require('./audience')
const { VISIBLE_DOCUMENT_SQL } = require('./documentVisibility')

// ISO-8601 week tag, e.g. "2026-W27". Used as the per-client dedup key.
function isoWeekTag(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// Collect new content from the last 7 days for one client, with each item's audience (CPPM-25).
// The whole week is read, not a fixed number of rows (CPPM-55): the audience filter runs
// afterwards, so a cap here could push a reader's own items out in a busy week.
async function collectContent(clientId) {
  const [news] = await pool.execute(
    `SELECT title, target_types_json AS audience FROM cp_news_posts WHERE client_id = ? AND status = 'published' AND publish_at >= (NOW() - INTERVAL 7 DAY) ORDER BY publish_at DESC`,
    [clientId]
  )
  const [safety] = await pool.execute(
    `SELECT title, target_types_json AS audience FROM cp_safety_alerts WHERE client_id = ? AND status = 'active' AND publish_at >= (NOW() - INTERVAL 7 DAY) ORDER BY publish_at DESC`,
    [clientId]
  )
  // CPPM-55: a document is new in the week it went live (publish_at, stamped when it is
  // published), not the week it was uploaded — approval can take longer than a week. And
  // only what the Documents page itself would show: not expired, not waiting for its date.
  const [docs] = await pool.execute(
    `SELECT title, visible_to_json AS audience FROM cp_documents
      WHERE client_id = ? AND is_active = 1 AND ${VISIBLE_DOCUMENT_SQL}
        AND COALESCE(publish_at, created_at) >= (NOW() - INTERVAL 7 DAY)
      ORDER BY COALESCE(publish_at, created_at) DESC`,
    [clientId]
  )
  return { news, safety, docs }
}

// CPPM-25: only the items one reader's audience may see, at most 10 of each.
function contentFor({ news, safety, docs }, userType) {
  const mine = rows => rows.filter(r => canSee(r.audience, userType)).slice(0, 10)
  return { news: mine(news), safety: mine(safety), docs: mine(docs) }
}

function hasContent({ news, safety, docs }) {
  return news.length + safety.length + docs.length > 0
}

function buildHtml(clientName, { news, safety, docs }) {
  const section = (title, rows) => rows.length
    ? `<h3 style="margin:16px 0 6px">${title}</h3><ul>${rows.map(r => `<li>${String(r.title || '').replace(/</g, '&lt;')}</li>`).join('')}</ul>`
    : ''
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2>${clientName} — This Week's Update</h2>
      <p>Here's what's new in the last 7 days.</p>
      ${section('📰 News', news)}
      ${section('⚠️ Safety Alerts', safety)}
      ${section('📁 New Documents', docs)}
      <p style="color:#6B7280;font-size:12px;margin-top:20px">You are receiving this because you opted in to the weekly digest. You can turn it off in your portal preferences.</p>
    </div>`
}

// Portal users who should receive the digest for a client.
async function recipients(clientId) {
  const [rows] = await pool.execute(
    `SELECT email, first_name, user_type, notif_prefs_json FROM cp_portal_users
     WHERE client_id = ? AND is_active = 1 AND email IS NOT NULL AND email != ''`,
    [clientId]
  )
  return rows.filter(u => {
    let prefs = {}
    try { prefs = JSON.parse(u.notif_prefs_json || '{}') } catch { /* default opt-in */ }
    return prefs.digest !== false // opt-out model — default on
  })
}

/**
 * Send the weekly digest for one client. Returns a small result summary.
 * @param {number} clientId
 * @param {{ force?: boolean }} opts  force=true bypasses the once-per-week dedup (for manual/test runs)
 */
async function sendDigestForClient(clientId, { force = false } = {}) {
  const week = isoWeekTag()

  if (!force) {
    const [[state]] = await pool.execute('SELECT last_sent_week FROM cp_digest_state WHERE client_id = ?', [clientId])
    if (state && state.last_sent_week === week) return { clientId, skipped: 'already-sent-this-week' }
  }

  const [[client]] = await pool.execute('SELECT id, name FROM cp_clients WHERE id = ? AND is_active = 1', [clientId])
  if (!client) return { clientId, skipped: 'client-inactive' }

  const content = await collectContent(clientId)
  if (!hasContent(content)) return { clientId, skipped: 'no-new-content' }

  const users = await recipients(clientId)
  if (users.length === 0) return { clientId, skipped: 'no-recipients' }

  let sent = 0
  for (const u of users) {
    // CPPM-25: each reader is sent only what their audience may see; nothing left means no email.
    const mine = contentFor(content, u.user_type || 'other')
    if (!hasContent(mine)) continue
    try {
      await sendEmail(clientId, { to: u.email, subject: `${client.name} — This Week's Update`, html: buildHtml(client.name, mine) })
      sent++
    } catch { /* best-effort per user; skip failures (e.g. no SMTP config) */ }
  }

  // Record the run even if 0 sent, so a broken SMTP config doesn't retry every tick.
  await pool.execute(
    `INSERT INTO cp_digest_state (client_id, last_sent_week, last_sent_at) VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE last_sent_week = VALUES(last_sent_week), last_sent_at = NOW()`,
    [clientId, week]
  )
  return { clientId, sent, recipients: users.length }
}

// Run the digest for every active client (called by the scheduler on its weekly window).
async function sendAllDigests({ force = false } = {}) {
  const [clients] = await pool.execute('SELECT id FROM cp_clients WHERE is_active = 1')
  const results = []
  for (const c of clients) {
    try { results.push(await sendDigestForClient(c.id, { force })) }
    catch (err) { results.push({ clientId: c.id, error: err.message }) }
  }
  return results
}

module.exports = { sendDigestForClient, sendAllDigests, isoWeekTag }
