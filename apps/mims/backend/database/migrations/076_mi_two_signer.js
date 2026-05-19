'use strict';
// Migration 076 — Sprint 2 #17: Two-signer MI approval.
//
// Off-label / scientific medical-information responses often need two separate
// signatures: a Medical Reviewer (technical correctness) and a Compliance
// Approver (off-label promotion / 21 CFR Part 11 sign-off). Today MI responses
// support a single e-sign; this migration adds dedicated columns for reviewer
// and approver, plus a config flag on the org indicating when two-signer is
// mandatory (e.g. for off-label answers).

async function up(conn) {
  // Add reviewer/approver columns to case_mi_responses.
  const cols = [
    `ALTER TABLE case_mi_responses ADD COLUMN reviewer_id INT NULL`,
    `ALTER TABLE case_mi_responses ADD COLUMN reviewer_name VARCHAR(160) NULL`,
    `ALTER TABLE case_mi_responses ADD COLUMN reviewed_at DATETIME NULL`,
    `ALTER TABLE case_mi_responses ADD COLUMN reviewer_reason VARCHAR(500) NULL`,
    `ALTER TABLE case_mi_responses ADD COLUMN reviewer_signature_hash CHAR(64) NULL`,
    `ALTER TABLE case_mi_responses ADD COLUMN approver_id INT NULL`,
    `ALTER TABLE case_mi_responses ADD COLUMN approver_name VARCHAR(160) NULL`,
    `ALTER TABLE case_mi_responses ADD COLUMN approved_at DATETIME NULL`,
    `ALTER TABLE case_mi_responses ADD COLUMN approver_reason VARCHAR(500) NULL`,
    `ALTER TABLE case_mi_responses ADD COLUMN approver_signature_hash CHAR(64) NULL`,
    `ALTER TABLE case_mi_responses ADD COLUMN requires_two_signers TINYINT(1) NOT NULL DEFAULT 0`,
  ];
  for (const sql of cols) { try { await conn.execute(sql); } catch (_) {} }

  // Per-org config: when to require two-signer
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS mi_two_signer_rules (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NULL,
      condition_type ENUM('off_label','high_risk_drug','study_case','always','manual_only') NOT NULL,
      condition_value VARCHAR(160) NULL,         -- e.g. drug name when high_risk_drug
      requires_approver_role VARCHAR(40) NULL,   -- e.g. 'medical_director','qppv'
      is_active     TINYINT(1) NOT NULL DEFAULT 1,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_mi_two_signer (org_id, condition_type, condition_value)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Seed: by default, off-label MI responses require two signers globally.
  await conn.execute(
    `INSERT IGNORE INTO mi_two_signer_rules
       (org_id, condition_type, requires_approver_role)
     VALUES (NULL, 'off_label', 'medical_director')`
  );
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS mi_two_signer_rules`); } catch (_) {}
  for (const c of [
    'reviewer_id','reviewer_name','reviewed_at','reviewer_reason','reviewer_signature_hash',
    'approver_id','approver_name','approved_at','approver_reason','approver_signature_hash',
    'requires_two_signers',
  ]) {
    try { await conn.execute(`ALTER TABLE case_mi_responses DROP COLUMN ${c}`); } catch (_) {}
  }
}

module.exports = { up, down };
