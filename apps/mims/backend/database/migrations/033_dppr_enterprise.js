'use strict';
// Migration 033 — Enterprise DPPR, RTBF, consent, portability support.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS rtbf_requests (
      id INT NOT NULL AUTO_INCREMENT,
      org_id INT NOT NULL,
      subject_type ENUM('patient','contact','reporter','user') NOT NULL,
      subject_identifier VARCHAR(255) NOT NULL,
      requester_name VARCHAR(255) NULL,
      requester_email VARCHAR(255) NULL,
      legal_basis VARCHAR(255) NULL,
      status ENUM('intake','under_review','approved','rejected','executing','completed','revoked') NOT NULL DEFAULT 'intake',
      reviewer_id INT NULL,
      review_notes TEXT NULL,
      review_at DATETIME NULL,
      executed_at DATETIME NULL,
      certificate_path VARCHAR(500) NULL,
      affected_record_summary JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_rtbf_org_status_created (org_id, status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS consent_records (
      id INT NOT NULL AUTO_INCREMENT,
      org_id INT NOT NULL,
      subject_identifier VARCHAR(255) NOT NULL,
      consent_type ENUM('processing','marketing','data_sharing','dnumd') NOT NULL,
      status ENUM('granted','withdrawn','expired') NOT NULL DEFAULT 'granted',
      granted_at DATETIME NULL,
      withdrawn_at DATETIME NULL,
      expires_at DATETIME NULL,
      evidence_url VARCHAR(500) NULL,
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_consent_org_subject (org_id, subject_identifier),
      KEY idx_consent_status (org_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  try { await conn.execute(`ALTER TABLE dppr_rules ADD COLUMN template_region VARCHAR(20) NULL`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE dppr_rules ADD COLUMN consent_trigger_id INT NULL`); } catch (_) {}
}

async function down(conn) {
  try { await conn.execute('DROP TABLE IF EXISTS consent_records'); } catch (_) {}
  try { await conn.execute('DROP TABLE IF EXISTS rtbf_requests'); } catch (_) {}
  try { await conn.execute('ALTER TABLE dppr_rules DROP COLUMN consent_trigger_id'); } catch (_) {}
  try { await conn.execute('ALTER TABLE dppr_rules DROP COLUMN template_region'); } catch (_) {}
}

module.exports = { up, down };
