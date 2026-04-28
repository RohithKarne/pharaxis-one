/**
 * processExplorer.js — /api/admin/process-logs
 * Returns captured API activity logs for the Process Explorer learning module.
 * Personal use only (Rohith) — not exposed to portal users.
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');

// GET /api/admin/process-logs?source=&method=&status=&range=&search=&limit=&offset=
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { source, method, status, range, search, limit = 100, offset = 0 } = req.query;

    const conditions = [];
    const params     = [];

    if (source && source !== 'all') { conditions.push('source = ?');  params.push(source); }
    if (method && method !== 'all') { conditions.push('method = ?');  params.push(method.toUpperCase()); }
    if (search)                     { conditions.push('path LIKE ?'); params.push(`%${search}%`); }
    if (status === 'success')       { conditions.push('status_code < 400'); }
    if (status === 'error')         { conditions.push('status_code >= 400'); }
    if (range === 'today')          { conditions.push('DATE(created_at) = DATE(NOW())'); }
    if (range === 'week')           { conditions.push('created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const safeLimit  = Math.min(1000, parseInt(limit) || 100);
    const safeOffset = Math.max(0, parseInt(offset) || 0);
    const [logs] = await pool.execute(`
      SELECT * FROM cp_process_logs ${where}
      ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}
    `, params);

    const [[{ c: total }]] = await pool.execute(`SELECT COUNT(*) as c FROM cp_process_logs ${where}`, params);

    res.json({ logs, total });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/process-logs — clear all logs
router.delete('/', authenticateAdmin, async (_req, res) => {
  try {
    await pool.execute('DELETE FROM cp_process_logs');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/process-logs/purge?days=N — delete logs older than N days
router.delete('/purge', authenticateAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const [result] = await pool.execute(`DELETE FROM cp_process_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`, [days]);
    res.json({ ok: true, deleted: result.affectedRows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
