/**
 * Admin News — /api/admin/news
 * F-05: News & Announcements CRUD per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { autoTranslate } = require('../../utils/translator');

// S4-8: Approval workflow — valid status transitions
const ALLOWED_TRANSITIONS = {
  draft:     ['review'],
  review:    ['approved', 'draft'],
  approved:  ['published', 'scheduled', 'draft'],
  published: ['archived'],
  scheduled: ['published', 'archived'],
  archived:  ['draft'],
};

// Which roles are required to set each target status
const PUBLISH_ROLES  = ['superadmin', 'admin'];
const APPROVE_ROLES  = ['superadmin', 'admin', 'reviewer'];
const SUBMIT_ROLES   = ['superadmin', 'admin', 'content_manager'];
const STATUS_ALLOWED_ROLES = {
  review:    SUBMIT_ROLES,
  approved:  APPROVE_ROLES,
  published: PUBLISH_ROLES,
  scheduled: PUBLISH_ROLES,
  archived:  PUBLISH_ROLES,
  draft:     APPROVE_ROLES,  // reject (going back to draft from review/approved)
};
const { audit } = require('../../utils/audit');
const { notifyPortalUsers } = require('../../utils/notify');

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
  const { title, body_html, category, thumbnail_path, target_types, status, is_pinned } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required.' });

  // S4-8: content_manager can only create as draft or review
  const initialStatus = status || 'draft';
  if (!SUBMIT_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Insufficient permissions to create news posts.' });
  }
  if (!PUBLISH_ROLES.includes(req.admin.role) && !['draft', 'review'].includes(initialStatus)) {
    return res.status(403).json({ error: `Your role cannot create posts with status '${initialStatus}'.` });
  }

  let publishAtIso = new Date().toISOString();
  if (req.body.publish_at) {
    const d = new Date(req.body.publish_at);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: 'publish_at must be a valid datetime string.' });
    }
    publishAtIso = d.toISOString();
  }

  if (is_pinned) {
    const pinnedCount = db.prepare('SELECT COUNT(*) as cnt FROM cp_news_posts WHERE client_id = ? AND is_pinned = 1 AND status != ?').get(req.params.clientId, 'archived');
    if (pinnedCount.cnt >= 10) {
      return res.status(400).json({ error: 'Maximum of 10 pinned posts allowed. Unpin an existing post first.' });
    }
  }

  const result = db.prepare(`
    INSERT INTO cp_news_posts (client_id, title, body_html, category, thumbnail_path, target_types_json, status, publish_at, is_pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.clientId,
    title,
    sanitiseHtml(body_html),
    category || null,
    thumbnail_path || null,
    JSON.stringify(target_types || []),
    status || 'draft',
    publishAtIso,
    is_pinned ? 1 : 0,
  );

  audit(req.admin, req.params.clientId, 'CREATE', 'news', result.lastInsertRowid, { title });
  if ((status || 'draft') === 'published') notifyPortalUsers(req.params.clientId, 'news', title, result.lastInsertRowid);
  autoTranslate(req.params.clientId, 'cp_news_posts', result.lastInsertRowid, { title, body_html: sanitiseHtml(body_html) }).catch(() => {});
  res.json({ post: db.prepare('SELECT * FROM cp_news_posts WHERE id = ?').get(result.lastInsertRowid) });
});

// POST /api/admin/news/:clientId/bulk — bulk action on multiple posts
router.post('/:clientId/bulk', authenticateAdmin, requireClientAccess, (req, res) => {
  const { ids, action } = req.body
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required.' })
  if (!['publish', 'archive', 'delete'].includes(action)) return res.status(400).json({ error: 'action must be publish, archive, or delete.' })
  if (!PUBLISH_ROLES.includes(req.admin.role)) return res.status(403).json({ error: 'Only admins can perform bulk actions.' })

  const placeholders = ids.map(() => '?').join(',')
  if (action === 'publish') {
    db.prepare(`UPDATE cp_news_posts SET status='published', updated_at=datetime('now') WHERE id IN (${placeholders}) AND client_id=?`).run(...ids, req.params.clientId)
  } else {
    db.prepare(`UPDATE cp_news_posts SET status='archived', updated_at=datetime('now') WHERE id IN (${placeholders}) AND client_id=?`).run(...ids, req.params.clientId)
  }
  audit(req.admin, req.params.clientId, `BULK_${action.toUpperCase()}`, 'news', null, { ids })
  res.json({ ok: true, affected: ids.length })
})

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

  const { is_pinned } = req.body;
  if (is_pinned) {
    const pinnedCount = db.prepare('SELECT COUNT(*) as cnt FROM cp_news_posts WHERE client_id = ? AND is_pinned = 1 AND status != ? AND id != ?').get(req.params.clientId, 'archived', req.params.postId);
    if (pinnedCount.cnt >= 10) {
      return res.status(400).json({ error: 'Maximum of 10 pinned posts allowed. Unpin an existing post first.' });
    }
  }
  // S4-8: validate status transition + role permission
  if (status !== undefined) {
    const current = db.prepare('SELECT status FROM cp_news_posts WHERE id = ? AND client_id = ?').get(req.params.postId, req.params.clientId);
    if (!current) return res.status(404).json({ error: 'Post not found.' });
    if (current.status !== status) {
      const allowed = ALLOWED_TRANSITIONS[current.status] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: `Invalid transition: ${current.status} → ${status}.` });
      }
      const requiredRoles = STATUS_ALLOWED_ROLES[status] || PUBLISH_ROLES;
      if (!requiredRoles.includes(req.admin.role)) {
        return res.status(403).json({ error: `Your role cannot set status to '${status}'.` });
      }
    }
  }

  if (title !== undefined)        { fields.push('title = ?');              values.push(title); }
  if (body_html !== undefined)    { fields.push('body_html = ?');          values.push(sanitiseHtml(body_html)); }
  if (category !== undefined)     { fields.push('category = ?');           values.push(category); }
  if (is_pinned !== undefined)    { fields.push('is_pinned = ?');          values.push(is_pinned ? 1 : 0); }
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
  audit(req.admin, req.params.clientId, 'UPDATE', 'news', req.params.postId, { fields: Object.keys(req.body) });
  if (status === 'published' && title) notifyPortalUsers(req.params.clientId, 'news', title, req.params.postId);
  // Re-translate whenever title or body changes
  const transFields = {};
  if (title !== undefined)     transFields.title     = title;
  if (body_html !== undefined) transFields.body_html = sanitiseHtml(body_html);
  if (Object.keys(transFields).length) autoTranslate(req.params.clientId, 'cp_news_posts', req.params.postId, transFields).catch(() => {});
  res.json({ ok: true });
});

// DELETE /api/admin/news/:clientId/:postId — archive (soft delete), admin+ only
router.delete('/:clientId/:postId', authenticateAdmin, requireClientAccess, (req, res) => {
  if (!PUBLISH_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Only admins can archive posts.' });
  }
  db.prepare("UPDATE cp_news_posts SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND client_id = ?")
    .run(req.params.postId, req.params.clientId);
  audit(req.admin, req.params.clientId, 'DELETE', 'news', req.params.postId, {});
  res.json({ ok: true });
});

module.exports = router;
