/**
 * Admin Analytics — /api/admin/analytics
 * S4-6: Per-client usage stats + S4-7: CSV export
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');

// GET /api/admin/analytics/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const id = req.params.clientId;

  const portalUsers   = db.prepare('SELECT COUNT(*) as cnt FROM cp_portal_users WHERE client_id = ? AND is_active = 1').get(id);
  const totalSubs     = db.prepare('SELECT COUNT(*) as cnt FROM cp_submissions WHERE client_id = ?').get(id);
  const subsByType    = db.prepare(`SELECT submission_type as form_type, COUNT(*) as count FROM cp_submissions WHERE client_id = ? GROUP BY submission_type ORDER BY count DESC`).all(id);
  const totalDownloads = db.prepare('SELECT COALESCE(SUM(download_count),0) as cnt FROM cp_documents WHERE client_id = ? AND is_active = 1').get(id);
  const topDocs       = db.prepare(`SELECT title, download_count FROM cp_documents WHERE client_id = ? AND is_active = 1 AND download_count > 0 ORDER BY download_count DESC LIMIT 5`).all(id);
  const topSafety     = db.prepare(`SELECT title, view_count as views FROM cp_safety_alerts WHERE client_id = ? AND view_count > 0 ORDER BY view_count DESC LIMIT 5`).all(id);
  const publishedNews = db.prepare(`SELECT COUNT(*) as cnt FROM cp_news_posts WHERE client_id = ? AND status = 'published'`).get(id);
  const publishedDocs = db.prepare(`SELECT COUNT(*) as cnt FROM cp_documents WHERE client_id = ? AND status = 'published' AND is_active = 1`).get(id);
  const activeSafety  = db.prepare(`SELECT COUNT(*) as cnt FROM cp_safety_alerts WHERE client_id = ? AND status = 'active'`).get(id);

  // Submissions trend — last 6 months
  const subsTrend = db.prepare(`
    SELECT strftime('%Y-%m', submitted_at) as month, COUNT(*) as count
    FROM cp_submissions WHERE client_id = ?
    AND submitted_at >= datetime('now', '-6 months')
    GROUP BY month ORDER BY month ASC
  `).all(id);

  // Recent audit activity — last 10 events
  const recentActivity = db.prepare(`
    SELECT action, entity, entity_id, admin_name, created_at
    FROM cp_audit_logs WHERE client_id = ?
    ORDER BY created_at DESC LIMIT 10
  `).all(id);

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
});

// Sanitize CSV field — prevent XLS formula injection (=, +, -, @ prefixes)
function csvSafe(val) {
  const s = String(val ?? '')
  return /^[=+\-@]/.test(s) ? `'${s}` : s
}

// GET /api/admin/analytics/:clientId/export — S4-7: CSV export
router.get('/:clientId/export', authenticateAdmin, requireClientAccess, (req, res) => {
  const id     = req.params.clientId;
  const client = db.prepare('SELECT name, code FROM cp_clients WHERE id = ?').get(id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  const subs = db.prepare(`
    SELECT submission_type as form_type, status, submitted_at,
           json_extract(form_data, '$.email') as email,
           json_extract(form_data, '$.first_name') as first_name,
           json_extract(form_data, '$.last_name') as last_name
    FROM cp_submissions WHERE client_id = ? ORDER BY submitted_at DESC
  `).all(id);

  const docs = db.prepare(`
    SELECT title, category, doc_type, download_count, status, created_at
    FROM cp_documents WHERE client_id = ? AND is_active = 1 ORDER BY download_count DESC
  `).all(id);

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
});

module.exports = router;
