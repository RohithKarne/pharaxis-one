'use strict';

/**
 * Migration 180 — the product a document is about (content management review,
 * Rohith 2026-10-14).
 *
 * WHY
 * A standard response or an enclosure is written for one product. Documents
 * carried only a "product specific" flag that nothing set, so the letter
 * builder offered every published document in the organisation for every
 * question, and nothing noticed a letter about one product enclosing another
 * product's document. NULL means the document applies to any product.
 */

async function up(conn) {
  const [[exists]] = await conn.execute(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cm_documents' AND COLUMN_NAME = 'product_id'"
  );
  if (!exists.n) await conn.execute('ALTER TABLE cm_documents ADD COLUMN product_id INT NULL, ADD INDEX idx_cm_documents_product (product_id)');
}

module.exports = { up };
