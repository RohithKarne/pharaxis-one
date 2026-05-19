'use strict';

async function addColumn(conn, table, ddl) { try { await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`); } catch (_) {} }
async function addIndex(conn, table, ddl) { try { await conn.execute(`ALTER TABLE ${table} ADD ${ddl}`); } catch (_) {} }
async function seedFlag(conn, key, label, description, defaultState = 'off') {
  await conn.execute(
    `INSERT IGNORE INTO feature_flags (flag_key, label, description, wave, theme, default_state, is_strict_mode)
     VALUES (?, ?, ?, 'PV', 'PV Compliance', ?, 1)`,
    [key, label, description, defaultState]
  ).catch(() => {});
}

async function up(conn) {
  await addColumn(conn, 'cases', 'awareness_date DATETIME NULL AFTER date_received');
  await addColumn(conn, 'cases', 'learn_of_validity_date DATETIME NULL AFTER awareness_date');
  await addColumn(conn, 'cases', 'follow_up_received_date DATETIME NULL AFTER learn_of_validity_date');

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS health_authorities (
      id INT NOT NULL AUTO_INCREMENT,
      code VARCHAR(20) NOT NULL,
      name VARCHAR(120) NOT NULL,
      submission_window_days INT NOT NULL DEFAULT 15,
      reporting_basis VARCHAR(40) NOT NULL DEFAULT 'awareness',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_health_authority_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const authorities = [
    ['FDA', 'US FDA'], ['EMA', 'European Medicines Agency'], ['PMDA', 'PMDA Japan'],
    ['MHRA', 'MHRA United Kingdom'], ['HC', 'Health Canada'], ['ANSM', 'ANSM France'],
    ['TGA', 'Therapeutic Goods Administration'], ['SWISSMED', 'Swissmedic'],
    ['HSA', 'Health Sciences Authority Singapore'], ['MFDS', 'MFDS Korea'], ['CDSCO', 'CDSCO India'],
  ];
  for (const [code, name] of authorities) {
    await conn.execute(
      `INSERT IGNORE INTO health_authorities (code, name, submission_window_days, reporting_basis, is_active)
       VALUES (?, ?, 15, 'awareness', 1)`,
      [code, name]
    );
  }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ha_clocks (
      id BIGINT NOT NULL AUTO_INCREMENT,
      org_id INT NOT NULL,
      case_id BIGINT NOT NULL,
      ha_code VARCHAR(20) NOT NULL,
      clock_start_at DATETIME NULL,
      due_at DATETIME NULL,
      is_expedited TINYINT(1) NOT NULL DEFAULT 0,
      satisfied_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_ha_clock (case_id, ha_code),
      KEY idx_case_ha_clock_org_case (org_id, case_id),
      KEY idx_case_ha_clock_due (due_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addIndex(conn, 'case_ha_clocks', 'INDEX idx_case_ha_clock_case (case_id)');
  await seedFlag(conn, 'cf.pv_ha_clocks', 'PV — Health Authority Clocks', 'Per-health-authority expedited reporting clocks from awareness date.', 'off');
  await seedFlag(conn, 'cf.pv_case_validity', 'PV — Case Validity Panel', 'ICH four-element validity panel on the case form and ICSR submission guard.', 'on');
}

async function down(conn) {
  try { await conn.execute('DROP TABLE IF EXISTS case_ha_clocks'); } catch (_) {}
  try { await conn.execute('DROP TABLE IF EXISTS health_authorities'); } catch (_) {}
  for (const c of ['follow_up_received_date', 'learn_of_validity_date', 'awareness_date']) {
    try { await conn.execute(`ALTER TABLE cases DROP COLUMN ${c}`); } catch (_) {}
  }
}

module.exports = { up, down };
