/**
 * processExplorer.js — /api/admin/process-logs
 * Returns captured API activity logs for the Process Explorer learning module.
 * Personal use only (Rohith) — not exposed to portal users.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');

// GET /api/admin/process-logs?source=&method=&status=&range=&search=&limit=&offset=
router.get('/', authenticateAdmin, (req, res) => {
  const { source, method, status, range, search, limit = 100, offset = 0 } = req.query;

  const conditions = [];
  const params     = [];

  if (source && source !== 'all') { conditions.push('source = ?');  params.push(source); }
  if (method && method !== 'all') { conditions.push('method = ?');  params.push(method.toUpperCase()); }
  if (search)                     { conditions.push('path LIKE ?'); params.push(`%${search}%`); }
  if (status === 'success')       { conditions.push('status_code < 400'); }
  if (status === 'error')         { conditions.push('status_code >= 400'); }
  if (range === 'today')          { conditions.push("date(created_at) = date('now')"); }
  if (range === 'week')           { conditions.push("created_at >= datetime('now', '-7 days')"); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const logs  = db.prepare(`
    SELECT * FROM cp_process_logs ${where}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), parseInt(offset));

  const total = db.prepare(`SELECT COUNT(*) as c FROM cp_process_logs ${where}`).get(...params);

  res.json({ logs, total: total.c });
});

// DELETE /api/admin/process-logs — clear all logs
router.delete('/', authenticateAdmin, (_req, res) => {
  db.prepare('DELETE FROM cp_process_logs').run();
  res.json({ ok: true });
});

// DELETE /api/admin/process-logs/purge?days=N — delete logs older than N days
router.delete('/purge', authenticateAdmin, (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const result = db.prepare(`DELETE FROM cp_process_logs WHERE created_at < datetime('now', ?)`)
    .run(`-${days} days`);
  res.json({ ok: true, deleted: result.changes });
});

module.exports = router;
