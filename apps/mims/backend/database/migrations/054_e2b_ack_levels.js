'use strict';
async function up(conn) {
  try { await conn.execute(`ALTER TABLE icsr_reports MODIFY COLUMN status ENUM('draft','validated','submitted','acknowledged','rejected','superseded','accepted_by_ha','rejected_by_ha') NOT NULL DEFAULT 'draft'`); } catch (_) {}
  await conn.execute(`CREATE TABLE IF NOT EXISTS icsr_acknowledgements (
    id BIGINT NOT NULL AUTO_INCREMENT, org_id INT NOT NULL, icsr_report_id BIGINT NOT NULL,
    level ENUM('ACK1','ACK2','ACK3') NOT NULL, received_at DATETIME NULL, ack_status VARCHAR(20) NULL, ack_code VARCHAR(40) NULL,
    ack_xml MEDIUMTEXT NULL, details_json JSON NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_ack_report (icsr_report_id, level), KEY idx_ack_org (org_id, received_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await conn.execute(`INSERT IGNORE INTO feature_flags (flag_key, label, description, wave, theme, default_state, is_strict_mode)
    VALUES ('cf.pv_ack_levels', 'PV — E2B ACK Levels', 'ACK1/ACK2/ACK3 tracking for regulatory submissions.', 'PV', 'PV Compliance', 'off', 1)`).catch(() => {});
}
async function down(conn) { try { await conn.execute('DROP TABLE IF EXISTS icsr_acknowledgements'); } catch (_) {} }
module.exports = { up, down };
