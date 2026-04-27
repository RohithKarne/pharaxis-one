'use strict';
// Migration 007 — Cases core: cases table + all AE/PC version/tab tables

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cases (
      id                      INT           NOT NULL AUTO_INCREMENT,
      case_number             VARCHAR(100),
      case_type               ENUM('MI','AE','PC') NULL DEFAULT NULL,
      org_id                  INT           NOT NULL,
      site_id                 INT           NOT NULL,
      status_id               INT,
      case_owner_id           INT,
      intake_channel          VARCHAR(50)   NOT NULL DEFAULT 'manual',
      priority                VARCHAR(20)   NOT NULL DEFAULT 'normal',
      date_received           DATE,
      date_of_intake          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      description             TEXT,
      internal_notes          TEXT,
      is_deleted              TINYINT(1)    NOT NULL DEFAULT 0,
      created_by              INT,
      created_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_cases_org (org_id),
      KEY idx_cases_site (site_id),
      KEY idx_cases_status (status_id),
      KEY idx_cases_owner (case_owner_id),
      KEY idx_cases_type (case_type),
      KEY idx_cases_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Make case_type nullable
  await conn.execute(
    `ALTER TABLE cases MODIFY COLUMN case_type ENUM('MI','AE','PC') NULL DEFAULT NULL`
  ).catch(() => {});

  // Sprint 17: case field schema snapshot columns
  for (const sql of [
    `ALTER TABLE cases ADD COLUMN field_schema_version VARCHAR(150) NULL AFTER date_of_intake`,
    `ALTER TABLE cases ADD COLUMN field_schema_snapshot LONGTEXT NULL AFTER field_schema_version`,
    `ALTER TABLE cases ADD COLUMN reporter_schema_version VARCHAR(150) NULL AFTER field_schema_snapshot`,
    `ALTER TABLE cases ADD COLUMN reporter_schema_snapshot LONGTEXT NULL AFTER reporter_schema_version`,
    `ALTER TABLE cases ADD COLUMN patient_schema_version VARCHAR(150) NULL AFTER reporter_schema_snapshot`,
    `ALTER TABLE cases ADD COLUMN patient_schema_snapshot LONGTEXT NULL AFTER patient_schema_version`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  // Deduplicate before enforcing unique case_number per org
  await conn.execute(`
    UPDATE cases c
    JOIN (
      SELECT MIN(id) AS keep_id, org_id, case_number
      FROM cases
      WHERE case_number IS NOT NULL AND case_number <> ''
      GROUP BY org_id, case_number
      HAVING COUNT(*) > 1
    ) d ON c.org_id = d.org_id
       AND c.case_number = d.case_number
       AND c.id <> d.keep_id
    SET c.case_number = NULL
  `);
  try {
    await conn.execute(
      `ALTER TABLE cases ADD UNIQUE KEY uq_cases_org_case_number (org_id, case_number)`
    );
  } catch (e) { if (e.code !== 'ER_DUP_KEYNAME') throw e; }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_contacts (
      id                   INT           NOT NULL AUTO_INCREMENT,
      case_id              INT           NOT NULL,
      contact_id           INT,
      contact_role         VARCHAR(50)   NOT NULL DEFAULT 'reporter',
      do_not_update_master TINYINT(1)    NOT NULL DEFAULT 0,
      is_primary           TINYINT(1)    NOT NULL DEFAULT 0,
      first_name           VARCHAR(100),
      last_name            VARCHAR(100),
      contact_type         VARCHAR(50),
      specialty            VARCHAR(255),
      institution          VARCHAR(255),
      phone                VARCHAR(50),
      email                VARCHAR(255),
      address              TEXT,
      created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_case_contacts_case (case_id),
      KEY idx_case_contacts_contact (contact_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_comments (
      id         INT           NOT NULL AUTO_INCREMENT,
      case_id    INT           NOT NULL,
      user_id    INT           NOT NULL,
      comment    TEXT          NOT NULL,
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_case_comments_case_created (case_id, created_at),
      KEY idx_case_comments_user (user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_mi (
      id                   INT           NOT NULL AUTO_INCREMENT,
      case_id              INT           NOT NULL,
      tab_index            INT           NOT NULL DEFAULT 1,
      mi_category          VARCHAR(255),
      subcategory          VARCHAR(255),
      product_id           INT,
      question_summary     TEXT,
      detailed_question    TEXT,
      response_required_by DATE,
      response_provided    TEXT,
      response_date        DATE,
      response_channel     VARCHAR(100),
      status               VARCHAR(50)   NOT NULL DEFAULT 'Open',
      created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_case_mi_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ae_versions (
      id             INT           NOT NULL AUTO_INCREMENT,
      case_id        INT           NOT NULL,
      version_number INT           NOT NULL DEFAULT 1,
      status         VARCHAR(50)   NOT NULL DEFAULT 'Open',
      is_locked      TINYINT(1)    NOT NULL DEFAULT 0,
      locked_at      DATETIME,
      created_by     INT,
      created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_ae_version (case_id, version_number),
      KEY idx_ae_versions_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ae_general (
      id                      INT           NOT NULL AUTO_INCREMENT,
      version_id              INT           NOT NULL,
      report_type             VARCHAR(100),
      date_of_onset           DATE,
      date_of_report          DATE,
      reporter_awareness_date DATE,
      additional_info         TEXT,
      created_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_ae_general_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ae_events (
      id                           INT           NOT NULL AUTO_INCREMENT,
      version_id                   INT           NOT NULL,
      event_description            TEXT,
      outcome                      VARCHAR(100),
      start_date                   DATE,
      end_date                     DATE,
      is_serious                   TINYINT(1)    NOT NULL DEFAULT 0,
      is_death                     TINYINT(1)    NOT NULL DEFAULT 0,
      is_life_threatening          TINYINT(1)    NOT NULL DEFAULT 0,
      is_hospitalization           TINYINT(1)    NOT NULL DEFAULT 0,
      is_disability                TINYINT(1)    NOT NULL DEFAULT 0,
      is_congenital_anomaly        TINYINT(1)    NOT NULL DEFAULT 0,
      is_other_medically_important TINYINT(1)    NOT NULL DEFAULT 0,
      created_at                   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at                   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ae_events_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ae_patient_info (
      id                  INT           NOT NULL AUTO_INCREMENT,
      version_id          INT           NOT NULL,
      age                 INT,
      age_unit            VARCHAR(20),
      sex                 VARCHAR(20),
      weight_kg           DECIMAL(6,2),
      height_cm           DECIMAL(6,2),
      ethnicity           VARCHAR(100),
      pregnant            TINYINT(1),
      last_menstrual_date DATE,
      additional_info     TEXT,
      created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_ae_patient_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ae_lab_results (
      id           INT           NOT NULL AUTO_INCREMENT,
      version_id   INT           NOT NULL,
      test_name    VARCHAR(255),
      result       VARCHAR(255),
      unit         VARCHAR(100),
      normal_range VARCHAR(100),
      test_date    DATE,
      created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ae_lab_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ae_lab_notes (
      id         INT           NOT NULL AUTO_INCREMENT,
      version_id INT           NOT NULL,
      notes      TEXT,
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_ae_lab_notes_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ae_medical_history (
      id             INT           NOT NULL AUTO_INCREMENT,
      version_id     INT           NOT NULL,
      condition_name VARCHAR(255),
      start_date     DATE,
      end_date       DATE,
      is_ongoing     TINYINT(1)    NOT NULL DEFAULT 0,
      notes          TEXT,
      created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ae_medhist_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ae_medical_notes (
      id         INT           NOT NULL AUTO_INCREMENT,
      version_id INT           NOT NULL,
      notes      TEXT,
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_ae_med_notes_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ae_product_info (
      id             INT           NOT NULL AUTO_INCREMENT,
      version_id     INT           NOT NULL,
      product_id     INT,
      product_name   VARCHAR(255),
      dose           VARCHAR(100),
      dose_unit      VARCHAR(50),
      route_of_admin VARCHAR(100),
      frequency      VARCHAR(100),
      start_date     DATE,
      end_date       DATE,
      indication     VARCHAR(255),
      is_suspect     TINYINT(1)    NOT NULL DEFAULT 1,
      is_concomitant TINYINT(1)    NOT NULL DEFAULT 0,
      created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ae_prodinfo_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ae_flex_fields (
      id         INT           NOT NULL AUTO_INCREMENT,
      version_id INT           NOT NULL,
      ae_flex_1  VARCHAR(500),
      ae_flex_2  VARCHAR(500),
      ae_flex_3  VARCHAR(500),
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_ae_flex_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_pc_versions (
      id             INT           NOT NULL AUTO_INCREMENT,
      case_id        INT           NOT NULL,
      version_number INT           NOT NULL DEFAULT 1,
      status         VARCHAR(50)   NOT NULL DEFAULT 'Open',
      is_locked      TINYINT(1)    NOT NULL DEFAULT 0,
      locked_at      DATETIME,
      created_by     INT,
      created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pc_version (case_id, version_number),
      KEY idx_pc_versions_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_pc_general (
      id                    INT           NOT NULL AUTO_INCREMENT,
      version_id            INT           NOT NULL,
      complaint_description TEXT,
      pc_category           VARCHAR(255),
      date_of_complaint     DATE,
      date_received         DATE,
      severity              VARCHAR(50),
      additional_info       TEXT,
      created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pc_general_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_pc_patient_info (
      id                 INT           NOT NULL AUTO_INCREMENT,
      version_id         INT           NOT NULL,
      age                INT,
      age_unit           VARCHAR(20),
      sex                VARCHAR(20),
      weight_kg          DECIMAL(6,2),
      therapy_start_date DATE,
      therapy_end_date   DATE,
      indication         VARCHAR(255),
      additional_info    TEXT,
      created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pc_patient_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_pc_product_info (
      id                 INT           NOT NULL AUTO_INCREMENT,
      version_id         INT           NOT NULL,
      product_id         INT,
      product_name       VARCHAR(255),
      lot_number         VARCHAR(100),
      expiry_date        DATE,
      quantity_available TINYINT(1)    NOT NULL DEFAULT 0,
      storage_conditions TEXT,
      additional_info    TEXT,
      created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pc_product_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_pc_return_retrieval (
      id                  INT           NOT NULL AUTO_INCREMENT,
      version_id          INT           NOT NULL,
      return_requested    TINYINT(1)    NOT NULL DEFAULT 0,
      return_date         DATE,
      return_method       VARCHAR(100),
      retrieval_requested TINYINT(1)    NOT NULL DEFAULT 0,
      retrieval_date      DATE,
      retrieval_method    VARCHAR(100),
      tracking_number     VARCHAR(100),
      notes               TEXT,
      created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pc_return_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_pc_replacement (
      id                    INT           NOT NULL AUTO_INCREMENT,
      version_id            INT           NOT NULL,
      replacement_requested TINYINT(1)    NOT NULL DEFAULT 0,
      replacement_approved  TINYINT(1)    NOT NULL DEFAULT 0,
      replacement_date      DATE,
      replacement_product   VARCHAR(255),
      quantity              INT,
      notes                 TEXT,
      created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pc_replacement_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_pc_refund_credit (
      id               INT           NOT NULL AUTO_INCREMENT,
      version_id       INT           NOT NULL,
      refund_requested TINYINT(1)    NOT NULL DEFAULT 0,
      refund_approved  TINYINT(1)    NOT NULL DEFAULT 0,
      refund_amount    DECIMAL(10,2),
      credit_requested TINYINT(1)    NOT NULL DEFAULT 0,
      credit_approved  TINYINT(1)    NOT NULL DEFAULT 0,
      credit_amount    DECIMAL(10,2),
      notes            TEXT,
      created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pc_refund_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
