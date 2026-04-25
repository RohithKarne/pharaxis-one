'use strict';

/**
 * admin/cmAuditTrail.js — CM Audit Trail API
 * Filters audit_logs to CM-scoped entities. Admin-only, org-scoped via user ownership.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

const CM_ENTITIES = ['cm_document', 'cm_faq', 'cm_folder', 'cm_module', 'cm_template', 'cm_review', 'cm_merge_report'];

function isSuperadmin(req) {
  return req.user.role === 'superadmin';
}

// GET /api/admin/cm-audit-trail/entities-summary — distinct CM entities with change history
router.get('/cm-audit-trail/entities-summary', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { entity, search, page = 1, limit = 50 } = req.query;
    const lim    = Math.max(1, parseInt(limit, 10) || 50);
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * lim;

    const entityList = entity ? [entity] : CM_ENTITIES;
    const placeholders = entityList.map(() => '?').join(',');

    let fromWhere, params;
    if (isSuperadmin(req)) {
      fromWhere = `FROM audit_logs al WHERE al.entity IN (${placeholders})`;
      params    = [...entityList];
    } else {
      fromWhere = `FROM audit_logs al
                   JOIN user_org_access uoa ON uoa.user_id = al.user_id
                     AND uoa.org_id = ? AND uoa.is_active = 1
                   WHERE al.entity IN (${placeholders})`;
      params = [req.user.orgId, ...entityList];
    }

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(DISTINCT CONCAT(al.entity, '-', al.entity_id)) AS total ${fromWhere}`, params
    );
    const [entities] = await pool.execute(
      `SELECT al.entity, al.entity_id,
              COUNT(al.id) AS total_changes,
              MAX(al.created_at) AS last_changed_at,
              (SELECT user_name FROM audit_logs
               WHERE entity = al.entity AND entity_id = al.entity_id
               ORDER BY created_at DESC LIMIT 1) AS last_changed_by,
              (SELECT action FROM audit_logs
               WHERE entity = al.entity AND entity_id = al.entity_id
               ORDER BY created_at DESC LIMIT 1) AS last_action
       ${fromWhere}
       GROUP BY al.entity, al.entity_id
       ORDER BY last_changed_at DESC
       LIMIT ${lim} OFFSET ${offset}`,
      params
    );
    res.json({ entities, total, page: parseInt(page, 10), limit: lim });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/cm-audit-trail
router.get('/cm-audit-trail', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { entity, entity_id, action, user_id, from_date, to_date, page = 1, limit = 50 } = req.query;
    const lim    = Math.max(1, parseInt(limit, 10) || 50);
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * lim;

    const entityList = entity ? [entity] : CM_ENTITIES;
    const placeholders = entityList.map(() => '?').join(',');

    // Build shared FROM + WHERE (no SELECT, no ORDER BY)
    let fromWhere, params;

    if (isSuperadmin(req)) {
      fromWhere = `FROM audit_logs al WHERE al.entity IN (${placeholders})`;
      params    = [...entityList];
    } else {
      // Scope to users belonging to this org via user_org_access
      fromWhere = `
        FROM audit_logs al
        JOIN user_org_access uoa ON uoa.user_id = al.user_id
          AND uoa.org_id = ? AND uoa.is_active = 1
        WHERE al.entity IN (${placeholders})
      `;
      params = [req.user.orgId, ...entityList];
    }

    if (entity_id) { fromWhere += ' AND al.entity_id = ?';    params.push(entity_id); }
    if (action)    { fromWhere += ' AND al.action LIKE ?';    params.push(`%${action}%`); }
    if (user_id)   { fromWhere += ' AND al.user_id = ?';      params.push(user_id); }
    if (from_date) { fromWhere += ' AND al.created_at >= ?';  params.push(from_date); }
    if (to_date)   { fromWhere += ' AND al.created_at <= ?';  params.push(to_date + ' 23:59:59'); }

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total ${fromWhere}`, params
    );

    const [entries] = await pool.execute(
      `SELECT al.id, al.user_id, al.user_name, al.action, al.entity, al.entity_id,
              al.details, al.created_at, al.before_value, al.after_value, al.change_reason
       ${fromWhere}
       ORDER BY al.created_at DESC
       LIMIT ${lim} OFFSET ${offset}`,
      params
    );

    res.json({ entries, total, page: parseInt(page, 10), limit: lim });
  } catch (err) {
    console.error('GET /cm-audit-trail error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
