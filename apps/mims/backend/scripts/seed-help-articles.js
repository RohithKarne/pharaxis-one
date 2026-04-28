'use strict';

/**
 * seed-help-articles.js — One-shot seed script for Sprint 21 help articles.
 *
 * Usage:  node backend/scripts/seed-help-articles.js
 *
 * Reads help-seed/help_articles_seed.json and upserts each article into the
 * help_articles table. Matches existing rows on (feature_key, title) and
 * updates them; inserts new ones otherwise. Safe to re-run.
 */

const fs = require('fs');
const path = require('path');
const pool = require('../database/db');

const SEED_PATH = path.join(__dirname, '../../help-seed/help_articles_seed.json');

async function main() {
  console.log(`📖 Reading seed file: ${SEED_PATH}`);
  const raw = fs.readFileSync(SEED_PATH, 'utf8');
  const { articles } = JSON.parse(raw);

  if (!Array.isArray(articles) || !articles.length) {
    console.error('❌ No articles found in seed file.');
    process.exit(1);
  }

  console.log(`📚 Found ${articles.length} articles to seed.\n`);

  // Wait for DB ready
  if (pool.initPromise) await pool.initPromise;

  let inserted = 0, updated = 0, skipped = 0;

  for (const art of articles) {
    const {
      feature_key, feature_group, tags, title, content_html,
      summary, audience, org_id, sort_order, is_active,
    } = art;

    if (!feature_key || !title || !content_html) {
      console.warn(`⚠️  Skipping (missing required): ${title || '?'}`);
      skipped++;
      continue;
    }

    const audienceVal = Array.isArray(audience) ? audience : ['all'];
    const tagsVal = Array.isArray(tags) ? tags : [];

    const [[existing]] = await pool.execute(
      'SELECT id, version FROM help_articles WHERE feature_key = ? AND title = ? LIMIT 1',
      [feature_key, title]
    );

    if (existing) {
      await pool.execute(
        `UPDATE help_articles SET
           feature_group = ?, tags = ?, content_html = ?, summary = ?,
           audience = ?, org_id = ?,
           sort_order = ?, is_active = ?, version = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          feature_group || null, JSON.stringify(tagsVal), content_html, summary || null,
          JSON.stringify(audienceVal), org_id || null,
          sort_order !== undefined ? parseInt(sort_order, 10) : 100,
          is_active !== false ? 1 : 0,
          (existing.version || 1) + 1,
          existing.id,
        ]
      );
      console.log(`  🔄 Updated  — [${feature_key}] ${title}`);
      updated++;
    } else {
      await pool.execute(
        `INSERT INTO help_articles
           (feature_key, feature_group, tags, title, content_html, summary,
            audience, org_id, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          feature_key, feature_group || null, JSON.stringify(tagsVal),
          title, content_html, summary || null,
          JSON.stringify(audienceVal), org_id || null,
          sort_order !== undefined ? parseInt(sort_order, 10) : 100,
          is_active !== false ? 1 : 0,
        ]
      );
      console.log(`  ✅ Created  — [${feature_key}] ${title}`);
      inserted++;
    }
  }

  console.log(`\n🎉 Done — ${inserted} inserted, ${updated} updated, ${skipped} skipped.`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
