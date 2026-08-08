/**
 * Admin Analytics — /api/admin/analytics
 * S4-6: Per-client usage stats + S4-7: CSV export
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const log = require('../../utils/logger');

// GET /api/admin/analytics/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const id = req.params.clientId;

    const [[portalUsers]]    = await pool.execute('SELECT COUNT(*) as cnt FROM cp_portal_users WHERE client_id = ? AND is_active = 1', [id]);
    const [[totalSubs]]      = await pool.execute('SELECT COUNT(*) as cnt FROM cp_submissions WHERE client_id = ?', [id]);
    const [subsByType]       = await pool.execute(`SELECT submission_type as form_type, COUNT(*) as count FROM cp_submissions WHERE client_id = ? GROUP BY submission_type ORDER BY count DESC`, [id]);
    const [[totalDownloads]] = await pool.execute('SELECT COALESCE(SUM(download_count),0) as cnt FROM cp_documents WHERE client_id = ? AND is_active = 1', [id]);
    const [topDocs]          = await pool.execute(`SELECT title, download_count FROM cp_documents WHERE client_id = ? AND is_active = 1 AND download_count > 0 ORDER BY download_count DESC LIMIT 5`, [id]);
    const [topSafety]        = await pool.execute(`SELECT title, view_count as views FROM cp_safety_alerts WHERE client_id = ? AND view_count > 0 ORDER BY view_count DESC LIMIT 5`, [id]);
    const [[publishedNews]]  = await pool.execute(`SELECT COUNT(*) as cnt FROM cp_news_posts WHERE client_id = ? AND status = 'published'`, [id]);
    const [[publishedDocs]]  = await pool.execute(`SELECT COUNT(*) as cnt FROM cp_documents WHERE client_id = ? AND status = 'published' AND is_active = 1`, [id]);
    const [[activeSafety]]   = await pool.execute(`SELECT COUNT(*) as cnt FROM cp_safety_alerts WHERE client_id = ? AND status = 'active'`, [id]);

    // Submissions trend — last 6 months
    const [subsTrend] = await pool.execute(
      `SELECT DATE_FORMAT(submitted_at, '%Y-%m') as month, COUNT(*) as count
       FROM cp_submissions WHERE client_id = ?
       AND submitted_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY month ORDER BY month ASC`,
      [id]
    );

    // Recent audit activity — last 10 events
    const [recentActivity] = await pool.execute(
      `SELECT action, entity, entity_id, admin_name, created_at
       FROM cp_audit_logs WHERE client_id = ?
       ORDER BY created_at DESC LIMIT 10`,
      [id]
    );

    res.json({
      stats: {
        portal_users:      portalUsers.cnt,
        total_submissions: totalSubs.cnt,
        total_downloads:   totalDownloads.cnt,
        published_news:    publishedNews.cnt,
        published_docs:    publishedDocs.cnt,
        active_safety:     activeSafety.cnt,
      },
      submission_types:  subsByType,
      top_documents:     topDocs,
      top_safety:        topSafety,
      submissions_trend: subsTrend,
      recent_activity:   recentActivity,
    });
  } catch (err) {
    log.error('admin.analytics.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// Sanitize CSV field — prevent XLS formula injection (=, +, -, @ prefixes)
function csvSafe(val) {
  const s = String(val ?? '')
  return /^[=+\-@]/.test(s) ? `'${s}` : s
}

// GET /api/admin/analytics/:clientId/export — S4-7: CSV export
router.get('/:clientId/export', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const id = req.params.clientId;
    const [[client]] = await pool.execute('SELECT name, code FROM cp_clients WHERE id = ?', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const [subs] = await pool.execute(
      `SELECT submission_type as form_type, status, submitted_at,
              JSON_EXTRACT(form_data, '$.email') as email,
              JSON_EXTRACT(form_data, '$.first_name') as first_name,
              JSON_EXTRACT(form_data, '$.last_name') as last_name
       FROM cp_submissions WHERE client_id = ? ORDER BY submitted_at DESC`,
      [id]
    );

    const [docs] = await pool.execute(
      `SELECT title, category, doc_type, download_count, status, created_at
       FROM cp_documents WHERE client_id = ? AND is_active = 1 ORDER BY download_count DESC`,
      [id]
    );

    let csv = `CP Portal Analytics Export — ${client.name} (${client.code})\n`;
    csv += `Generated: ${new Date().toISOString()}\n\n`;

    csv += `SUBMISSIONS\n`;
    csv += `Form Type,Status,Submitted At,Email,First Name,Last Name\n`;
    subs.forEach(s => {
      csv += `"${csvSafe(s.form_type)}","${csvSafe(s.status)}","${csvSafe(s.submitted_at)}","${csvSafe(s.email)}","${csvSafe(s.first_name)}","${csvSafe(s.last_name)}"\n`;
    });

    csv += `\nDOCUMENT DOWNLOADS\n`;
    csv += `Title,Category,Type,Downloads,Status,Uploaded\n`;
    docs.forEach(d => {
      csv += `"${csvSafe(d.title)}","${csvSafe(d.category)}","${csvSafe(d.doc_type)}","${csvSafe(d.download_count)}","${csvSafe(d.status)}","${csvSafe(d.created_at)}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="analytics-${client.code}-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) {
    log.error('admin.analytics.error', { err, route: 'GET /:clientId/export', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
