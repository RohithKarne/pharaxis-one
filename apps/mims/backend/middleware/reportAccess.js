'use strict';
const pool = require('../database/db');

function requireReportAccess(reportKey) {
  return async (req, res, next) => {
    try {
      if (req.user.role === 'superadmin') return next();
      const orgId = req.user.orgId;
      const userId = req.user.userId;
      // Check org-level access
      const [orgRows] = await pool.query(
        'SELECT is_enabled FROM org_report_access WHERE org_id = ? AND report_key = ? LIMIT 1',
        [orgId, reportKey]
      );
      if (!orgRows.length || !orgRows[0].is_enabled) {
        return res.status(403).json({ error: 'Report not enabled for your organisation.' });
      }
      // Check user-level access
      const [userRows] = await pool.query(
        'SELECT is_enabled FROM user_report_access WHERE org_id = ? AND user_id = ? AND report_key = ? LIMIT 1',
        [orgId, userId, reportKey]
      );
      if (!userRows.length || !userRows[0].is_enabled) {
        return res.status(403).json({ error: 'You do not have access to this report. Contact your administrator.' });
      }
      next();
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  };
}

module.exports = { requireReportAccess };
