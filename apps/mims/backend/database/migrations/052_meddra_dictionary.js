'use strict';

async function seedFlag(conn, key, label, description, defaultState = 'off') {
  await conn.execute(
    `INSERT IGNORE INTO feature_flags (flag_key, label, description, wave, theme, default_state, is_strict_mode)
     VALUES (?, ?, ?, 'PV', 'PV Compliance', ?, 1)`,
    [key, label, description, defaultState]
  ).catch(() => {});
}

async function up(conn) {
  await conn.execute(`CREATE TABLE IF NOT EXISTS meddra_versions (
    id INT NOT NULL AUTO_INCREMENT, version VARCHAR(10) NOT NULL, released_at DATE NULL, is_active TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY uq_meddra_version (version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS meddra_terms (
    id BIGINT NOT NULL AUTO_INCREMENT, version_id INT NOT NULL, level ENUM('SOC','HLGT','HLT','PT','LLT') NOT NULL,
    code VARCHAR(20) NOT NULL, term VARCHAR(255) NOT NULL, parent_id BIGINT NULL, llt_currency TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), KEY idx_term_text (level, term(50)), KEY idx_meddra_parent (parent_id), UNIQUE KEY uq_meddra_term (version_id, code, level)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  try { await conn.execute('ALTER TABLE meddra_terms ADD FULLTEXT KEY ft_term (term)'); } catch (_) {}
  await conn.execute(`CREATE TABLE IF NOT EXISTS case_meddra_codes (
    id BIGINT NOT NULL AUTO_INCREMENT, org_id INT NOT NULL, case_id BIGINT NOT NULL, ae_event_id BIGINT NULL,
    verbatim_text TEXT NULL, suggested_term_id BIGINT NULL, approved_term_id BIGINT NULL, approved_by INT NULL, approved_at DATETIME NULL,
    level ENUM('PT','LLT') NOT NULL DEFAULT 'PT', is_company_preferred TINYINT(1) NOT NULL DEFAULT 0, recoded_from_id BIGINT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_case_meddra_case (org_id, case_id), KEY idx_case_meddra_event (ae_event_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await seedFlag(conn, 'cf.pv_meddra_coding', 'PV — MedDRA Coding', 'MedDRA PT/LLT coding and approval workflow for AE reactions.', 'off');
}

async function down(conn) {
  try { await conn.execute('DROP TABLE IF EXISTS case_meddra_codes'); } catch (_) {}
  try { await conn.execute('DROP TABLE IF EXISTS meddra_terms'); } catch (_) {}
  try { await conn.execute('DROP TABLE IF EXISTS meddra_versions'); } catch (_) {}
}
module.exports = { up, down };
