'use strict';
// Migration 042 — Theme 7 Multi-row Grid Sections (Wave 2).
// Adds:
//   - grid_section_templates: reusable row templates (e.g. "5 standard MedDRA codes")
//   - case_grid_rows: generic row container for grid sections. Replaces ad-hoc
//     per-feature tables for new sections; legacy tables (e.g. case_meddra)
//     keep working via wrap-and-migrate.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS grid_section_templates (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NULL,
      section_name  VARCHAR(120) NOT NULL,
      name          VARCHAR(160) NOT NULL,
      description   VARCHAR(500) NULL,
      rows_json     JSON NOT NULL,            -- array of row objects
      created_by    INT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_grid_template (org_id, section_name, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_grid_rows (
      id            BIGINT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      case_id       BIGINT NOT NULL,
      section_name  VARCHAR(120) NOT NULL,    -- 'concomitant_meds', 'meddra_terms', etc.
      row_json      JSON NOT NULL,            -- the row's field values
      sort_order    INT NOT NULL DEFAULT 0,
      archived      TINYINT(1) NOT NULL DEFAULT 0,
      created_by    INT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by    INT NULL,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_grid_case    (case_id, section_name, sort_order),
      KEY idx_grid_section (section_name),
      KEY idx_grid_org     (org_id, section_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS case_grid_rows`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS grid_section_templates`); } catch (_) {}
}

module.exports = { up, down };
