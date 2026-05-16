'use strict';
// Migration 043 — Theme 1 Rich Field Types (Wave 3).
// Most rich-field metadata lives inline in field_setup (config_json). For values
// that need their own row (signatures, image annotations with strokes/comments),
// we add a structured-value blob keyed by (entity, field) so the case form
// renderer can pull them without joining N tables.

async function up(conn) {
  // a) extend field_setup with a JSON config blob — type-specific knobs go here
  try { await conn.execute(`ALTER TABLE field_setup ADD COLUMN config_json JSON NULL`); } catch (_) {}

  // b) generic structured-value store (signatures, annotated images, addresses,
  //    rich text drafts, currency-with-rate snapshots, etc.)
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS rich_field_values (
      id            BIGINT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      entity_type   VARCHAR(40) NOT NULL,
      entity_id     BIGINT NOT NULL,
      section_name  VARCHAR(120) NOT NULL,
      field_name    VARCHAR(120) NOT NULL,
      value_type    VARCHAR(40) NOT NULL,   -- 'address','phone','currency','rich_text','signature','image_annotation'
      value_json    JSON NOT NULL,          -- structured payload
      created_by    INT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by    INT NULL,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_rfv_entity_field (entity_type, entity_id, section_name, field_name),
      KEY idx_rfv_org (org_id, entity_type),
      KEY idx_rfv_type (value_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS rich_field_values`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE field_setup DROP COLUMN config_json`); } catch (_) {}
}

module.exports = { up, down };
