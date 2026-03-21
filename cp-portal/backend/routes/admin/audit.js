/**
 * Admin Audit Trail — /api/admin/audit
 * Per-client paginated audit log with filtering.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');

// GET /api/admin/audit/:clientId?page=1&limit=50&entity=branding&action=UPDATE&from=2026-01-01&to=2026-12-31
router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { clientId } = req.params;
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const conditions = ['l.client_id = ?'];
  const params     = [clientId];

  if (req.query.entity) { conditions.push('l.entity = ?'); params.push(req.query.entity); }
  if (req.query.action) { conditions.push('l.action = ?'); params.push(req.query.action); }
  if (req.query.from)   { conditions.push("date(l.created_at) >= date(?)"); params.push(req.query.from); }
  if (req.query.to)     { conditions.push("date(l.created_at) <= date(?)"); params.push(req.query.to); }

  const where = conditions.join(' AND ');

  const total   = db.prepare(`SELECT COUNT(*) as cnt FROM cp_audit_logs l WHERE ${where}`).get(...params).cnt;
  const records = db.prepare(`
    SELECT l.*, u.email as admin_email
    FROM cp_audit_logs l
    LEFT JOIN cp_admin_users u ON u.id = l.admin_id
    WHERE ${where}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ records, total, page, limit, pages: Math.ceil(total / limit) });
});

module.exports = router;
