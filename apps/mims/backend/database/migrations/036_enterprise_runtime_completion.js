'use strict';
// Migration 036 — runtime completion tables for PV reports, AI jobs, API/webhook execution, and workflow hooks.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS pv_periodic_reports (
      id INT NOT NULL AUTO_INCREMENT,
      org_id INT NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      report_type ENUM('PSUR','DSUR') NOT NULL DEFAULT 'PSUR',
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      summary_json JSON NULL,
      status ENUM('draft','review','approved','exported') NOT NULL DEFAULT 'draft',
      created_by INT NULL,
      approved_by INT NULL,
      approved_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_pv_periodic_org_product (org_id, product_name, report_type, period_start)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS pv_signal_reviews (
      id INT NOT NULL AUTO_INCREMENT,
      org_id INT NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      reaction_term VARCHAR(255) NOT NULL,
      prr DECIMAL(12,4) NOT NULL DEFAULT 0,
      ror DECIMAL(12,4) NOT NULL DEFAULT 0,
      case_count INT NOT NULL DEFAULT 0,
      status ENUM('new','in_review','closed','escalated') NOT NULL DEFAULT 'new',
      underlying_case_ids JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_pv_signal_org_status (org_id, status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS workflow_event_hooks (
      id INT NOT NULL AUTO_INCREMENT,
      definition_id INT NOT NULL,
      org_id INT NOT NULL,
      event_name VARCHAR(100) NOT NULL,
      entity_type VARCHAR(60) NOT NULL DEFAULT 'case',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_workflow_hooks_event (org_id, event_name, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS api_sdk_downloads (
      id INT NOT NULL AUTO_INCREMENT,
      client_id INT NULL,
      sdk_language ENUM('node','python','java') NOT NULL,
      downloaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_api_sdk_client (client_id, downloaded_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  try { await conn.execute(`ALTER TABLE icsr_reports ADD COLUMN gateway_message_id VARCHAR(120) NULL`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE icsr_reports ADD COLUMN ack_error_summary TEXT NULL`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE inquiries ADD COLUMN ai_classified_at DATETIME NULL`); } catch (_) {}
}

async function down(conn) {
  try { await conn.execute(`ALTER TABLE inquiries DROP COLUMN ai_classified_at`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE icsr_reports DROP COLUMN ack_error_summary`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE icsr_reports DROP COLUMN gateway_message_id`); } catch (_) {}
  for (const table of ['api_sdk_downloads','workflow_event_hooks','pv_signal_reviews','pv_periodic_reports']) {
    try { await conn.execute(`DROP TABLE IF EXISTS ${table}`); } catch (_) {}
  }
}

module.exports = { up, down };
