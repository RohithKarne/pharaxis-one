'use strict';
// Migration 012 — CM advanced: MI categories, document attachments, phase 2/4 alters,
//                relations, alert subs, org settings, CM picklists, Sprint 15 tables + indexes

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS mi_categories (
      id         INT NOT NULL AUTO_INCREMENT,
      org_id     INT NOT NULL,
      name       VARCHAR(255) NOT NULL,
      description TEXT,
      is_active  TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_by INT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_mi_categories_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_document_attachments (
      id          INT NOT NULL AUTO_INCREMENT,
      document_id INT NOT NULL,
      file_path   VARCHAR(1000) NOT NULL,
      file_name   VARCHAR(500) NOT NULL,
      file_size   INT,
      file_mime   VARCHAR(100),
      uploaded_by INT,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_cm_doc_attachments_doc (document_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // CM Phase 2: cm_documents additional columns
  for (const sql of [
    `ALTER TABLE cm_documents ADD COLUMN response_doc_type VARCHAR(50) DEFAULT 'File'`,
    `ALTER TABLE cm_documents ADD COLUMN publish_as_pdf TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE cm_documents ADD COLUMN send_as_pdf TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE cm_documents ADD COLUMN selected_modules JSON`,
    `ALTER TABLE cm_documents ADD COLUMN mi_category_id INT`,
    `ALTER TABLE cm_documents ADD COLUMN document_category VARCHAR(255)`,
    `ALTER TABLE cm_documents ADD COLUMN standard_response_text TEXT`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  // CM Phase 4: cm_documents ownership + review cycle columns
  for (const sql of [
    `ALTER TABLE cm_documents ADD COLUMN owner_user_id INT`,
    `ALTER TABLE cm_documents ADD COLUMN review_cycle_days INT`,
    `ALTER TABLE cm_documents ADD COLUMN regulatory_ref VARCHAR(255)`,
    `ALTER TABLE cm_documents ADD COLUMN custom_attributes JSON`,
    `ALTER TABLE cm_documents ADD COLUMN version_notes TEXT`,
    `ALTER TABLE cm_documents ADD COLUMN alert_days JSON`,
    `ALTER TABLE cm_documents ADD COLUMN alert_email_account_id INT`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  // CM modules additional columns (Phase 2)
  for (const sql of [
    `ALTER TABLE cm_modules ADD COLUMN module_id VARCHAR(50)`,
    `ALTER TABLE cm_modules ADD COLUMN activation_date DATE`,
    `ALTER TABLE cm_modules ADD COLUMN expiry_date DATE`,
    `ALTER TABLE cm_modules ADD COLUMN language VARCHAR(20) NOT NULL DEFAULT 'en'`,
    `ALTER TABLE cm_modules ADD COLUMN search_tags TEXT`,
    `ALTER TABLE cm_modules ADD COLUMN usage_instructions TEXT`,
    `ALTER TABLE cm_modules ADD COLUMN document_category VARCHAR(255)`,
    `ALTER TABLE cm_modules ADD COLUMN standard_response_text TEXT`,
    `ALTER TABLE cm_modules ADD COLUMN publish_as_pdf TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE cm_modules ADD COLUMN send_as_pdf TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE cm_modules ADD COLUMN attributes JSON`,
    `ALTER TABLE cm_modules ADD COLUMN owner_user_id INT`,
    `ALTER TABLE cm_modules ADD COLUMN updated_by INT`,
    `ALTER TABLE cm_modules ADD COLUMN checked_out_by INT`,
    `ALTER TABLE cm_modules ADD COLUMN checked_out_at DATETIME`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_document_relations (
      id             INT NOT NULL AUTO_INCREMENT,
      doc_id         INT NOT NULL,
      related_doc_id INT NOT NULL,
      relation_type  VARCHAR(50) NOT NULL DEFAULT 'Supports',
      created_by     INT,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_cm_doc_relations_doc (doc_id),
      KEY idx_cm_doc_relations_related (related_doc_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_document_alert_subs (
      id          INT NOT NULL AUTO_INCREMENT,
      document_id INT NOT NULL,
      user_id     INT NOT NULL,
      created_by  INT,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_alert_sub (document_id, user_id),
      KEY idx_cm_alert_subs_doc (document_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_org_settings (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      setting_key   VARCHAR(100) NOT NULL,
      setting_value JSON,
      updated_by    INT,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cm_org_setting (org_id, setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_picklists (
      id         INT NOT NULL AUTO_INCREMENT,
      org_id     INT NOT NULL,
      field_type VARCHAR(100) NOT NULL,
      value      VARCHAR(500) NOT NULL,
      label      VARCHAR(500) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active  TINYINT(1) NOT NULL DEFAULT 1,
      created_by INT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_cm_picklists_org_type (org_id, field_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_content_usage (
      id           INT NOT NULL AUTO_INCREMENT,
      content_type ENUM('document','faq','module') NOT NULL,
      content_id   INT NOT NULL,
      case_id      INT NOT NULL,
      response_id  INT,
      used_by      INT NOT NULL,
      used_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ccu_content (content_type, content_id),
      KEY idx_ccu_case (case_id),
      KEY idx_ccu_response (response_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Sprint 15: CM tables
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_folder_permissions (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      folder_id         INT NOT NULL,
      security_group_id INT NOT NULL,
      permission_level  VARCHAR(50) NOT NULL DEFAULT 'read',
      created_by        INT NULL,
      created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_folder_group (folder_id, security_group_id),
      INDEX idx_folder_id (folder_id)
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_document_activity_log (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      doc_id     INT NOT NULL,
      user_id    INT NULL,
      user_name  VARCHAR(255) NULL,
      action     VARCHAR(100) NOT NULL,
      details    JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_doc_id (doc_id),
      INDEX idx_created_at (created_at)
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_browse_bookmarks (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id   INT NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_entity (user_id, entity_type, entity_id),
      INDEX idx_user_id (user_id)
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_review_config (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      doc_id      INT NOT NULL UNIQUE,
      review_mode VARCHAR(20) NOT NULL DEFAULT 'sequential',
      updated_by  INT NULL,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Sprint 15 performance indexes
  try { await conn.execute(`ALTER TABLE audit_logs ADD INDEX idx_entity_entity_id_created (entity, entity_id, created_at)`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE cm_documents ADD FULLTEXT INDEX ft_doc_search (name, content_html)`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE cm_faqs ADD INDEX idx_status_category (status, category)`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE cm_faqs ADD COLUMN search_tags TEXT`); } catch (_) {}
}

module.exports = { up };
