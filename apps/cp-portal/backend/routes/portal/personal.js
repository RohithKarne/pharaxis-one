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

const FOLLOW_TYPES = ['therapeutic_area', 'drug'];

async function resolveClient(req) {
  const code = req.query.clientCode || req.body.clientCode;
  if (!code) return null;
  const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [code]);
  return client || null;
}

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
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
