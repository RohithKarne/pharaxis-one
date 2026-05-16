'use strict';
// Migration 044 — Theme 6 Documents Power (Wave 3).
// Adds full-text indexing over ocr_text + original_name + mime_type so
// "search across all uploads" works. MySQL 8 FULLTEXT on InnoDB.

async function up(conn) {
  // Add a small synthetic column so a single index covers name + ocr.
  try {
    await conn.execute(`ALTER TABLE attachments ADD COLUMN search_blob TEXT
      GENERATED ALWAYS AS (CONCAT_WS(' ', original_name, mime_type, IFNULL(ocr_text,''))) STORED`);
  } catch (_) { /* column may already exist */ }
  try { await conn.execute(`ALTER TABLE attachments ADD FULLTEXT INDEX ft_attachments_search (search_blob)`); }
  catch (_) { /* index may already exist */ }
}

async function down(conn) {
  try { await conn.execute(`ALTER TABLE attachments DROP INDEX ft_attachments_search`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE attachments DROP COLUMN search_blob`); } catch (_) {}
}

module.exports = { up, down };
