'use strict';

const express = require('express');
const { authenticateApiKey } = require('../../middleware/apiKeyAuth');
const pool = require('../../database/db');

const router = express.Router();

router.get('/export/cases', authenticateApiKey, async (req, res) => {
  try {
    const orgId = req.integration.org_id;
    const { case_type, status } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const parsedOffset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    let query = `
      SELECT id, case_number, case_type, status_id, priority, created_at, updated_at
      FROM cases
      WHERE org_id = ? AND is_deleted = 0
    `;
    const params = [orgId];

    if (case_type) {
      query += ' AND case_type = ?';
      params.push(case_type);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ` LIMIT ${parsedLimit} OFFSET ${parsedOffset}`;

    const [rows] = await pool.query(query, params);

    return res.json({
      org_id: orgId,
      exported_at: new Date().toISOString(),
      count: rows.length,
      cases: rows
    });
  } catch (error) {
    return res.status(500).json({ error: 'Export failed' });
  }
});

module.exports = router;
