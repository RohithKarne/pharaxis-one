/**
 * Admin Audit Trail — /api/admin/audit
 * Per-client paginated audit log with filtering.
 */
const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const log = require('../../utils/logger');

// One listing for both screens: a client's records, or (CPPM-62) the records that
// belong to no client — platform-admin sign-ins, failed sign-ins for unknown
// emails — which no client's screen can show.
async function listRecords(req, res, scope) {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    const conditions = [scope.condition];
    const params     = [...scope.params];

    if (req.query.entity) { conditions.push('l.entity = ?'); params.push(req.query.entity); }
    if (req.query.action) { conditions.push('l.action = ?'); params.push(req.query.action); }
    if (req.query.from)   { conditions.push('DATE(l.created_at) >= DATE(?)'); params.push(req.query.from); }
    if (req.query.to)     { conditions.push('DATE(l.created_at) <= DATE(?)'); params.push(req.query.to); }

    const where = conditions.join(' AND ');

    const [[{ cnt: total }]] = await pool.execute(`SELECT COUNT(*) as cnt FROM cp_audit_logs l WHERE ${where}`, params);
    const [records] = await pool.execute(
      `SELECT l.*, u.email as admin_email
       FROM cp_audit_logs l
       LEFT JOIN cp_admin_users u ON u.id = l.admin_id
       WHERE ${where}
       ORDER BY l.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // CPPM-151: the filter lists come from what this scope has actually recorded,
    // so an admin can narrow to LOGIN, SUBMITTED or BULK_PUBLISH and not only to
    // the handful of actions the screen used to list.
    const [entities] = await pool.execute(`SELECT DISTINCT l.entity FROM cp_audit_logs l WHERE ${scope.condition} AND l.entity IS NOT NULL AND l.entity <> '' ORDER BY l.entity`, scope.params);
    const [actions]  = await pool.execute(`SELECT DISTINCT l.action FROM cp_audit_logs l WHERE ${scope.condition} AND l.action IS NOT NULL AND l.action <> '' ORDER BY l.action`, scope.params);

    res.json({ records, total, page, limit, pages: Math.ceil(total / limit), filters: { entities: entities.map(r => r.entity), actions: actions.map(r => r.action) } });
  } catch (err) {
    log.error('admin.audit.error', { err, route: `GET /${scope.name}`, path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
}

// GET /api/admin/audit/platform — CPPM-62: platform admin only. Declared before
// /:clientId so "platform" is never read as a client id.
router.get('/platform', authenticateAdmin, (req, res) => {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ error: 'Only the platform admin can see the platform audit trail.' });
  return listRecords(req, res, { name: 'platform', condition: 'l.client_id IS NULL', params: [] });
});

// GET /api/admin/audit/:clientId?page=1&limit=50&entity=branding&action=UPDATE&from=2026-01-01&to=2026-12-31
router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) =>
  listRecords(req, res, { name: ':clientId', condition: 'l.client_id = ?', params: [req.params.clientId] }));

module.exports = router;
