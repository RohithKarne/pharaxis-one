'use strict';

async function addColumn(conn, table, ddl) { try { await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`); } catch (_) {} }
async function seedFlag(conn, key, label, description, defaultState = 'off') {
  await conn.execute(
    `INSERT IGNORE INTO feature_flags (flag_key, label, description, wave, theme, default_state, is_strict_mode)
     VALUES (?, ?, ?, 'PV', 'PV Compliance', ?, 1)`,
    [key, label, description, defaultState]
  ).catch(() => {});
}

async function up(conn) {
  await addColumn(conn, 'case_ae_versions', 'seriousness_death TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn(conn, 'case_ae_versions', 'seriousness_life_threatening TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn(conn, 'case_ae_versions', 'seriousness_hospitalization TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn(conn, 'case_ae_versions', 'seriousness_disability TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn(conn, 'case_ae_versions', 'seriousness_congenital_anomaly TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn(conn, 'case_ae_versions', 'seriousness_required_intervention TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn(conn, 'case_ae_versions', 'seriousness_other_medically_important TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn(conn, 'case_ae_versions', 'seriousness_lab_abnormality TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn(conn, 'case_ae_versions', `is_serious TINYINT(1) GENERATED ALWAYS AS (
    seriousness_death OR seriousness_life_threatening OR seriousness_hospitalization OR seriousness_disability OR
    seriousness_congenital_anomaly OR seriousness_required_intervention OR seriousness_other_medically_important OR seriousness_lab_abnormality
  ) STORED`);

  await addColumn(conn, 'case_ae_events', 'is_required_intervention TINYINT(1) NOT NULL DEFAULT 0 AFTER is_other_medically_important');
  await addColumn(conn, 'case_ae_events', 'is_lab_abnormality TINYINT(1) NOT NULL DEFAULT 0 AFTER is_required_intervention');
  try { await conn.execute(`ALTER TABLE case_ae_events MODIFY COLUMN outcome ENUM('recovered','recovering','not_recovered','recovered_with_sequelae','fatal','unknown') DEFAULT 'unknown'`); } catch (_) {}
  await seedFlag(conn, 'cf.pv_seriousness_criteria', 'PV — ICH Seriousness Criteria', 'Eight structured ICH E2B seriousness criteria replacing free-text severity.', 'off');
}

async function down(conn) {
  for (const c of ['is_lab_abnormality', 'is_required_intervention']) {
    try { await conn.execute(`ALTER TABLE case_ae_events DROP COLUMN ${c}`); } catch (_) {}
  }
  for (const c of ['is_serious','seriousness_lab_abnormality','seriousness_other_medically_important','seriousness_required_intervention','seriousness_congenital_anomaly','seriousness_disability','seriousness_hospitalization','seriousness_life_threatening','seriousness_death']) {
    try { await conn.execute(`ALTER TABLE case_ae_versions DROP COLUMN ${c}`); } catch (_) {}
  }
}

module.exports = { up, down };
