'use strict';

/**
 * routes/help.js — Public Help Articles API (S21-1)
 *
 * Endpoints:
 *   GET /api/help          — contextual fetch with 4-level fallback + role filter
 *   GET /api/help/search   — FULLTEXT search with role filter
 *
 * Cache: in-memory Map, 10-minute TTL, busted when admin writes occur.
 * view_count: fire-and-forget increment on every GET /api/help hit.
 */

const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { hasGlobalAdminScope } = require('../utils/adminScope');

// ── 10-minute in-memory cache ────────────────────────────────────────────────
const helpCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheGet(key) {
  const entry = helpCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { helpCache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data) {
  helpCache.set(key, { data, ts: Date.now() });
}

// Export so admin route can bust cache on writes
function cacheBust() { helpCache.clear(); }
module.exports.cacheBust = cacheBust;

/**
 * Build audience filter clause — returns articles visible to the requesting role.
 * audience column is JSON: ["all"] | ["agent","cm_admin"] | etc.
 */
function audienceClause(user) {
  const roles = hasGlobalAdminScope(user)
    ? ['admin', 'platform_admin', 'superadmin']
    : [user?.role || 'agent'];
  const clause = [
    `JSON_CONTAINS(audience, '"all"')`,
    ...roles.map(() => 'JSON_CONTAINS(audience, ?)'),
  ].join('\n    OR ');
  return {
    clause: `(\n    ${clause}\n  )`,
    params: roles.map((role) => JSON.stringify(role)),
  };
}

// ── GET /api/help ─────────────────────────────────────────────────────────────
// Query params:
//   feature_key  — exact key (e.g. "cm.documents")
//   feature_group — fallback group (e.g. "cm")
//   page, limit  — pagination (default limit 20)
router.get('/help', authenticate, async (req, res) => {
  try {
    const { feature_key, feature_group, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const role = req.user.role || 'agent';
    const roleCacheKey = hasGlobalAdminScope(req.user) ? 'platform_admin' : role;
    const orgId = req.user.orgId || null;
    const audienceFilter = audienceClause(req.user);

    // Cache key includes role + org + key/group
    const cacheKey = `help:${roleCacheKey}:${orgId}:${feature_key || ''}:${feature_group || ''}:${page}:${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    // 4-level fallback chain:
    // 1. Exact feature_key match (org-specific first, then global)
    // 2. Parent key match (e.g. "cm" when key is "cm.documents")
    // 3. feature_group match
    // 4. General articles (feature_key = "general")
    const params = [];

    let articles = [];

    // Helper: fetch articles for a given WHERE extra condition
    async function fetchArticles(extraWhere, extraParams) {
      const q = `
        SELECT id, feature_key, feature_group, tags, title, summary, content_html,
               audience, version, sort_order, view_count, last_reviewed_at,
               updated_at
        FROM help_articles
        WHERE is_active = 1
          AND ${audienceFilter.clause}
          AND (org_id IS NULL OR org_id = ?)
          AND (${extraWhere})
        ORDER BY
          CASE WHEN org_id = ? THEN 0 ELSE 1 END,
          sort_order ASC,
          updated_at DESC
        LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
      `;
      const [rows] = await pool.execute(q, [...audienceFilter.params, orgId, ...extraParams, orgId]);
      return rows;
    }

    if (feature_key) {
      // Level 1: exact key
      articles = await fetchArticles('feature_key = ?', [feature_key]);

      // Level 2: parent key (trim last segment after last dot)
      if (!articles.length) {
        const parentKey = feature_key.includes('.')
          ? feature_key.substring(0, feature_key.lastIndexOf('.'))
          : null;
        if (parentKey) {
          articles = await fetchArticles('feature_key = ?', [parentKey]);
        }
      }
    }

    // Level 3: feature_group
    if (!articles.length && feature_group) {
      articles = await fetchArticles('feature_group = ?', [feature_group]);
    }

    // Level 4: general
    if (!articles.length) {
      articles = await fetchArticles("feature_key = 'general'", []);
    }

    const payload = { articles, feature_key: feature_key || null, feature_group: feature_group || null };
    cacheSet(cacheKey, payload);

    // Fire-and-forget view_count increment for all returned article ids
    if (articles.length) {
      const ids = articles.map(a => a.id);
      pool.execute(
        `UPDATE help_articles SET view_count = view_count + 1 WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      ).catch(() => {});
    }

    res.json(payload);
  } catch (err) {
    console.error('GET /api/help error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── GET /api/help/search ──────────────────────────────────────────────────────
// Query params:
//   q    — search query (required)
//   limit — max results (default 10)
router.get('/help/search', authenticate, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q || q.trim().length < 2) return res.json({ articles: [] });

    const orgId = req.user.orgId || null;
    const audienceFilter = audienceClause(req.user);
    const safeLimit = Math.min(parseInt(limit, 10) || 10, 50);

    try {
      const [articles] = await pool.execute(
        `SELECT id, feature_key, feature_group, tags, title, summary, content_html,
                audience, version, sort_order, view_count, last_reviewed_at, updated_at,
                MATCH(title, content_html, summary) AGAINST (? IN BOOLEAN MODE) AS relevance
         FROM help_articles
         WHERE is_active = 1
           AND MATCH(title, content_html, summary) AGAINST (? IN BOOLEAN MODE)
           AND (
             JSON_CONTAINS(audience, '"all"')
             OR ${audienceFilter.params.map(() => 'JSON_CONTAINS(audience, ?)').join('\n             OR ')}
           )
           AND (org_id IS NULL OR org_id = ?)
         ORDER BY relevance DESC, sort_order ASC
         LIMIT ?`,
        [q, q, ...audienceFilter.params, orgId, safeLimit]
      );

      return res.json({ articles, query: q });
    } catch (fullTextErr) {
      const like = `%${q.trim()}%`;
      const [articles] = await pool.execute(
        `SELECT id, feature_key, feature_group, tags, title, summary, content_html,
                audience, version, sort_order, view_count, last_reviewed_at, updated_at
         FROM help_articles
         WHERE is_active = 1
           AND (
             title LIKE ?
             OR summary LIKE ?
             OR content_html LIKE ?
           )
           AND (
             JSON_CONTAINS(audience, '"all"')
             OR ${audienceFilter.params.map(() => 'JSON_CONTAINS(audience, ?)').join('\n             OR ')}
           )
           AND (org_id IS NULL OR org_id = ?)
         ORDER BY sort_order ASC, updated_at DESC
         LIMIT ${safeLimit}`,
        [like, like, like, ...audienceFilter.params, orgId]
      );
      return res.json({ articles, query: q, fallback: 'like' });
    }
  } catch (err) {
    console.error('GET /api/help/search error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
module.exports.cacheBust = cacheBust;
