'use strict';

/**
 * Migration 195 — Case Form Upgrade Drop 1: Safety & Compliance Core (Rohith, 2026-11-16)
 * - Support Split & Link Case architecture via case_relationships and case_links 'split' enum
 * - Add structured dechallenge and rechallenge causality fields to case_ae_events
 * - Add ICH E2B(R3) pregnancy & lactation exposure fields to case_ae_patient_info
 * - Add regulatory clock tracking fields to case_ae_versions
 */

async function addColumn(conn, table, column, definition) {
  try {
    const [cols] = await conn.execute(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
    if (!cols.length) {
      await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  } catch (err) {
    if (!err.message.includes('Duplicate column name')) throw err;
  }
}

async function up(conn) {
  // 1. Expand case_links link_type to include 'split'
  try {
    await conn.execute(`
      ALTER TABLE case_links 
      MODIFY COLUMN link_type ENUM('duplicate','related','follow_up','superseded_by','split') NOT NULL DEFAULT 'related'
    `);
  } catch (err) {
    console.warn('[Migration 195] case_links link_type modify notice:', err.message);
  }

  // 2. Structured case_relationships table for hierarchical parenting
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_relationships (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      parent_case_id INT NOT NULL,
      child_case_id INT NOT NULL,
      relationship_type VARCHAR(32) NOT NULL DEFAULT 'split',
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      notes TEXT NULL,
      INDEX idx_case_rel_parent (parent_case_id),
      INDEX idx_case_rel_child (child_case_id),
      INDEX idx_case_rel_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 3. Add dechallenge & rechallenge structured outcomes to case_ae_events
  await addColumn(conn, 'case_ae_events', 'dechallenge_outcome', "VARCHAR(64) NULL DEFAULT NULL");
  await addColumn(conn, 'case_ae_events', 'rechallenge_outcome', "VARCHAR(64) NULL DEFAULT NULL");

  // 4. Add ICH E2B pregnancy details to case_ae_patient_info
  await addColumn(conn, 'case_ae_patient_info', 'pregnancy_outcome', "VARCHAR(50) NULL DEFAULT NULL");
  await addColumn(conn, 'case_ae_patient_info', 'gestational_age_weeks', "INT NULL DEFAULT NULL");
  await addColumn(conn, 'case_ae_patient_info', 'paternal_exposure', "TINYINT(1) NOT NULL DEFAULT 0");

  // 5. Add regulatory clock cache fields to case_ae_versions
  await addColumn(conn, 'case_ae_versions', 'is_expedited', "TINYINT(1) NOT NULL DEFAULT 0");
  await addColumn(conn, 'case_ae_versions', 'regulatory_clock_type', "VARCHAR(32) NOT NULL DEFAULT 'standard'");
  await addColumn(conn, 'case_ae_versions', 'regulatory_due_date', "DATETIME NULL DEFAULT NULL");
}

async function down(_conn) {}

module.exports = { up, down };
