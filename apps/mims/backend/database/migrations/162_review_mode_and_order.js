'use strict';

/**
 * Migration 162 — sequential review (MIPM-204).
 *
 * A review now carries its own mode: parallel (everyone decides at once, as
 * before) or sequential (reviewers decide one after another, in the order they
 * were chosen). Each reviewer row carries its place in that order. Existing
 * reviews stay parallel; existing reviewers keep the order they were added in.
 *
 * cm_review_config (keyed by doc_id alone, so a document and a FAQ with the
 * same id shared one row) is no longer read; it is left in place.
 */

async function up(conn) {
  const [mode] = await conn.execute("SHOW COLUMNS FROM cm_reviews LIKE 'review_mode'");
  if (!mode.length) {
    await conn.execute("ALTER TABLE cm_reviews ADD COLUMN review_mode VARCHAR(20) NOT NULL DEFAULT 'parallel'");
  }
  const [order] = await conn.execute("SHOW COLUMNS FROM cm_reviewers LIKE 'sort_order'");
  if (!order.length) {
    await conn.execute('ALTER TABLE cm_reviewers ADD COLUMN sort_order INT NOT NULL DEFAULT 0');
    await conn.execute('UPDATE cm_reviewers SET sort_order = id');
  }
}

async function down(_conn) {}

module.exports = { up, down };
