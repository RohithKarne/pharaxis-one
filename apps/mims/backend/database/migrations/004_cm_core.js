'use strict';
// Migration 004 — Content Management: folders, documents, modules, reviews, version history, FAQs, merge reports, templates

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_folders (
      id          INT NOT NULL AUTO_INCREMENT,
      name        VARCHAR(255) NOT NULL,
      product_id  INT,
      site_id     INT,
      description TEXT,
      status      VARCHAR(20) NOT NULL DEFAULT 'Active',
      created_by  INT,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cm_folders_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_documents (
      id                  INT NOT NULL AUTO_INCREMENT,
      doc_id              VARCHAR(50),
      folder_id           INT NOT NULL,
      doc_type            VARCHAR(50) NOT NULL DEFAULT 'SRD',
      name                VARCHAR(500) NOT NULL,
      content_html        MEDIUMTEXT,
      file_path           VARCHAR(1000),
      file_name           VARCHAR(500),
      file_size           INT,
      file_mime           VARCHAR(100),
      status              VARCHAR(50) NOT NULL DEFAULT 'Draft',
      version_major       INT NOT NULL DEFAULT 1,
      version_minor       INT NOT NULL DEFAULT 0,
      checked_out_by      INT,
      checked_out_at      DATETIME,
      expiry_date         DATE,
      activation_date     DATE,
      language            VARCHAR(20) NOT NULL DEFAULT 'en',
      is_product_specific TINYINT(1) NOT NULL DEFAULT 0,
      is_site_specific    TINYINT(1) NOT NULL DEFAULT 0,
      search_tags         TEXT,
      usage_instructions  TEXT,
      attributes          JSON,
      created_by          INT NOT NULL,
      updated_by          INT,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      vault_source_id     VARCHAR(100) DEFAULT NULL,
      vault_source_status VARCHAR(50) DEFAULT NULL,
      expiry_alert_recipients JSON NULL,
      checkout_expires_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_cm_docs_folder (folder_id),
      KEY idx_cm_docs_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const sql of [
    `ALTER TABLE cm_documents ADD COLUMN expiry_alert_recipients JSON NULL`,
    `ALTER TABLE cm_documents ADD COLUMN checkout_expires_at DATETIME NULL`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_modules (
      id                  INT NOT NULL AUTO_INCREMENT,
      module_id           VARCHAR(50),
      folder_id           INT NOT NULL,
      module_type         VARCHAR(50) NOT NULL DEFAULT 'SRD',
      name                VARCHAR(500) NOT NULL,
      content_html        MEDIUMTEXT,
      file_path           VARCHAR(1000),
      file_name           VARCHAR(500),
      file_size           INT,
      file_mime           VARCHAR(100),
      status              VARCHAR(50) NOT NULL DEFAULT 'Draft',
      version_major       INT NOT NULL DEFAULT 1,
      version_minor       INT NOT NULL DEFAULT 0,
      checked_out_by      INT,
      checked_out_at      DATETIME,
      expiry_date         DATE,
      activation_date     DATE,
      language            VARCHAR(20) NOT NULL DEFAULT 'en',
      search_tags         TEXT,
      usage_instructions  TEXT,
      document_category   VARCHAR(255),
      standard_response_text TEXT,
      publish_as_pdf      TINYINT(1) NOT NULL DEFAULT 0,
      send_as_pdf         TINYINT(1) NOT NULL DEFAULT 0,
      attributes          JSON,
      owner_user_id       INT,
      created_by          INT NOT NULL,
      updated_by          INT,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_cm_modules_folder (folder_id),
      KEY idx_cm_modules_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_reviews (
      id                INT NOT NULL AUTO_INCREMENT,
      doc_id            INT NOT NULL,
      doc_type          VARCHAR(20) NOT NULL DEFAULT 'document',
      title             VARCHAR(500) NOT NULL,
      planned_end_date  DATE NOT NULL,
      is_non_amendable  TINYINT(1) NOT NULL DEFAULT 0,
      description       TEXT,
      status            VARCHAR(50) NOT NULL DEFAULT 'Open',
      created_by        INT NOT NULL,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_cm_reviews_doc (doc_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_reviewers (
      id          INT NOT NULL AUTO_INCREMENT,
      review_id   INT NOT NULL,
      user_id     INT NOT NULL,
      status      VARCHAR(50) NOT NULL DEFAULT 'Ongoing',
      reason      TEXT,
      reviewed_at DATETIME,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_review_user (review_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_version_history (
      id          INT NOT NULL AUTO_INCREMENT,
      entity_type VARCHAR(30) NOT NULL,
      entity_id   INT NOT NULL,
      version     VARCHAR(20) NOT NULL,
      status      VARCHAR(50) NOT NULL,
      notes       TEXT,
      author_id   INT,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_cm_ver_entity (entity_type, entity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_faqs (
      id                  INT NOT NULL AUTO_INCREMENT,
      folder_id           INT NOT NULL,
      question            TEXT NOT NULL,
      answer_html         MEDIUMTEXT,
      category            VARCHAR(255),
      approval_required   TINYINT(1) NOT NULL DEFAULT 1,
      status              VARCHAR(50) NOT NULL DEFAULT 'Draft',
      version_major       INT NOT NULL DEFAULT 1,
      version_minor       INT NOT NULL DEFAULT 0,
      checked_out_by      INT,
      checked_out_at      DATETIME,
      expiry_date         DATE,
      created_by          INT NOT NULL,
      updated_by          INT,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_cm_faqs_folder (folder_id),
      KEY idx_cm_faqs_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_merge_reports (
      id             INT NOT NULL AUTO_INCREMENT,
      folder_id      INT NOT NULL,
      name           VARCHAR(500) NOT NULL,
      content_html   MEDIUMTEXT,
      file_path      VARCHAR(1000),
      status         VARCHAR(50) NOT NULL DEFAULT 'Draft',
      version_major  INT NOT NULL DEFAULT 1,
      version_minor  INT NOT NULL DEFAULT 0,
      checked_out_by INT,
      checked_out_at DATETIME,
      created_by     INT NOT NULL,
      updated_by     INT,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_cm_mr_folder (folder_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const sql of [
    `ALTER TABLE cm_merge_reports ADD COLUMN generated_html MEDIUMTEXT`,
    `ALTER TABLE cm_merge_reports ADD COLUMN generated_at DATETIME`,
    `ALTER TABLE cm_merge_reports ADD COLUMN generated_for_case INT`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_templates (
      id         INT NOT NULL AUTO_INCREMENT,
      type       VARCHAR(50) NOT NULL DEFAULT 'Response',
      name       VARCHAR(500) NOT NULL,
      subject    VARCHAR(500),
      body_html  MEDIUMTEXT,
      status     VARCHAR(20) NOT NULL DEFAULT 'Active',
      created_by INT NOT NULL,
      updated_by INT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const sql of [
    `ALTER TABLE cm_templates ADD COLUMN version_major INT NOT NULL DEFAULT 1`,
    `ALTER TABLE cm_templates ADD COLUMN version_minor INT NOT NULL DEFAULT 0`,
    `ALTER TABLE cm_templates ADD COLUMN version_notes TEXT`,
  ]) { try { await conn.execute(sql); } catch (_) {} }
}

module.exports = { up };
