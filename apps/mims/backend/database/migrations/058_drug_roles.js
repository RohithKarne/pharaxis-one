'use strict';
async function up(conn) {
  await conn.execute(`CREATE TABLE IF NOT EXISTS case_drugs (
    id BIGINT NOT NULL AUTO_INCREMENT, org_id INT NOT NULL, case_id BIGINT NOT NULL, ae_version_id BIGINT NULL,
    product_id BIGINT NULL, drug_name_verbatim VARCHAR(300) NULL, whodrug_code VARCHAR(40) NULL,
    role ENUM('suspect','co_suspect','concomitant','interacting') NOT NULL,
    dose_amount DECIMAL(10,4) NULL, dose_unit VARCHAR(20) NULL, route_of_administration VARCHAR(60) NULL,
    indication VARCHAR(255) NULL, start_date DATE NULL, end_date DATE NULL,
    action_taken ENUM('drug_withdrawn','dose_reduced','dose_increased','dose_not_changed','unknown','not_applicable') NULL,
    drug_reaction_recurrence ENUM('yes','no','unknown') NULL, lot_number VARCHAR(60) NULL,
    created_by INT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_case_drug (case_id, role), KEY idx_case_drug_org (org_id, case_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await conn.execute(`INSERT IGNORE INTO feature_flags (flag_key, label, description, wave, theme, default_state, is_strict_mode)
    VALUES ('cf.pv_drug_roles', 'PV — Drug Roles', 'Multi-drug AE capture with suspect/co-suspect/concomitant/interacting roles.', 'PV', 'PV Compliance', 'off', 1)`).catch(() => {});
}
async function down(conn) { try { await conn.execute('DROP TABLE IF EXISTS case_drugs'); } catch (_) {} }
module.exports = { up, down };
