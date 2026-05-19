'use strict';
async function addColumn(conn, ddl) { try { await conn.execute(`ALTER TABLE icsr_reports ADD COLUMN ${ddl}`); } catch (_) {} }
async function up(conn) {
  await addColumn(conn, "submission_type ENUM('initial','followup','amendment','nullification') NOT NULL DEFAULT 'initial'");
  await addColumn(conn, 'parent_submission_id BIGINT NULL');
  await addColumn(conn, 'nullification_reason VARCHAR(500) NULL');
  await addColumn(conn, 'follow_up_number INT NOT NULL DEFAULT 0');
  await conn.execute(`INSERT IGNORE INTO feature_flags (flag_key, label, description, wave, theme, default_state, is_strict_mode)
    VALUES ('cf.pv_icsr_lifecycle', 'PV — ICSR Lifecycle Types', 'Initial, follow-up, amendment, and nullification submission workflows.', 'PV', 'PV Compliance', 'off', 1)`).catch(() => {});
}
async function down(conn) { for (const c of ['follow_up_number','nullification_reason','parent_submission_id','submission_type']) { try { await conn.execute(`ALTER TABLE icsr_reports DROP COLUMN ${c}`); } catch (_) {} } }
module.exports = { up, down };
