/**
 * Portal Personalization — /api/portal/personal
 * Follows (topics an HCP tracks) and self-activity analytics.
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');
const { buildExport } = require('../../services/dataSubject');
const { systemAudit } = require('../../utils/audit');
const log = require('../../utils/logger');
const { canSee } = require('../../utils/audience');
const { VISIBLE_DOCUMENT_SQL } = require('../../utils/documentVisibility');

const FOLLOW_TYPES = ['therapeutic_area', 'drug'];

async function resolveClient(req) {
  const code = req.query.clientCode || req.body.clientCode;
  if (!code) return null;
  const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [code]);
  return client || null;
}

// GET /api/portal/personal/for-you?clientCode= — CPPM-116: news, documents and
// upcoming events for this doctor's specialty and the areas and products they follow.
// An item an admin tagged with one of those areas comes first (CPPM-122). An untagged
// item matches when one of those words appears in its title or category (news,
// documents) or its title, type or description (events). Each list keeps its own
// page's rules: switched on, published, and meant for this doctor's role. With no
// specialty and nothing followed, the latest items are shown instead; with words but
// no match, the list is empty.
const FOR_YOU_MAX = 6;
const NOT_A_TOPIC = new Set(['other']);
router.get('/for-you', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const client = await resolveClient(req);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const [[me]] = await pool.execute('SELECT specialty, user_type FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    const userType = me?.user_type || 'other';

    const [followRows] = await pool.execute(`
      SELECT COALESCE(ta.name, d.brand_name) AS a, d.generic_name AS b
        FROM cp_user_follows f
        LEFT JOIN cp_therapeutic_areas ta ON f.item_type = 'therapeutic_area' AND ta.id = f.item_id AND ta.client_id = f.client_id
        LEFT JOIN cp_drugs d ON f.item_type = 'drug' AND d.id = f.item_id AND d.client_id = f.client_id
       WHERE f.portal_user_id = ? AND f.client_id = ?`, [req.portalUser.userId, client.id]);
    const words = [...new Set([me?.specialty, ...followRows.flatMap(r => [r.a, r.b])]
      .map(w => String(w || '').trim()).filter(w => w.length > 2 && !NOT_A_TOPIC.has(w.toLowerCase())))];

    const [features] = await pool.execute('SELECT feature_key, is_enabled FROM cp_features WHERE client_id = ?', [client.id]);
    const on = k => features.some(f => f.feature_key === k && f.is_enabled);
    const items = [];
    if (on('news_announcements')) {
      const [rows] = await pool.execute(`
        SELECT n.id, n.title, n.category, n.target_types_json, n.publish_at AS at, ta.name AS area FROM cp_news_posts n
          LEFT JOIN cp_therapeutic_areas ta ON ta.id = n.therapeutic_area_id AND ta.client_id = n.client_id
         WHERE n.client_id = ? AND n.status = 'published' AND n.publish_at <= UTC_TIMESTAMP()
         ORDER BY n.publish_at DESC LIMIT 200`, [client.id]);
      rows.filter(r => canSee(r.target_types_json, userType))
        .forEach(r => items.push({ type: 'news', id: r.id, title: r.title, at: r.at, area: r.area, text: `${r.title} ${r.category || ''}` }));
    }
    if (on('document_library')) {
      const [rows] = await pool.execute(`
        SELECT id, title, category, visible_to_json, created_at AS at,
               (SELECT ta.name FROM cp_therapeutic_areas ta WHERE ta.id = cp_documents.therapeutic_area_id AND ta.client_id = cp_documents.client_id) AS area
          FROM cp_documents
         WHERE client_id = ? AND is_active = 1 AND ${VISIBLE_DOCUMENT_SQL}
         ORDER BY created_at DESC LIMIT 200`, [client.id]);
      rows.filter(r => canSee(r.visible_to_json, userType))
        .forEach(r => items.push({ type: 'document', id: r.id, title: r.title, at: r.at, area: r.area, text: `${r.title} ${r.category || ''}` }));
    }
    if (on('events')) {
      const [rows] = await pool.execute(`
        SELECT e.id, e.title, e.event_type, e.description, e.start_date AS at, ta.name AS area FROM cp_events e
          LEFT JOIN cp_therapeutic_areas ta ON ta.id = e.therapeutic_area_id AND ta.client_id = e.client_id
         WHERE e.client_id = ? AND e.is_active = 1 AND e.status = 'published'
           AND COALESCE(e.end_date, e.start_date) >= UTC_TIMESTAMP()
         ORDER BY e.start_date ASC LIMIT 200`, [client.id]);
      rows.forEach(r => items.push({ type: 'event', id: r.id, title: r.title, at: r.at, area: r.area, text: `${r.title} ${r.event_type || ''} ${r.description || ''}` }));
    }

    const lower = words.map(w => w.toLowerCase());
    let picked;
    if (!words.length) {
      picked = items.slice().sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, FOR_YOU_MAX);
    } else {
      // CPPM-122: an item tagged with one of the doctor's areas comes first; an
      // untagged item can still match by words. An item tagged with another area
      // is that area's, so its words are not searched.
      picked = items
        .map(it => {
          if (it.area) {
            const i = lower.indexOf(String(it.area).toLowerCase())
            return { ...it, because: i >= 0 ? words[i] : null, tagged: true }
          }
          return { ...it, because: words[lower.findIndex(w => it.text.toLowerCase().includes(w))], tagged: false }
        })
        .filter(it => it.because)
        .sort((a, b) => (b.tagged - a.tagged) || (new Date(b.at) - new Date(a.at)))
        .slice(0, FOR_YOU_MAX);
    }
    res.json({
      basis: words.length ? 'interests' : 'latest',
      words,
      items: picked.map(({ text, tagged, area, ...it }) => it),
    });
  } catch (err) {
    log.error('portal.personal.error', { err, route: 'GET /for-you', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/personal/follows?clientCode= — followed items enriched with detail
router.get('/follows', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const client = await resolveClient(req);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const [rows] = await pool.execute(
      `SELECT id, item_type, item_id, created_at FROM cp_user_follows
       WHERE portal_user_id = ? AND client_id = ? ORDER BY created_at DESC`,
      [req.portalUser.id, client.id]);
    const enriched = await Promise.all(rows.map(async f => {
      if (f.item_type === 'therapeutic_area') {
        const [[ta]] = await pool.execute(
          "SELECT id, name, slug, short_desc FROM cp_therapeutic_areas WHERE id = ? AND is_active = 1 AND status = 'published'", [f.item_id]);
        return { ...f, detail: ta || null };
      }
      if (f.item_type === 'drug') {
        const [[d]] = await pool.execute(
          "SELECT id, brand_name, generic_name FROM cp_drugs WHERE id = ? AND is_active = 1 AND status = 'published'", [f.item_id]);
        return { ...f, detail: d ? { id: d.id, name: d.brand_name || d.generic_name } : null };
      }
      return { ...f, detail: null };
    }));
    res.json({ follows: enriched.filter(f => f.detail) });
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/portal/personal/follows { clientCode, item_type, item_id }
router.post('/follows', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const client = await resolveClient(req);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const { item_type, item_id } = req.body;
    if (!FOLLOW_TYPES.includes(item_type) || !item_id) return res.status(400).json({ error: 'Invalid item to follow.' });
    await pool.execute(
      `INSERT IGNORE INTO cp_user_follows (portal_user_id, client_id, item_type, item_id) VALUES (?, ?, ?, ?)`,
      [req.portalUser.id, client.id, item_type, Number(item_id)]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// DELETE /api/portal/personal/follows { item_type, item_id }
router.delete('/follows', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const { item_type, item_id } = req.body;
    await pool.execute(
      `DELETE FROM cp_user_follows WHERE portal_user_id = ? AND item_type = ? AND item_id = ?`,
      [req.portalUser.id, item_type, Number(item_id)]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/portal/personal/activity?clientCode= — HCP self-analytics
router.get('/activity', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const client = await resolveClient(req);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const uid = req.portalUser.id;
    const [byStatus] = await pool.execute('SELECT status, COUNT(*) AS c FROM cp_submissions WHERE user_id = ? GROUP BY status', [uid]);
    const [[{ total: subTotal }]]    = await pool.execute('SELECT COUNT(*) AS total FROM cp_submissions WHERE user_id = ?', [uid]);
    const [[{ total: savedTotal }]]  = await pool.execute('SELECT COUNT(*) AS total FROM cp_saved_items WHERE portal_user_id = ? AND client_id = ?', [uid, client.id]);
    const [[{ total: followTotal }]] = await pool.execute('SELECT COUNT(*) AS total FROM cp_user_follows WHERE portal_user_id = ? AND client_id = ?', [uid, client.id]);
    const [[u]] = await pool.execute('SELECT created_at, last_login_at, specialty FROM cp_portal_users WHERE id = ?', [uid]);
    res.json({
      submissions: { total: subTotal, by_status: byStatus },
      saved: savedTotal,
      following: followTotal,
      member_since: u?.created_at || null,
      last_login: u?.last_login_at || null,
      specialty: u?.specialty || null,
    });
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// ── CP-63: GDPR data-subject rights ──────────────────────────────────────────

// GET /api/portal/personal/export?clientCode= — self-service data export (Art. 15).
// Streams a machine-readable JSON of everything we hold about the caller, and
// records the request for the admin audit trail.
router.get('/export', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const client = await resolveClient(req);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const uid = req.portalUser.id;

    const data = await buildExport(uid, client.id);
    if (!data.profile) return res.status(404).json({ error: 'User not found.' });

    // Record + audit (fulfilled immediately — export is self-service).
    await pool.execute(
      `INSERT INTO cp_data_requests (client_id, portal_user_id, request_type, status, requester_email, requester_name, requested_at, fulfilled_at, fulfilled_by)
       VALUES (?, ?, 'export', 'fulfilled', ?, ?, NOW(), NOW(), 'self-service')`,
      [client.id, uid, data.profile.email, `${data.profile.first_name || ''} ${data.profile.last_name || ''}`.trim()]
    );
    await systemAudit(`portal-user:${uid}`, client.id, 'DATA_EXPORT', 'portal_user', uid, { self_service: true });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="my-data-export-${uid}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    log.error('portal.personal.error', { err, route: 'GET /export', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/personal/erasure-request { clientCode } — request account deletion
// (Art. 17). Creates a pending request for admin review (retention holds apply), not
// an instant delete. Idempotent: one open request per user.
router.post('/erasure-request', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const client = await resolveClient(req);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const uid = req.portalUser.id;

    const [[open]] = await pool.execute(
      `SELECT id FROM cp_data_requests WHERE portal_user_id = ? AND request_type = 'erasure' AND status = 'pending' LIMIT 1`, [uid]);
    if (open) return res.status(409).json({ error: 'You already have a pending deletion request.' });

    const [[u]] = await pool.execute('SELECT email, first_name, last_name FROM cp_portal_users WHERE id = ? AND client_id = ?', [uid, client.id]);
    if (!u) return res.status(404).json({ error: 'User not found.' });

    const [r] = await pool.execute(
      `INSERT INTO cp_data_requests (client_id, portal_user_id, request_type, status, requester_email, requester_name)
       VALUES (?, ?, 'erasure', 'pending', ?, ?)`,
      [client.id, uid, u.email, `${u.first_name || ''} ${u.last_name || ''}`.trim()]);
    await systemAudit(`portal-user:${uid}`, client.id, 'ERASURE_REQUESTED', 'portal_user', uid, { request_id: r.insertId });

    res.status(201).json({ id: r.insertId, message: 'Your deletion request has been submitted. Our team will process it in line with legal retention requirements.' });
  } catch (err) {
    log.error('portal.personal.error', { err, route: 'POST /erasure-request', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
