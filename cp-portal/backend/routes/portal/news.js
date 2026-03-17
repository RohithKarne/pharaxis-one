/**
 * Portal News — /api/portal/news
 * F-05: Published news feed filtered by client + user_type
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');

function toUrl(thumbnailPath) {
  if (!thumbnailPath) return null;
  if (thumbnailPath.startsWith('http://') || thumbnailPath.startsWith('https://')) return thumbnailPath;
  return thumbnailPath.startsWith('/') ? thumbnailPath : `/${thumbnailPath}`;
}

function isFeatureEnabled(clientId, featureKey) {
  const row = db.prepare('SELECT is_enabled FROM cp_features WHERE client_id = ? AND feature_key = ?').get(clientId, featureKey);
  return row ? row.is_enabled === 1 : false;
}

// GET /api/portal/news?clientCode=xxx&page=1&limit=10
router.get('/', authenticatePortal, (req, res) => {
  const { clientCode } = req.query;
  if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  if (!isFeatureEnabled(client.id, 'news_announcements')) {
    return res.status(403).json({ error: 'News feature is not enabled for this portal.' });
  }

  const page     = Math.max(1, parseInt(req.query.page) || 1);
  const limit    = Math.min(50, parseInt(req.query.limit) || 10);
  const offset   = (page - 1) * limit;
  const userType = req.portalUser?.user_type || 'other';
  const now      = new Date().toISOString();
  const category = req.query.category || null;

  const allPosts = db.prepare(`
    SELECT id, title, body_html, category, thumbnail_path, target_types_json, publish_at, view_count, created_at
    FROM cp_news_posts
    WHERE client_id = ? AND status = 'published' AND publish_at <= ?
    ORDER BY publish_at DESC
  `).all(client.id, now);

  // Filter by user_type: empty array = visible to all
  const visiblePosts = allPosts.filter(p => {
    const types = JSON.parse(p.target_types_json || '[]');
    return types.length === 0 || types.includes(userType);
  });

  // allCategories always reflects the full visible set (not the category-filtered subset)
  const allCategories = [...new Set(visiblePosts.map(p => p.category).filter(Boolean))];

  // Apply server-side category filter after computing allCategories
  const filtered = category ? visiblePosts.filter(p => p.category === category) : visiblePosts;

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + limit).map(p => ({ ...p, thumbnail_url: toUrl(p.thumbnail_path) }));

  res.json({ posts: paged, total, page, limit, allCategories });
});

// GET /api/portal/news/:postId?clientCode=xxx — single post + increment view_count
router.get('/:postId', authenticatePortal, (req, res) => {
  const { clientCode } = req.query;
  if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  if (!isFeatureEnabled(client.id, 'news_announcements')) {
    return res.status(403).json({ error: 'News feature is not enabled for this portal.' });
  }

  const post = db.prepare(`
    SELECT * FROM cp_news_posts
    WHERE id = ? AND client_id = ? AND status = 'published'
  `).get(req.params.postId, client.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  // Verify user_type access
  const types = JSON.parse(post.target_types_json || '[]');
  const userType = req.portalUser?.user_type || 'other';
  if (types.length > 0 && !types.includes(userType)) return res.status(403).json({ error: 'Access denied.' });

  // MED-49: view_count increment removed from GET — use POST /:clientCode/posts/:id/view instead

  res.json({ post: { ...post, thumbnail_url: toUrl(post.thumbnail_path) } });
});

// POST /api/portal/news/:clientCode/posts/:id/view — increment view count (idempotent intent; called once per session by frontend)
router.post('/:clientCode/posts/:id/view', authenticatePortal, (req, res) => {
  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(req.params.clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });
  db.prepare('UPDATE cp_news_posts SET view_count = view_count + 1 WHERE id = ? AND client_id = ?').run(req.params.id, client.id);
  res.json({ ok: true });
});

// GET /api/portal/news/preview/:postId — admin preview, does NOT increment view_count
router.get('/preview/:postId', requirePortalAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM cp_news_posts WHERE id = ?').get(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  res.json({ post });
});

module.exports = router;
