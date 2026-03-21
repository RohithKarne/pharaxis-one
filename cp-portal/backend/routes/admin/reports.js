/**
 * Admin Custom Reports — /api/admin/reports
 * S5: Per-client drag-and-drop report dashboards.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, requireClientAccess, logAudit } = require('../../middleware/auth');

// GET /api/admin/reports/:clientId — list all saved reports for a client
router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { clientId } = req.params;
  const reports = db.prepare(
    'SELECT id, name, layout_json, widgets_json, created_at, updated_at FROM cp_custom_reports WHERE client_id = ? ORDER BY updated_at DESC'
  ).all(clientId);
  res.json({ reports });
});

// POST /api/admin/reports/:clientId — create a new report
router.post('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { clientId } = req.params;
  const { name, layout, widgets } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Report name is required.' });

  const result = db.prepare(
    `INSERT INTO cp_custom_reports (client_id, name, layout_json, widgets_json, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(clientId, name.trim(), JSON.stringify(layout || []), JSON.stringify(widgets || []), req.admin?.id || null);

  logAudit(req, 'CREATE', 'report', result.lastInsertRowid, { name });
  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH /api/admin/reports/:clientId/:reportId — save layout + widgets
router.patch('/:clientId/:reportId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { clientId, reportId } = req.params;
  const { name, layout, widgets } = req.body;

  const report = db.prepare('SELECT id FROM cp_custom_reports WHERE id = ? AND client_id = ?').get(reportId, clientId);
  if (!report) return res.status(404).json({ error: 'Report not found.' });

  db.prepare(
    `UPDATE cp_custom_reports SET name = COALESCE(?, name), layout_json = ?, widgets_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name?.trim() || null, JSON.stringify(layout || []), JSON.stringify(widgets || []), reportId);

  logAudit(req, 'UPDATE', 'report', reportId, { name });
  res.json({ ok: true });
});

// DELETE /api/admin/reports/:clientId/:reportId
router.delete('/:clientId/:reportId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { clientId, reportId } = req.params;
  const report = db.prepare('SELECT id, name FROM cp_custom_reports WHERE id = ? AND client_id = ?').get(reportId, clientId);
  if (!report) return res.status(404).json({ error: 'Report not found.' });

  db.prepare('DELETE FROM cp_custom_reports WHERE id = ?').run(reportId);
  logAudit(req, 'DELETE', 'report', reportId, { name: report.name });
  res.json({ ok: true });
});

// GET /api/admin/reports/:clientId/data/:metric — fetch chart data for a widget
router.get('/:clientId/data/:metric', authenticateAdmin, requireClientAccess, (req, res) => {
  const id = req.params.clientId;

  switch (req.params.metric) {
    case 'submissions_trend': {
      const rows = db.prepare(`
        SELECT strftime('%Y-%m', submitted_at) as month, COUNT(*) as count
        FROM cp_submissions WHERE client_id = ?
        AND submitted_at >= datetime('now', '-6 months')
        GROUP BY month ORDER BY month ASC
      `).all(id);
      return res.json({ data: rows });
    }
    case 'submissions_by_type': {
      const rows = db.prepare(
        `SELECT submission_type as name, COUNT(*) as count FROM cp_submissions WHERE client_id = ? GROUP BY submission_type ORDER BY count DESC`
      ).all(id);
      return res.json({ data: rows });
    }
    case 'top_documents': {
      const rows = db.prepare(
        `SELECT title as name, download_count as value FROM cp_documents WHERE client_id = ? AND is_active = 1 AND download_count > 0 ORDER BY download_count DESC LIMIT 8`
      ).all(id);
      return res.json({ data: rows });
    }
    case 'top_safety': {
      const rows = db.prepare(
        `SELECT title as name, view_count as value FROM cp_safety_alerts WHERE client_id = ? AND view_count > 0 ORDER BY view_count DESC LIMIT 8`
      ).all(id);
      return res.json({ data: rows });
    }
    case 'portal_users': {
      const row = db.prepare(`SELECT COUNT(*) as value FROM cp_portal_users WHERE client_id = ? AND is_active = 1`).get(id);
      return res.json({ data: [{ name: 'Portal Users', value: row.value }] });
    }
    case 'total_submissions': {
      const row = db.prepare(`SELECT COUNT(*) as value FROM cp_submissions WHERE client_id = ?`).get(id);
      return res.json({ data: [{ name: 'Total Submissions', value: row.value }] });
    }
    case 'total_downloads': {
      const row = db.prepare(`SELECT COALESCE(SUM(download_count),0) as value FROM cp_documents WHERE client_id = ? AND is_active = 1`).get(id);
      return res.json({ data: [{ name: 'Total Downloads', value: row.value }] });
    }
    case 'published_news': {
      const row = db.prepare(`SELECT COUNT(*) as value FROM cp_news_posts WHERE client_id = ? AND status = 'published'`).get(id);
      return res.json({ data: [{ name: 'Published News', value: row.value }] });
    }
    default:
      return res.status(400).json({ error: 'Unknown metric.' });
  }
});

module.exports = router;
