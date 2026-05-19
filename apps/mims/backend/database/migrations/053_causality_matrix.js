'use strict';
async function up(conn) {
  await conn.execute(`CREATE TABLE IF NOT EXISTS case_causality (
    id BIGINT NOT NULL AUTO_INCREMENT, org_id INT NOT NULL, case_id BIGINT NOT NULL, ae_version_id BIGINT NULL,
    suspect_drug_id BIGINT NOT NULL, ae_event_id BIGINT NOT NULL, assessor ENUM('company','reporter') NOT NULL,
    method ENUM('WHO_UMC','Naranjo','Bradford_Hill','Clinical_Judgment') NOT NULL DEFAULT 'WHO_UMC',
    category ENUM('certain','probable','possible','unlikely','conditional','unassessable') NOT NULL,
    narrative TEXT NULL, assessed_by INT NULL, assessed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_case_causality_cell (ae_version_id, suspect_drug_id, ae_event_id, assessor), KEY idx_case_causality_case (org_id, case_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await conn.execute(`INSERT IGNORE INTO feature_flags (flag_key, label, description, wave, theme, default_state, is_strict_mode)
    VALUES ('cf.pv_causality_matrix', 'PV — Causality Matrix', 'Per drug by reaction causality assessment matrix.', 'PV', 'PV Compliance', 'off', 1)`).catch(() => {});
}
async function down(conn) { try { await conn.execute('DROP TABLE IF EXISTS case_causality'); } catch (_) {} }
module.exports = { up, down };
