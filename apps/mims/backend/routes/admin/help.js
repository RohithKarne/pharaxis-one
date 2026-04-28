'use strict';

/**
 * routes/admin/help.js — Admin Help Articles Management API (S21-1)
 *
 * Endpoints:
 *   GET    /api/admin/help                   — list articles (filters: feature_key, feature_group, audience, search, is_active)
 *   POST   /api/admin/help                   — create article
 *   GET    /api/admin/help/:id               — get single article
 *   PUT    /api/admin/help/:id               — update article (version bump + cache bust)
 *   DELETE /api/admin/help/:id               — soft delete (is_active = 0)
 *   POST   /api/admin/help/bulk-import       — upsert JSON array of articles
 *   GET    /api/admin/help/stale             — articles not reviewed in 90+ days
 *   GET    /api/admin/help/coverage          — known feature keys vs DB distinct keys
 *   PATCH  /api/admin/help/:id/reviewed      — mark reviewed (last_reviewed_at = NOW())
 *
 * Role guard: admin + superadmin only.
 * Cache: busts public help cache on every write.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validate');

// Import public cache buster
let cacheBust = () => {};
try {
  const helpPublic = require('../help');
  if (helpPublic.cacheBust) cacheBust = helpPublic.cacheBust;
} catch (_) {}

// ── Role guard middleware ─────────────────────────────────────────────────────
function adminOnly(req, res, next) {
  if (!['admin', 'superadmin', 'cm_admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

function isSuperadmin(req) {
  return req.user?.role === 'superadmin';
}

function helpScope(req, alias = 'ha', { includeGlobal = true } = {}) {
  if (isSuperadmin(req)) return { clause: '', params: [] };
  const globalClause = includeGlobal ? ` OR ${alias}.org_id IS NULL` : '';
  return {
    clause: ` AND (${alias}.org_id = ?${globalClause})`,
    params: [req.user.orgId],
  };
}

// Known feature keys — source of truth for coverage report
const KNOWN_FEATURE_KEYS = [
  'general',
  'cases',
  'cases.create',
  'cases.detail',
  'cases.contacts',
  'cases.mi',
  'cases.ae',
  'cases.pc',
  'cases.workflow',
  'cm.folders',
  'cm.documents',
  'cm.modules',
  'cm.templates',
  'cm.merge_reports',
  'cm.faqs',
  'cm.reviews',
  'admin.picklists',
  'admin.field_setup',
  'admin.workflow',
  'admin.product_dictionary',
  'admin.security_groups',
  'admin.case_numbering',
  'admin.organisations',
  'admin.content_intelligence',
  'admin.policy_graph',
  'reports',
  'inbox',
  'browse',
];

// ── GET /api/admin/help/cache-bust — manual cache clear (admin only) ─────────
router.post('/help/cache-bust', authenticate, adminOnly, (_req, res) => {
  cacheBust();
  res.json({ success: true, message: 'Help cache cleared.' });
});

// ── GET /api/admin/help ───────────────────────────────────────────────────────
router.get('/help', authenticate, adminOnly, async (req, res) => {
  try {
    const { feature_key, feature_group, audience, search, is_active, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const scope = helpScope(req, 'ha', { includeGlobal: false });
    const params = [...scope.params];

    let where = 'WHERE 1=1';
    where += scope.clause;

    if (is_active !== undefined) {
      where += ' AND is_active = ?';
      params.push(parseInt(is_active, 10));
    }
    if (feature_key) {
      where += ' AND feature_key = ?';
      params.push(feature_key);
    }
    if (feature_group) {
      where += ' AND feature_group = ?';
      params.push(feature_group);
    }
    if (audience) {
      where += ' AND JSON_CONTAINS(audience, ?)';
      params.push(JSON.stringify(audience));
    }
    if (search) {
      where += ' AND (title LIKE ? OR summary LIKE ? OR feature_key LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM help_articles ha ${where}`,
      params
    );

    const [articles] = await pool.execute(
      `SELECT ha.*, u.name AS created_by_name, uu.name AS updated_by_name, rv.name AS reviewed_by_name
       FROM help_articles ha
       LEFT JOIN users u  ON u.id  = ha.created_by
       LEFT JOIN users uu ON uu.id = ha.updated_by
       LEFT JOIN users rv ON rv.id = ha.reviewed_by
       ${where}
       ORDER BY ha.sort_order ASC, ha.updated_at DESC
       LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`,
      params
    );

    res.json({ articles, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /api/admin/help error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── POST /api/admin/help ──────────────────────────────────────────────────────
router.post('/help', authenticate, adminOnly, validate(schemas.createHelpArticle), async (req, res) => {
  try {
    const {
      feature_key, feature_group, tags, title, content_html,
      summary, audience, org_id, sort_order, is_active,
    } = req.body;

    if (!feature_key || !title || !content_html) {
      return res.status(400).json({ error: 'feature_key, title, and content_html are required.' });
    }

    const audienceVal = Array.isArray(audience) ? audience : ['all'];
    const tagsVal = Array.isArray(tags) ? tags : [];
    const resolvedOrgId = isSuperadmin(req) ? (org_id || null) : req.user.orgId;

    const [result] = await pool.execute(
      `INSERT INTO help_articles
         (feature_key, feature_group, tags, title, content_html, summary,
          audience, org_id, sort_order, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        feature_key, feature_group || null, JSON.stringify(tagsVal),
        title, content_html, summary || null,
        JSON.stringify(audienceVal),
        resolvedOrgId,
        sort_order !== undefined ? parseInt(sort_order, 10) : 100,
        is_active !== false ? 1 : 0,
        req.user.userId, req.user.userId,
      ]
    );

    cacheBust();
    res.status(201).json({ message: 'Help article created.', id: result.insertId });
  } catch (err) {
    console.error('POST /api/admin/help error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── GET /api/admin/help/stale ─────────────────────────────────────────────────
router.get('/help/stale', authenticate, adminOnly, async (req, res) => {
  try {
    const scope = helpScope(req, 'ha', { includeGlobal: false });
    const [articles] = await pool.execute(
      `SELECT ha.id, ha.feature_key, ha.feature_group, ha.title, ha.summary,
              ha.last_reviewed_at, ha.version, ha.is_active,
              DATEDIFF(NOW(), COALESCE(ha.last_reviewed_at, ha.created_at)) AS days_since_review,
              u.name AS reviewed_by_name
       FROM help_articles ha
       LEFT JOIN users u ON u.id = ha.reviewed_by
       WHERE ha.is_active = 1
         ${scope.clause}
         AND (ha.last_reviewed_at IS NULL OR ha.last_reviewed_at < DATE_SUB(NOW(), INTERVAL 90 DAY))
       ORDER BY days_since_review DESC`,
      scope.params
    );
    res.json({ articles, count: articles.length });
  } catch (err) {
    console.error('GET /api/admin/help/stale error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── GET /api/admin/help/coverage ──────────────────────────────────────────────
router.get('/help/coverage', authenticate, adminOnly, async (req, res) => {
  try {
    const scope = helpScope(req, 'ha', { includeGlobal: false });
    const [rows] = await pool.execute(
      `SELECT feature_key, COUNT(*) AS article_count
       FROM help_articles ha WHERE ha.is_active = 1
       ${scope.clause}
       GROUP BY feature_key`,
      scope.params
    );
    const coveredKeys = new Set(rows.map(r => r.feature_key));
    const coverage = KNOWN_FEATURE_KEYS.map(key => ({
      feature_key: key,
      covered: coveredKeys.has(key),
      article_count: rows.find(r => r.feature_key === key)?.article_count || 0,
    }));
    const missing = coverage.filter(c => !c.covered).map(c => c.feature_key);
    res.json({ coverage, missing, total_keys: KNOWN_FEATURE_KEYS.length, covered_count: coveredKeys.size });
  } catch (err) {
    console.error('GET /api/admin/help/coverage error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── POST /api/admin/help/bulk-import ──────────────────────────────────────────
router.post('/help/bulk-import', authenticate, adminOnly, async (req, res) => {
  try {
    const { articles } = req.body;
    if (!Array.isArray(articles) || !articles.length) {
      return res.status(400).json({ error: 'articles array is required.' });
    }

    let inserted = 0, updated = 0, skipped = 0;
    const errors = [];

    for (const art of articles) {
      try {
        const {
          feature_key, feature_group, tags, title, content_html,
          summary, audience, org_id, sort_order, is_active,
        } = art;

        if (!feature_key || !title || !content_html) {
          skipped++;
          errors.push({ title: title || '?', reason: 'Missing feature_key, title, or content_html' });
          continue;
        }

        const audienceVal = Array.isArray(audience) ? audience : ['all'];
        const tagsVal = Array.isArray(tags) ? tags : [];
        const resolvedOrgId = isSuperadmin(req) ? (org_id || null) : req.user.orgId;

        // Upsert on (feature_key, title) — if both match, update content
        const [[existing]] = await pool.execute(
          'SELECT id, version FROM help_articles WHERE feature_key = ? AND title = ? AND org_id <=> ? LIMIT 1',
          [feature_key, title, resolvedOrgId]
        );

        if (existing) {
          await pool.execute(
            `UPDATE help_articles SET
               feature_group = ?, tags = ?, content_html = ?, summary = ?,
               audience = ?, org_id = ?,
               sort_order = ?, is_active = ?, version = ?, updated_by = ?, updated_at = NOW()
             WHERE id = ?`,
            [
              feature_group || null, JSON.stringify(tagsVal), content_html, summary || null,
              JSON.stringify(audienceVal), resolvedOrgId,
              sort_order !== undefined ? parseInt(sort_order, 10) : 100,
              is_active !== false ? 1 : 0,
              (existing.version || 1) + 1, req.user.userId,
              existing.id,
            ]
          );
          updated++;
        } else {
          await pool.execute(
            `INSERT INTO help_articles
               (feature_key, feature_group, tags, title, content_html, summary,
                audience, org_id, sort_order, is_active, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              feature_key, feature_group || null, JSON.stringify(tagsVal),
              title, content_html, summary || null,
              JSON.stringify(audienceVal), resolvedOrgId,
              sort_order !== undefined ? parseInt(sort_order, 10) : 100,
              is_active !== false ? 1 : 0,
              req.user.userId, req.user.userId,
            ]
          );
          inserted++;
        }
      } catch (artErr) {
        skipped++;
        errors.push({ title: art.title || '?', reason: artErr.message });
      }
    }

    cacheBust();
    res.json({ message: 'Bulk import complete.', inserted, updated, skipped, errors });
  } catch (err) {
    console.error('POST /api/admin/help/bulk-import error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── GET /api/admin/help/:id ───────────────────────────────────────────────────
router.get('/help/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const scope = helpScope(req, 'ha', { includeGlobal: false });
    const [[article]] = await pool.execute(
      `SELECT ha.*, u.name AS created_by_name, uu.name AS updated_by_name, rv.name AS reviewed_by_name
       FROM help_articles ha
       LEFT JOIN users u  ON u.id  = ha.created_by
       LEFT JOIN users uu ON uu.id = ha.updated_by
       LEFT JOIN users rv ON rv.id = ha.reviewed_by
       WHERE ha.id = ? ${scope.clause}`,
      [req.params.id, ...scope.params]
    );
    if (!article) return res.status(404).json({ error: 'Help article not found.' });
    res.json({ article });
  } catch (err) {
    console.error('GET /api/admin/help/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── PUT /api/admin/help/:id ───────────────────────────────────────────────────
router.put('/help/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const scope = helpScope(req, 'ha', { includeGlobal: false });
    const [[existing]] = await pool.execute(
      `SELECT * FROM help_articles ha WHERE ha.id = ? ${scope.clause}`,
      [req.params.id, ...scope.params]
    );
    if (!existing) return res.status(404).json({ error: 'Help article not found.' });

    const {
      feature_key, feature_group, tags, title, content_html,
      summary, audience, org_id, sort_order, is_active,
    } = req.body;
    const resolvedOrgId = isSuperadmin(req)
      ? (org_id !== undefined ? org_id : existing.org_id)
      : req.user.orgId;

    const audienceVal = audience !== undefined
      ? (Array.isArray(audience) ? audience : ['all'])
      : JSON.parse(existing.audience || '["all"]');
    const tagsVal = tags !== undefined
      ? (Array.isArray(tags) ? tags : [])
      : JSON.parse(existing.tags || '[]');

    await pool.execute(
      `UPDATE help_articles SET
         feature_key   = ?,
         feature_group = ?,
         tags          = ?,
         title         = ?,
         content_html  = ?,
         summary       = ?,
         audience      = ?,
         org_id        = ?,
         sort_order    = ?,
         is_active     = ?,
         version       = version + 1,
         updated_by    = ?,
         updated_at    = NOW()
       WHERE id = ?`,
      [
        feature_key     || existing.feature_key,
        feature_group   !== undefined ? feature_group   : existing.feature_group,
        JSON.stringify(tagsVal),
        title           || existing.title,
        content_html    !== undefined ? content_html    : existing.content_html,
        summary         !== undefined ? summary         : existing.summary,
        JSON.stringify(audienceVal),
        resolvedOrgId,
        sort_order      !== undefined ? parseInt(sort_order, 10) : existing.sort_order,
        is_active       !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        req.user.userId,
        req.params.id,
      ]
    );

    cacheBust();
    res.json({ message: 'Help article updated.' });
  } catch (err) {
    console.error('PUT /api/admin/help/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── DELETE /api/admin/help/:id — soft delete ──────────────────────────────────
router.delete('/help/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const scope = helpScope(req, 'ha', { includeGlobal: false });
    const [[existing]] = await pool.execute(
      `SELECT id FROM help_articles ha WHERE ha.id = ? ${scope.clause}`,
      [req.params.id, ...scope.params]
    );
    if (!existing) return res.status(404).json({ error: 'Help article not found.' });

    await pool.execute(
      'UPDATE help_articles SET is_active = 0, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [req.user.userId, req.params.id]
    );
    cacheBust();
    res.json({ message: 'Help article deactivated.' });
  } catch (err) {
    console.error('DELETE /api/admin/help/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── PATCH /api/admin/help/:id/reviewed ────────────────────────────────────────
router.patch('/help/:id/reviewed', authenticate, adminOnly, async (req, res) => {
  try {
    const scope = helpScope(req, 'ha', { includeGlobal: false });
    const [[existing]] = await pool.execute(
      `SELECT id FROM help_articles ha WHERE ha.id = ? ${scope.clause}`,
      [req.params.id, ...scope.params]
    );
    if (!existing) return res.status(404).json({ error: 'Help article not found.' });

    await pool.execute(
      'UPDATE help_articles SET last_reviewed_at = NOW(), reviewed_by = ?, updated_at = NOW() WHERE id = ?',
      [req.user.userId, req.params.id]
    );
    res.json({ message: 'Marked as reviewed.' });
  } catch (err) {
    console.error('PATCH /api/admin/help/:id/reviewed error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
