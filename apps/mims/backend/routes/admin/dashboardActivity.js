'use strict';

/**
 * admin/dashboardActivity.js — recent platform activity feed for the
 * MIMS Admin Dashboard. Merges entries across audit_logs, login_audit,
 * case_audit_trail, and transmission_audit_trail (when available) into
 * a single newest-first feed.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

router.get('/dashboard/activity', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit || '50', 10));

  const queries = [
    {
      sql: `
        SELECT 'audit'                 AS source,
               al.id                   AS source_id,
               al.created_at           AS ts,
               COALESCE(al.user_name, u.name, 'system') AS who,
               al.action               AS action,
               al.entity               AS entity,
               al.entity_id            AS entity_id,
               LEFT(COALESCE(al.details, ''), 180) AS detail
          FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
         WHERE al.created_at IS NOT NULL
         ORDER BY al.created_at DESC
         LIMIT ${limit}
      `,
    },
    {
      sql: `
        SELECT 'login'                 AS source,
               la.id                   AS source_id,
               la.created_at           AS ts,
               COALESCE(la.user_name, 'unknown') AS who,
               COALESCE(la.auth_event, la.status, 'login') AS action,
               'auth'                  AS entity,
               la.user_id              AS entity_id,
               LEFT(COALESCE(la.fail_reason, la.metadata, ''), 180) AS detail
          FROM login_audit la
         WHERE la.created_at IS NOT NULL
         ORDER BY la.created_at DESC
         LIMIT ${limit}
      `,
    },
  ];

  const results = [];
  for (const q of queries) {
    try {
      const [rows] = await pool.execute(q.sql);
      results.push(...rows);
    } catch (_) { /* best-effort — skip sources that don't exist on this DB */ }
  }

  // Optional sources: case_audit_trail, transmission_audit_trail
  try {
    const [rows] = await pool.execute(`
      SELECT 'case_audit' AS source, cat.id AS source_id, cat.created_at AS ts,
             COALESCE(cat.changed_by_name, 'system') AS who,
             CONCAT(cat.field_name, ' changed') AS action,
             'case' AS entity, cat.case_id AS entity_id,
             LEFT(CONCAT(COALESCE(cat.old_value,''), ' → ', COALESCE(cat.new_value,'')), 180) AS detail
        FROM case_audit_trail cat
       WHERE cat.created_at IS NOT NULL
       ORDER BY cat.created_at DESC
       LIMIT ${limit}
    `);
    results.push(...rows);
  } catch (_) {}

  try {
    const [rows] = await pool.execute(`
      SELECT 'transmission' AS source, tat.id AS source_id, tat.created_at AS ts,
             COALESCE(tat.sent_by_name, 'system') AS who,
             CONCAT('Transmission ', COALESCE(tat.status, '')) AS action,
             'transmission' AS entity, tat.case_id AS entity_id,
             LEFT(COALESCE(tat.target_system, ''), 180) AS detail
        FROM transmission_audit_trail tat
       WHERE tat.created_at IS NOT NULL
       ORDER BY tat.created_at DESC
       LIMIT ${limit}
    `);
    results.push(...rows);
  } catch (_) {}

  // Sort merged feed newest-first, trim to limit
  results.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  res.json({ activity: results.slice(0, limit) });
});

module.exports = router;
