'use strict';
async function addColumn(conn, ddl) { try { await conn.execute(`ALTER TABLE case_mi ADD COLUMN ${ddl}`); } catch (_) {} }
async function up(conn) {
  await addColumn(conn, 'converted_to_case_id BIGINT NULL');
  await addColumn(conn, "converted_to_type ENUM('ae','pc') NULL");
  await addColumn(conn, 'converted_at DATETIME NULL');
  await addColumn(conn, 'converted_by INT NULL');
  await conn.execute(`INSERT IGNORE INTO feature_flags (flag_key, label, description, wave, theme, default_state, is_strict_mode)
    VALUES ('cf.pv_mi_conversion', 'PV — MI Conversion', 'Convert MI inquiries into AE or PC cases with audit link-back.', 'PV', 'PV Compliance', 'off', 1)`).catch(() => {});
}
async function down(conn) { for (const c of ['converted_by','converted_at','converted_to_type','converted_to_case_id']) { try { await conn.execute(`ALTER TABLE case_mi DROP COLUMN ${c}`); } catch (_) {} } }
module.exports = { up, down };
