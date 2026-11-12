'use strict';

/**
 * Migration 192 — Schema support for strategic enhancements:
 * - Two-Way Reporter Dialogue tokens on case_reporter_questions
 * - Real-Time Safety Reconciliation logs (safety_reconciliations)
 * - Multi-case Inspector Export packages (inspector_exports)
 */

async function addColumn(conn, table, column, definition) {
  const [cols] = await conn.execute(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
  if (!cols.length) await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function up(conn) {
  // Feature 3: Two-Way Reporter Dialogue magic link token support
  await addColumn(conn, 'case_reporter_questions', 'token', 'VARCHAR(128) NULL');
  await addColumn(conn, 'case_reporter_questions', 'token_expires_at', 'DATETIME NULL');
  await addColumn(conn, 'case_reporter_questions', 'token_used_at', 'DATETIME NULL');

  // Feature 6: Real-Time Safety Reconciliation audit runs
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS safety_reconciliations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      run_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total_intakes INT NOT NULL DEFAULT 0,
      matched_cases INT NOT NULL DEFAULT 0,
      unlinked_intakes INT NOT NULL DEFAULT 0,
      delayed_cases INT NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'balanced',
      details_json JSON NULL,
      reconciled_by INT NULL,
      INDEX idx_safety_recon_org_run (org_id, run_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Feature 1: Cross-Case Inspector Export audit packages
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS inspector_exports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      user_id INT NOT NULL,
      export_type VARCHAR(32) NOT NULL DEFAULT 'cross_case',
      filter_json JSON NULL,
      case_count INT NOT NULL DEFAULT 0,
      row_count INT NOT NULL DEFAULT 0,
      sha256_hash VARCHAR(64) NOT NULL,
      format VARCHAR(16) NOT NULL DEFAULT 'csv',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_insp_exp_org (org_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(_conn) {}

module.exports = { up, down };
