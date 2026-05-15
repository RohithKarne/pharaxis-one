'use strict';
// Migration 032 — Case productivity features: drafts, links, merges, concurrency.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_drafts (
      id INT NOT NULL AUTO_INCREMENT,
      case_id INT NULL,
      user_id INT NOT NULL,
      org_id INT NOT NULL,
      case_type ENUM('AE','MI','PC') NOT NULL,
      payload_json JSON NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_draft_user_case (user_id, case_id),
      KEY idx_case_drafts_user_case (user_id, case_id),
      KEY idx_case_drafts_user_type (user_id, case_type, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_links (
      id INT NOT NULL AUTO_INCREMENT,
      case_id INT NOT NULL,
      linked_case_id INT NOT NULL,
      link_type ENUM('duplicate','related','follow_up','superseded_by') NOT NULL,
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      notes TEXT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_link (case_id, linked_case_id, link_type),
      KEY idx_case_links_case (case_id),
      KEY idx_case_links_linked (linked_case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  try { await conn.execute(`ALTER TABLE cases ADD COLUMN merged_into_case_id INT NULL`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE cases ADD COLUMN version_stamp BIGINT NOT NULL DEFAULT 0`); } catch (_) {}
  try { await conn.execute(`CREATE INDEX idx_cases_merged_into ON cases(merged_into_case_id)`); } catch (_) {}
}

async function down(conn) {
  try { await conn.execute('DROP TABLE IF EXISTS case_links'); } catch (_) {}
  try { await conn.execute('DROP TABLE IF EXISTS case_drafts'); } catch (_) {}
  try { await conn.execute('DROP INDEX idx_cases_merged_into ON cases'); } catch (_) {}
  try { await conn.execute('ALTER TABLE cases DROP COLUMN version_stamp'); } catch (_) {}
  try { await conn.execute('ALTER TABLE cases DROP COLUMN merged_into_case_id'); } catch (_) {}
}

module.exports = { up, down };
