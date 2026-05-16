'use strict';
// Migration 039 — Generic attachments (Wave 0 foundation).
// Replaces ad-hoc per-feature attachment tables. Anything that needs file
// metadata (case attachments, signatures, image annotations, letter assets,
// MI response files, …) points an entity_type + entity_id into this row.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS attachments (
      id              BIGINT NOT NULL AUTO_INCREMENT,
      org_id          INT NOT NULL,
      entity_type     VARCHAR(40) NOT NULL,    -- 'case','case_ae_version','case_mi_response','letter','signature','field_image',...
      entity_id       BIGINT NOT NULL,
      field_name      VARCHAR(120) NULL,       -- for per-field attachments (Theme 6)
      storage_provider VARCHAR(20) NOT NULL DEFAULT 'local', -- 'local'|'s3'
      storage_key     VARCHAR(255) NOT NULL,   -- opaque key passed to fileStorageService
      thumb_key       VARCHAR(255) NULL,       -- separate key for generated thumbnail (if any)
      original_name   VARCHAR(255) NOT NULL,
      mime_type       VARCHAR(120) NOT NULL,
      size_bytes      BIGINT NOT NULL DEFAULT 0,
      checksum_sha256 CHAR(64) NULL,
      uploaded_by     INT NULL,
      uploaded_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ocr_text        MEDIUMTEXT NULL,         -- populated async by OCR pipeline (Wave 0 #6)
      ocr_status      ENUM('pending','done','failed','skipped') NOT NULL DEFAULT 'pending',
      ocr_completed_at DATETIME NULL,
      deleted_at      DATETIME NULL,           -- soft delete
      PRIMARY KEY (id),
      KEY idx_att_entity (entity_type, entity_id),
      KEY idx_att_org    (org_id, uploaded_at),
      KEY idx_att_field  (entity_type, entity_id, field_name),
      KEY idx_att_ocr    (ocr_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS attachments`); } catch (_) {}
}

module.exports = { up, down };
