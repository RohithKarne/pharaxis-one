'use strict';
// Migration 003 — Picklists, field_setup, security groups, workflow, case numbering, products, contacts

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS picklists (
      id          INT NOT NULL AUTO_INCREMENT,
      name        VARCHAR(100) NOT NULL,
      category    VARCHAR(100) NOT NULL DEFAULT 'General',
      field_type  VARCHAR(100) NOT NULL,
      field_id    INT,
      value       VARCHAR(255) NOT NULL,
      description TEXT,
      status      VARCHAR(20) NOT NULL DEFAULT 'Active',
      effective_from DATE NULL,
      effective_to   DATE NULL,
      governance_note VARCHAR(255) NULL,
      org_id      INT,
      created_by  INT,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_picklists_status (status),
      KEY idx_picklists_field_id (field_id),
      KEY idx_picklists_effective_window (field_id, status, effective_from, effective_to)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const picklistAlters = [
    `ALTER TABLE picklists ADD COLUMN category VARCHAR(100) NOT NULL DEFAULT 'General' AFTER name`,
    `ALTER TABLE picklists ADD COLUMN org_id INT`,
    `ALTER TABLE picklists ADD COLUMN field_id INT AFTER field_type`,
    `ALTER TABLE picklists ADD KEY idx_picklists_field_id (field_id)`,
    `ALTER TABLE picklists ADD COLUMN effective_from DATE NULL AFTER status`,
    `ALTER TABLE picklists ADD COLUMN effective_to DATE NULL AFTER effective_from`,
    `ALTER TABLE picklists ADD COLUMN governance_note VARCHAR(255) NULL AFTER effective_to`,
    `ALTER TABLE picklists ADD KEY idx_picklists_effective_window (field_id, status, effective_from, effective_to)`,
  ];
  for (const sql of picklistAlters) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS picklist_categories (
      id          INT NOT NULL AUTO_INCREMENT,
      org_id      INT NOT NULL DEFAULT 0,
      name        VARCHAR(100) NOT NULL,
      is_active   TINYINT(1) NOT NULL DEFAULT 1,
      sort_order  INT NOT NULL DEFAULT 0,
      created_by  INT,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_picklist_categories_org_name (org_id, name),
      KEY idx_picklist_categories_org (org_id),
      KEY idx_picklist_categories_status (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS picklist_fields (
      id                INT NOT NULL AUTO_INCREMENT,
      org_id            INT NOT NULL DEFAULT 0,
      category_id       INT NOT NULL,
      name              VARCHAR(100) NOT NULL,
      legacy_field_type VARCHAR(100),
      is_active         TINYINT(1) NOT NULL DEFAULT 1,
      sort_order        INT NOT NULL DEFAULT 0,
      created_by        INT,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_picklist_fields_org_category_name (org_id, category_id, name),
      KEY idx_picklist_fields_category (category_id),
      KEY idx_picklist_fields_status (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Backfill picklist category/field hierarchy
  await conn.execute(`
    INSERT INTO picklist_categories (org_id, name, is_active, sort_order)
    SELECT DISTINCT COALESCE(p.org_id, 0), COALESCE(NULLIF(TRIM(p.category), ''), 'General'), 1, 0
    FROM picklists p
    LEFT JOIN picklist_categories c ON c.org_id = COALESCE(p.org_id, 0) AND c.name = COALESCE(NULLIF(TRIM(p.category), ''), 'General')
    WHERE c.id IS NULL
  `);
  await conn.execute(`
    INSERT INTO picklist_fields (org_id, category_id, name, legacy_field_type, is_active, sort_order)
    SELECT DISTINCT COALESCE(p.org_id, 0), c.id,
      COALESCE(NULLIF(TRIM(p.field_type), ''), 'General'),
      COALESCE(NULLIF(TRIM(p.field_type), ''), 'General'), 1, 0
    FROM picklists p
    INNER JOIN picklist_categories c ON c.org_id = COALESCE(p.org_id, 0) AND c.name = COALESCE(NULLIF(TRIM(p.category), ''), 'General')
    LEFT JOIN picklist_fields f ON f.org_id = COALESCE(p.org_id, 0) AND f.category_id = c.id AND f.name = COALESCE(NULLIF(TRIM(p.field_type), ''), 'General')
    WHERE f.id IS NULL
  `);
  await conn.execute(`
    UPDATE picklists p
    INNER JOIN picklist_categories c ON c.org_id = COALESCE(p.org_id, 0) AND c.name = COALESCE(NULLIF(TRIM(p.category), ''), 'General')
    INNER JOIN picklist_fields f ON f.org_id = COALESCE(p.org_id, 0) AND f.category_id = c.id AND f.name = COALESCE(NULLIF(TRIM(p.field_type), ''), 'General')
    SET p.field_id = f.id WHERE p.field_id IS NULL
  `);
  try { await conn.execute(`ALTER TABLE picklists DROP INDEX uq_picklist_field_value`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE picklists ADD UNIQUE KEY uq_picklists_field_id_value (field_id, value)`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE picklists ADD CONSTRAINT fk_picklists_field_id FOREIGN KEY (field_id) REFERENCES picklist_fields(id) ON DELETE SET NULL`); } catch (_) {}

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS field_setup (
      id               INT NOT NULL AUTO_INCREMENT,
      section_name     VARCHAR(100) NOT NULL,
      field_name       VARCHAR(100) NOT NULL,
      field_type       VARCHAR(50) NOT NULL DEFAULT 'text',
      is_required      TINYINT(1) NOT NULL DEFAULT 0,
      is_hidden        TINYINT(1) NOT NULL DEFAULT 0,
      is_disabled      TINYINT(1) NOT NULL DEFAULT 0,
      custom_label     VARCHAR(255),
      help_text        TEXT,
      picklist_type    VARCHAR(100),
      lookup_target    VARCHAR(100),
      do_not_update_master TINYINT(1) NOT NULL DEFAULT 0,
      max_length       INT,
      default_value    VARCHAR(500),
      is_sensitive     TINYINT(1) NOT NULL DEFAULT 0,
      masking_pattern  VARCHAR(30) NOT NULL DEFAULT 'partial',
      unmask_roles     VARCHAR(255) NOT NULL DEFAULT 'admin,platform_admin',
      org_id           INT,
      sort_order       INT NOT NULL DEFAULT 0,
      updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_field_section_org (section_name, field_name, org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const fieldSetupAlters = [
    `ALTER TABLE field_setup ADD COLUMN help_text TEXT AFTER custom_label`,
    `ALTER TABLE field_setup ADD COLUMN lookup_target VARCHAR(100) AFTER picklist_type`,
    `ALTER TABLE field_setup ADD COLUMN do_not_update_master TINYINT(1) NOT NULL DEFAULT 0 AFTER lookup_target`,
    `ALTER TABLE field_setup ADD COLUMN max_length INT AFTER do_not_update_master`,
    `ALTER TABLE field_setup ADD COLUMN default_value VARCHAR(500) AFTER max_length`,
    `ALTER TABLE field_setup ADD COLUMN is_sensitive TINYINT(1) NOT NULL DEFAULT 0 AFTER default_value`,
    `ALTER TABLE field_setup ADD COLUMN masking_pattern VARCHAR(30) NOT NULL DEFAULT 'partial' AFTER is_sensitive`,
    `ALTER TABLE field_setup ADD COLUMN unmask_roles VARCHAR(255) NOT NULL DEFAULT 'admin,platform_admin' AFTER masking_pattern`,
    `ALTER TABLE field_setup ADD COLUMN org_id INT`,
  ];
  for (const sql of fieldSetupAlters) { try { await conn.execute(sql); } catch (_) {} }
  try { await conn.execute(`ALTER TABLE field_setup DROP INDEX uq_field_section_name`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE field_setup ADD UNIQUE KEY uq_field_section_org (section_name, field_name, org_id)`); } catch (_) {}

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS security_groups (
      id           INT NOT NULL AUTO_INCREMENT,
      name         VARCHAR(255) NOT NULL,
      description  TEXT,
      privileges   JSON,
      is_active    TINYINT(1) NOT NULL DEFAULT 1,
      org_id       INT,
      created_by   INT,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_security_groups_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  try { await conn.execute(`ALTER TABLE security_groups ADD COLUMN org_id INT`); } catch (_) {}

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS security_group_users (
      id        INT NOT NULL AUTO_INCREMENT,
      group_id  INT NOT NULL,
      user_id   INT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_group_user (group_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS workflow_states (
      id         INT           NOT NULL AUTO_INCREMENT,
      name       VARCHAR(255)  NOT NULL,
      org_id     INT,
      is_active  TINYINT(1)    NOT NULL DEFAULT 1,
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_workflow_states_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  try { await conn.execute(`ALTER TABLE workflow_states ADD COLUMN org_id INT`); } catch (_) {}

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS source_types (
      id         INT           NOT NULL AUTO_INCREMENT,
      name       VARCHAR(255)  NOT NULL,
      org_id     INT,
      is_active  TINYINT(1)    NOT NULL DEFAULT 1,
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_source_types_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  try { await conn.execute(`ALTER TABLE source_types ADD COLUMN org_id INT`); } catch (_) {}

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id         INT           NOT NULL AUTO_INCREMENT,
      trade_name VARCHAR(255)  NOT NULL,
      org_id     INT,
      is_active  TINYINT(1)    NOT NULL DEFAULT 1,
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY fk_products_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS workflow_rules (
      id                  INT NOT NULL AUTO_INCREMENT,
      site_id             INT,
      from_state_id       INT NOT NULL,
      to_state_id         INT NOT NULL,
      require_password    TINYINT(1) NOT NULL DEFAULT 0,
      require_checklist   TINYINT(1) NOT NULL DEFAULT 0,
      require_comment     TINYINT(1) NOT NULL DEFAULT 0,
      is_active           TINYINT(1) NOT NULL DEFAULT 1,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS product_families (
      id           INT NOT NULL AUTO_INCREMENT,
      name         VARCHAR(255) NOT NULL,
      ingredients  JSON,
      org_id       INT,
      is_active    TINYINT(1) NOT NULL DEFAULT 1,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_product_families_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  try { await conn.execute(`ALTER TABLE product_families ADD COLUMN org_id INT`); } catch (_) {}

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS contacts (
      id          INT NOT NULL AUTO_INCREMENT,
      type        VARCHAR(50) NOT NULL DEFAULT 'HCP',
      specialty   VARCHAR(255),
      first_name  VARCHAR(255) NOT NULL,
      last_name   VARCHAR(255),
      email       VARCHAR(255),
      phone       VARCHAR(100),
      institution VARCHAR(255),
      org_id      INT,
      site_id     INT,
      notes       TEXT,
      address     TEXT,
      do_not_update_master TINYINT(1) NOT NULL DEFAULT 0,
      is_active   TINYINT(1) NOT NULL DEFAULT 1,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_contacts_type (type),
      KEY idx_contacts_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const contactAlters = [
    `ALTER TABLE contacts ADD COLUMN specialty VARCHAR(255) AFTER type`,
    `ALTER TABLE contacts ADD COLUMN institution VARCHAR(255) AFTER specialty`,
    `ALTER TABLE contacts ADD COLUMN address TEXT AFTER notes`,
    `ALTER TABLE contacts ADD COLUMN do_not_update_master TINYINT(1) NOT NULL DEFAULT 0 AFTER address`,
  ];
  for (const sql of contactAlters) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS company_reps (
      id         INT NOT NULL AUTO_INCREMENT,
      name       VARCHAR(255) NOT NULL,
      title      VARCHAR(255),
      territory  VARCHAR(255),
      email      VARCHAR(255),
      phone      VARCHAR(100),
      org_id     INT,
      is_active  TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  try { await conn.execute(`ALTER TABLE company_reps ADD COLUMN territory VARCHAR(255) AFTER title`); } catch (_) {}

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS site_config (
      id                      INT NOT NULL AUTO_INCREMENT,
      site_id                 INT NOT NULL,
      abbreviation            VARCHAR(10),
      enable_data_protection  TINYINT(1) NOT NULL DEFAULT 0,
      retry_enabled           TINYINT(1) NOT NULL DEFAULT 0,
      retry_count             INT NOT NULL DEFAULT 3,
      retry_interval_min      INT NOT NULL DEFAULT 5,
      alert_config            JSON,
      response_config         JSON,
      created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_site_config_site (site_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_number_config (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT,
      case_type     VARCHAR(10)  NOT NULL DEFAULT 'ALL',
      prefix        VARCHAR(20)  NOT NULL DEFAULT 'CASE',
      \`separator\`  VARCHAR(5)   NOT NULL DEFAULT '-',
      include_year  TINYINT(1)   NOT NULL DEFAULT 1,
      include_month TINYINT(1)   NOT NULL DEFAULT 0,
      seq_length    INT          NOT NULL DEFAULT 5,
      current_seq   INT          NOT NULL DEFAULT 0,
      is_locked     TINYINT(1)   NOT NULL DEFAULT 0,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_num_config (org_id, case_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_form_definition (
      id              INT NOT NULL AUTO_INCREMENT,
      org_id          INT,
      case_type       VARCHAR(10)  NOT NULL DEFAULT 'ALL',
      section_name    VARCHAR(100) NOT NULL,
      is_visible      TINYINT(1)   NOT NULL DEFAULT 1,
      field_overrides JSON,
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_form_def (org_id, case_type, section_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
