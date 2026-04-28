/**
 * Admin Custom Reports — /api/admin/reports
 * S5: Per-client drag-and-drop report dashboards.
 */
const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess, logAudit } = require('../../middleware/auth');

// GET /api/admin/reports/:clientId — list all saved reports for a client
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { clientId } = req.params;
    const [reports] = await pool.execute(
      'SELECT id, name, layout_json, widgets_json, created_at, updated_at FROM cp_custom_reports WHERE client_id = ? ORDER BY updated_at DESC',
      [clientId]
    );
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/reports/:clientId — create a new report
router.post('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { name, layout, widgets } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Report name is required.' });

    const [result] = await pool.execute(
      `INSERT INTO cp_custom_reports (client_id, name, layout_json, widgets_json, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [clientId, name.trim(), JSON.stringify(layout || []), JSON.stringify(widgets || []), req.admin?.id || null]
    );

    await logAudit(req, 'CREATE', 'report', result.insertId, { name });
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/reports/:clientId/:reportId — save layout + widgets
router.patch('/:clientId/:reportId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { clientId, reportId } = req.params;
    const { name, layout, widgets } = req.body;

    const [[report]] = await pool.execute('SELECT id FROM cp_custom_reports WHERE id = ? AND client_id = ?', [reportId, clientId]);
    if (!report) return res.status(404).json({ error: 'Report not found.' });

    await pool.execute(
      `UPDATE cp_custom_reports SET name = COALESCE(?, name), layout_json = ?, widgets_json = ?, updated_at = NOW() WHERE id = ?`,
      [name?.trim() || null, JSON.stringify(layout || []), JSON.stringify(widgets || []), reportId]
    );

    await logAudit(req, 'UPDATE', 'report', reportId, { name });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/reports/:clientId/:reportId
router.delete('/:clientId/:reportId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { clientId, reportId } = req.params;
    const [[report]] = await pool.execute('SELECT id, name FROM cp_custom_reports WHERE id = ? AND client_id = ?', [reportId, clientId]);
    if (!report) return res.status(404).json({ error: 'Report not found.' });

    await pool.execute('DELETE FROM cp_custom_reports WHERE id = ?', [reportId]);
    await logAudit(req, 'DELETE', 'report', reportId, { name: report.name });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/reports/:clientId/data/:metric — fetch chart data for a widget
router.get('/:clientId/data/:metric', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const id = req.params.clientId;

    switch (req.params.metric) {
      case 'submissions_trend': {
        const [rows] = await pool.execute(`
          SELECT DATE_FORMAT(submitted_at, '%Y-%m') as month, COUNT(*) as count
          FROM cp_submissions WHERE client_id = ?
          AND submitted_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
          GROUP BY month ORDER BY month ASC
        `, [id]);
        return res.json({ data: rows });
      }
      case 'submissions_by_type': {
        const [rows] = await pool.execute(
          `SELECT submission_type as name, COUNT(*) as count FROM cp_submissions WHERE client_id = ? GROUP BY submission_type ORDER BY count DESC`,
          [id]
        );
        return res.json({ data: rows });
      }
      case 'top_documents': {
        const [rows] = await pool.execute(
          `SELECT title as name, download_count as value FROM cp_documents WHERE client_id = ? AND is_active = 1 AND download_count > 0 ORDER BY download_count DESC LIMIT 8`,
          [id]
        );
        return res.json({ data: rows });
      }
      case 'top_safety': {
        const [rows] = await pool.execute(
          `SELECT title as name, view_count as value FROM cp_safety_alerts WHERE client_id = ? AND view_count > 0 ORDER BY view_count DESC LIMIT 8`,
          [id]
        );
        return res.json({ data: rows });
      }
      case 'portal_users': {
        const [[row]] = await pool.execute(`SELECT COUNT(*) as value FROM cp_portal_users WHERE client_id = ? AND is_active = 1`, [id]);
        return res.json({ data: [{ name: 'Portal Users', value: row.value }] });
      }
      case 'total_submissions': {
        const [[row]] = await pool.execute(`SELECT COUNT(*) as value FROM cp_submissions WHERE client_id = ?`, [id]);
        return res.json({ data: [{ name: 'Total Submissions', value: row.value }] });
      }
      case 'total_downloads': {
        const [[row]] = await pool.execute(`SELECT COALESCE(SUM(download_count),0) as value FROM cp_documents WHERE client_id = ? AND is_active = 1`, [id]);
        return res.json({ data: [{ name: 'Total Downloads', value: row.value }] });
      }
      case 'published_news': {
        const [[row]] = await pool.execute(`SELECT COUNT(*) as value FROM cp_news_posts WHERE client_id = ? AND status = 'published'`, [id]);
        return res.json({ data: [{ name: 'Published News', value: row.value }] });
      }
      default:
        return res.status(400).json({ error: 'Unknown metric.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
