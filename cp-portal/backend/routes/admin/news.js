/**
 * Admin News — /api/admin/news
 * F-05: News & Announcements CRUD per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');

function sanitiseHtml(dirty) {
  // Blocklist-based sanitizer: strips dangerous tags and attributes
  if (!dirty) return '';
  // Strip script/style/iframe/object/embed tags completely (including content)
  let clean = dirty.replace(/<(script|style|iframe|object|embed|form|input|button)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Remove event handler attributes (on*)
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  // Remove javascript: hrefs
  clean = clean.replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, '');
  // Remove data: URIs in src/href
  clean = clean.replace(/(src|href)\s*=\s*["']\s*data:[^"']*["']/gi, '');
  return clean;
}

// GET /api/admin/news/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM cp_news_posts WHERE client_id = ?';
  const params = [req.params.clientId];
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';
  res.json({ posts: db.prepare(query).all(...params) });
});

// POST /api/admin/news/:clientId
router.post('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { title, body_html, category, thumbnail_path, target_types, status } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required.' });

  let publishAtIso = new Date().toISOString();
  if (req.body.publish_at) {
    const d = new Date(req.body.publish_at);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: 'publish_at must be a valid datetime string.' });
    }
    publishAtIso = d.toISOString();
  }

  const result = db.prepare(`
    INSERT INTO cp_news_posts (client_id, title, body_html, category, thumbnail_path, target_types_json, status, publish_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.clientId,
    title,
    sanitiseHtml(body_html),
    category || null,
    thumbnail_path || null,
    JSON.stringify(target_types || []),
    status || 'draft',
    publishAtIso,
  );

  res.json({ post: db.prepare('SELECT * FROM cp_news_posts WHERE id = ?').get(result.lastInsertRowid) });
});

// PUT /api/admin/news/:clientId/:postId
router.put('/:clientId/:postId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { title, body_html, category, thumbnail_path, target_types, status } = req.body;
  const fields = [], values = [];

  let publishAtIso;
  if (req.body.publish_at !== undefined) {
    const d = new Date(req.body.publish_at);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: 'publish_at must be a valid datetime string.' });
    }
    publishAtIso = d.toISOString();
  }

  if (title !== undefined)        { fields.push('title = ?');              values.push(title); }
  if (body_html !== undefined)    { fields.push('body_html = ?');          values.push(sanitiseHtml(body_html)); }
  if (category !== undefined)     { fields.push('category = ?');           values.push(category); }
  if (thumbnail_path !== undefined) {
    fields.push('thumbnail_path = ?');
    // Explicitly clearing (null or '') stores null; non-empty string stores as-is
    values.push(thumbnail_path === null || thumbnail_path === '' ? null : thumbnail_path);
  }
  if (target_types !== undefined) { fields.push('target_types_json = ?'); values.push(JSON.stringify(target_types)); }
  if (status !== undefined)       { fields.push('status = ?');             values.push(status); }
  if (publishAtIso !== undefined) { fields.push('publish_at = ?');         values.push(publishAtIso); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  fields.push("updated_at = datetime('now')");
  values.push(req.params.postId, req.params.clientId);

  db.prepare(`UPDATE cp_news_posts SET ${fields.join(', ')} WHERE id = ? AND client_id = ?`).run(...values);
  res.json({ ok: true });
});

// DELETE /api/admin/news/:clientId/:postId — archive (soft delete)
router.delete('/:clientId/:postId', authenticateAdmin, requireClientAccess, (req, res) => {
  db.prepare("UPDATE cp_news_posts SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND client_id = ?")
    .run(req.params.postId, req.params.clientId);
  res.json({ ok: true });
});

module.exports = router;
