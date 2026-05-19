'use strict';
// Migration 071 — Sprint 2 #14: Source-document tagging on attachments.
// Each attachment can be tagged with one document_type AND a list of field-level
// source-of pointers (so an inspector can ask "what's the source for the date_of_onset
// field on case 1234?" and we can answer).
//
// Two new things on the attachments table:
//   - document_type_id     → FK to document_types
//   - source_for_json      → JSON array of {section_name, field_name, entity_type, entity_id}
//     identifying which field(s) this attachment is the source of.
//
// We also add a tag relationship table for free-form tags (lighter than a
// taxonomy entry) — used by the operator quick-tag UI.

async function up(conn) {
  // Extend attachments
  try {
    await conn.execute(`ALTER TABLE attachments ADD COLUMN document_type_id INT NULL`);
  } catch (_) { /* exists */ }
  try {
    await conn.execute(`ALTER TABLE attachments ADD COLUMN source_for_json JSON NULL`);
  } catch (_) { /* exists */ }
  try {
    await conn.execute(`ALTER TABLE attachments ADD KEY idx_att_doc_type (document_type_id)`);
  } catch (_) { /* exists */ }

  // Free-form tags (separate from taxonomy)
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS attachment_tags (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      attachment_id BIGINT NOT NULL,
      tag           VARCHAR(60) NOT NULL,
      created_by    INT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_att_tag (attachment_id, tag),
      KEY idx_att_tags_org (org_id, tag)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS attachment_tags`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE attachments DROP KEY idx_att_doc_type`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE attachments DROP COLUMN source_for_json`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE attachments DROP COLUMN document_type_id`); } catch (_) {}
}

module.exports = { up, down };
