/**
 * db.js — MySQL Database Connection (migrated from SQLite)
 *
 * WHAT THIS FILE DOES:
 * - Creates a mysql2 connection pool to the MySQL server running in Docker
 * - Creates all required tables on first run (idempotent)
 * - Seeds default data (superadmin user, role permissions) on first run only
 * - Exports `pool` for all route files to use
 * - Exports `initPromise` so server.js can wait for DB-ready before listening
 *
 * CONNECTION: Docker MySQL at localhost:3306, database: mims_dev
 * Start MySQL: docker-compose up -d   (from project root)
 */

'use strict';

const mysql  = require('mysql2/promise');
const bcrypt = require('bcrypt');

// ── Connection Pool ──────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host:               process.env.MYSQL_HOST     || 'localhost',
  port:               parseInt(process.env.MYSQL_PORT || '3306', 10),
  user:               process.env.MYSQL_USER     || 'devuser',
  password:           process.env.MYSQL_PASSWORD || 'devpass',
  database:           process.env.MYSQL_DATABASE || 'mims_dev',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset:            'utf8mb4',
  timezone:           '+00:00',
});

// ── Schema Initialization ────────────────────────────────────────────────────
async function initializeDatabase() {
  const conn = await pool.getConnection();
  try {

    // USERS — all system users (admins, agents, reviewers, superadmin)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id          INT           NOT NULL AUTO_INCREMENT,
        name        VARCHAR(255)  NOT NULL,
        email       VARCHAR(255)  NOT NULL,
        password    VARCHAR(255)  NOT NULL,
        role        VARCHAR(50)   NOT NULL DEFAULT 'agent',
        is_active   TINYINT(1)    NOT NULL DEFAULT 1,
        created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Bootstrap: ensure default Superadmin account exists.
    // Never overwrite password on subsequent restarts.
    const DEFAULT_SUPERADMIN_EMAIL = 'superadmin';
    const [[existingSuperadmin]] = await conn.execute(
      'SELECT id FROM users WHERE email = ?',
      [DEFAULT_SUPERADMIN_EMAIL]
    );
    if (existingSuperadmin) {
      await conn.execute(
        `UPDATE users SET name = ?, role = 'superadmin', is_active = 1, updated_at = NOW() WHERE id = ?`,
        ['Superadmin', existingSuperadmin.id]
      );
    } else {
      const defaultHash = await bcrypt.hash('Manager@123', 10);
      await conn.execute(
        `INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, 'superadmin', 1)`,
        ['Superadmin', DEFAULT_SUPERADMIN_EMAIL, defaultHash]
      );
    }

    // SESSIONS — active login session tracking
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id          INT           NOT NULL AUTO_INCREMENT,
        user_id     INT           NOT NULL,
        token       VARCHAR(512)  NOT NULL,
        created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at  VARCHAR(100)  NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_sessions_token (token),
        KEY fk_sessions_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ORGANISATIONS — pharma client companies
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS organisations (
        id         INT           NOT NULL AUTO_INCREMENT,
        name       VARCHAR(255)  NOT NULL,
        is_active  TINYINT(1)    NOT NULL DEFAULT 1,
        created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_organisations_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // SITES — locations under each organisation
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS sites (
        id         INT           NOT NULL AUTO_INCREMENT,
        org_id     INT           NOT NULL,
        name       VARCHAR(255)  NOT NULL,
        country    VARCHAR(100),
        is_primary TINYINT(1)    NOT NULL DEFAULT 0,
        is_active  TINYINT(1)    NOT NULL DEFAULT 1,
        created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY fk_sites_org (org_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // WORKFLOW STATES — case status definitions
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS workflow_states (
        id         INT           NOT NULL AUTO_INCREMENT,
        name       VARCHAR(255)  NOT NULL,
        is_active  TINYINT(1)    NOT NULL DEFAULT 1,
        created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_workflow_states_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // SOURCE TYPES — how inquiries arrive
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS source_types (
        id         INT           NOT NULL AUTO_INCREMENT,
        name       VARCHAR(255)  NOT NULL,
        is_active  TINYINT(1)    NOT NULL DEFAULT 1,
        created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_source_types_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // PRODUCTS — drug/trade names linked to organisations
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

    // AUDIT LOGS — pharma compliance (21 CFR Part 11)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id         INT           NOT NULL AUTO_INCREMENT,
        user_id    INT,
        user_name  VARCHAR(255),
        action     VARCHAR(255)  NOT NULL,
        entity     VARCHAR(255)  NOT NULL,
        entity_id  INT,
        details    TEXT,
        created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_audit_logs_user (user_id),
        KEY idx_audit_logs_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ROLE PERMISSIONS — dynamic access control per module
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id         INT           NOT NULL AUTO_INCREMENT,
        role       VARCHAR(50)   NOT NULL,
        module     VARCHAR(100)  NOT NULL,
        can_access TINYINT(1)    NOT NULL DEFAULT 1,
        PRIMARY KEY (id),
        UNIQUE KEY uq_role_module (role, module)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // USER MODULE PERMISSIONS — per-user overrides (Superadmin)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_module_permissions (
        id         INT           NOT NULL AUTO_INCREMENT,
        user_id    INT           NOT NULL,
        module     VARCHAR(100)  NOT NULL,
        can_access TINYINT(1)    NOT NULL DEFAULT 1,
        PRIMARY KEY (id),
        UNIQUE KEY uq_user_module (user_id, module),
        KEY fk_ump_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Seed default role permissions if table is empty
    const [[{ c: permCount }]] = await conn.execute('SELECT COUNT(*) AS c FROM role_permissions');
    if (permCount === 0) {
      const modules = ['mims_core','inbox','case_mgmt','case_query','utilities','transmissions',
                       'browse_content','analytics','user_mgmt','admin_console',
                       'content_mgmt','data_visualization','superadmin_console'];
      const defaultAccess = {
        superadmin:      { mims_core:1,inbox:1,case_mgmt:1,case_query:1,utilities:1,transmissions:1,browse_content:1,analytics:1,user_mgmt:1,admin_console:1,content_mgmt:1,data_visualization:1,superadmin_console:1 },
        admin:           { mims_core:1,inbox:1,case_mgmt:1,case_query:1,utilities:1,transmissions:1,browse_content:1,analytics:1,user_mgmt:1,admin_console:1,content_mgmt:1,data_visualization:1,superadmin_console:0 },
        agent:           { mims_core:1,inbox:1,case_mgmt:1,case_query:1,utilities:1,transmissions:1,browse_content:1,analytics:0,user_mgmt:0,admin_console:0,content_mgmt:0,data_visualization:0,superadmin_console:0 },
        reviewer:        { mims_core:1,inbox:1,case_mgmt:1,case_query:1,utilities:0,transmissions:0,browse_content:1,analytics:1,user_mgmt:0,admin_console:0,content_mgmt:0,data_visualization:1,superadmin_console:0 },
        content_manager: { mims_core:0,inbox:0,case_mgmt:0,case_query:0,utilities:0,transmissions:0,browse_content:1,analytics:0,user_mgmt:0,admin_console:0,content_mgmt:1,data_visualization:0,superadmin_console:0 },
      };
      for (const role of Object.keys(defaultAccess)) {
        for (const mod of modules) {
          await conn.execute(
            'INSERT IGNORE INTO role_permissions (role, module, can_access) VALUES (?, ?, ?)',
            [role, mod, defaultAccess[role][mod] ?? 0]
          );
        }
      }
    }

    // Migration-safe: ensure new modules exist on already-seeded DBs
    const migrateEntries = [
      ['superadmin','mims_core',1],['superadmin','content_mgmt',1],['superadmin','data_visualization',1],['superadmin','superadmin_console',1],
      ['admin','mims_core',1],['admin','content_mgmt',1],['admin','data_visualization',1],['admin','superadmin_console',0],
      ['agent','mims_core',1],['agent','content_mgmt',0],['agent','data_visualization',0],['agent','superadmin_console',0],
      ['reviewer','mims_core',1],['reviewer','content_mgmt',0],['reviewer','data_visualization',1],['reviewer','superadmin_console',0],
      ['content_manager','mims_core',0],['content_manager','content_mgmt',1],['content_manager','data_visualization',0],['content_manager','superadmin_console',0],
    ];
    for (const [role, mod, access] of migrateEntries) {
      await conn.execute(
        'INSERT IGNORE INTO role_permissions (role, module, can_access) VALUES (?, ?, ?)',
        [role, mod, access]
      );
    }

    // Ensure superadmin has full access across all modules
    const allModules = ['mims_core','inbox','case_mgmt','case_query','utilities','transmissions',
                        'browse_content','analytics','user_mgmt','admin_console',
                        'content_mgmt','data_visualization','superadmin_console'];
    for (const mod of allModules) {
      await conn.execute(
        'INSERT IGNORE INTO role_permissions (role, module, can_access) VALUES (?, ?, 1)',
        ['superadmin', mod]
      );
    }

    // LOGIN AUDIT TRAIL — 21 CFR Part 11 compliance (AUD-02)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS login_audit (
        id           INT           NOT NULL AUTO_INCREMENT,
        user_id      INT,
        user_name    VARCHAR(255),
        role         VARCHAR(50),
        login_time   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        logout_time  DATETIME,
        status       VARCHAR(50)   NOT NULL DEFAULT 'success',
        fail_reason  TEXT,
        PRIMARY KEY (id),
        KEY idx_login_audit_user (user_id),
        KEY idx_login_audit_time (login_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // SYSTEM CONFIG — platform-level settings used by Superadmin features
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS system_config (
        id           INT           NOT NULL AUTO_INCREMENT,
        config_key   VARCHAR(255)  NOT NULL,
        config_value TEXT,
        created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_system_config_key (config_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // EMAIL ACCOUNTS — org mailbox connectors
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS email_accounts (
        id                    INT           NOT NULL AUTO_INCREMENT,
        org_id                INT           NOT NULL,
        account_name          VARCHAR(255)  NOT NULL,
        provider              VARCHAR(100)  NOT NULL DEFAULT 'Generic',
        direction             VARCHAR(50)   NOT NULL DEFAULT 'Both',
        is_active             TINYINT(1)    NOT NULL DEFAULT 1,
        mailbox_email         VARCHAR(255),
        from_email            VARCHAR(255),
        display_name          VARCHAR(255),
        is_default_outbound   TINYINT(1)    NOT NULL DEFAULT 0,
        imap_host             VARCHAR(255),
        imap_port             INT,
        imap_encryption       VARCHAR(50),
        imap_username         VARCHAR(255),
        imap_password         VARCHAR(255),
        smtp_host             VARCHAR(255),
        smtp_port             INT,
        smtp_encryption       VARCHAR(50),
        smtp_username         VARCHAR(255),
        smtp_password         VARCHAR(255),
        polling_interval_min  INT           NOT NULL DEFAULT 5,
        initial_fetch_days    INT           NOT NULL DEFAULT 7,
        mailbox_folder        VARCHAR(100)  NOT NULL DEFAULT 'INBOX',
        ingest_attachments    TINYINT(1)    NOT NULL DEFAULT 0,
        max_attachment_mb     INT           NOT NULL DEFAULT 10,
        last_imap_test_at     DATETIME,
        last_imap_test_status VARCHAR(50),
        last_imap_test_error  TEXT,
        last_smtp_test_at     DATETIME,
        last_smtp_test_status VARCHAR(50),
        last_smtp_test_error  TEXT,
        last_send_test_at     DATETIME,
        last_send_test_status VARCHAR(50),
        last_send_test_error  TEXT,
        last_ingest_at        DATETIME,
        created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY fk_email_accounts_org (org_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // INQUIRIES — email-derived inquiries (inbox)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS inquiries (
        id                 INT           NOT NULL AUTO_INCREMENT,
        org_id             INT,
        email_account_id   INT,
        message_id         VARCHAR(500),
        message_hash       VARCHAR(500),
        sender             VARCHAR(500),
        recipient          VARCHAR(500),
        subject            TEXT,
        body               MEDIUMTEXT,
        received_at        VARCHAR(100),
        status             VARCHAR(50)   NOT NULL DEFAULT 'inbox',
        attachments_count  INT           NOT NULL DEFAULT 0,
        source_tag         VARCHAR(100),
        is_locked          TINYINT(1)    NOT NULL DEFAULT 0,
        locked_by          VARCHAR(255),
        color              VARCHAR(50),
        is_read            TINYINT(1)    NOT NULL DEFAULT 0,
        assigned_to        VARCHAR(255),
        priority           VARCHAR(50),
        due_date           VARCHAR(100),
        original_inquiry_id INT,
        created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_inquiries_account (email_account_id),
        KEY idx_inquiries_status (status),
        KEY idx_inquiries_received (received_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // NOTE: MySQL UNIQUE indexes allow multiple NULLs (NULL != NULL in unique context),
    // which replicates the SQLite WHERE ... IS NOT NULL partial index behaviour exactly.
    await conn.execute(`
      CREATE UNIQUE INDEX idx_inquiries_msgid
        ON inquiries (email_account_id, message_id)
    `).catch(err => {
      if (err.code !== 'ER_DUP_KEYNAME') throw err; // ignore if already exists
    });

    await conn.execute(`
      CREATE UNIQUE INDEX idx_inquiries_msghash
        ON inquiries (email_account_id, message_hash)
    `).catch(err => {
      if (err.code !== 'ER_DUP_KEYNAME') throw err;
    });

    // REPLY TEMPLATES — global email reply templates
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS reply_templates (
        id         INT           NOT NULL AUTO_INCREMENT,
        name       VARCHAR(255)  NOT NULL,
        subject    VARCHAR(500),
        body       TEXT          NOT NULL,
        created_by INT,
        is_active  TINYINT(1)    NOT NULL DEFAULT 1,
        created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY fk_reply_templates_user (created_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // INQUIRY NOTES — internal notes per inquiry
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS inquiry_notes (
        id          INT           NOT NULL AUTO_INCREMENT,
        inquiry_id  INT           NOT NULL,
        user_id     INT,
        user_name   VARCHAR(255)  NOT NULL,
        note        TEXT          NOT NULL,
        created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_inquiry_notes_inquiry (inquiry_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // SERVICE LOGS — platform-wide service event log
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS service_logs (
        id            INT           NOT NULL AUTO_INCREMENT,
        source        VARCHAR(100)  NOT NULL,
        service_type  VARCHAR(100)  NOT NULL,
        description   VARCHAR(500)  NOT NULL,
        details       TEXT,
        status        VARCHAR(50)   NOT NULL DEFAULT 'success',
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_service_logs_source (source),
        KEY idx_service_logs_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // INQUIRY ATTACHMENTS — email attachment metadata
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS inquiry_attachments (
        id            INT           NOT NULL AUTO_INCREMENT,
        inquiry_id    INT           NOT NULL,
        filename      VARCHAR(500),
        mime_type     VARCHAR(255),
        size_bytes    INT,
        storage_path  TEXT,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_inquiry_attachments_inquiry (inquiry_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // PICKLISTS — dropdown values for case form fields
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS picklists (
        id          INT NOT NULL AUTO_INCREMENT,
        name        VARCHAR(100) NOT NULL,
        field_type  VARCHAR(100) NOT NULL,
        value       VARCHAR(255) NOT NULL,
        description TEXT,
        status      VARCHAR(20) NOT NULL DEFAULT 'Active',
        created_by  INT,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_picklist_field_value (field_type, value),
        KEY idx_picklists_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // FIELD_SETUP — case form field configuration per section
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS field_setup (
        id            INT NOT NULL AUTO_INCREMENT,
        section_name  VARCHAR(100) NOT NULL,
        field_name    VARCHAR(100) NOT NULL,
        field_type    VARCHAR(50) NOT NULL DEFAULT 'text',
        is_required   TINYINT(1) NOT NULL DEFAULT 0,
        is_hidden     TINYINT(1) NOT NULL DEFAULT 0,
        is_disabled   TINYINT(1) NOT NULL DEFAULT 0,
        custom_label  VARCHAR(255),
        picklist_type VARCHAR(100),
        sort_order    INT NOT NULL DEFAULT 0,
        updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_field_section_name (section_name, field_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // SECURITY_GROUPS — RBAC groups with privilege matrix
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS security_groups (
        id           INT NOT NULL AUTO_INCREMENT,
        name         VARCHAR(255) NOT NULL,
        description  TEXT,
        privileges   JSON,
        is_active    TINYINT(1) NOT NULL DEFAULT 1,
        created_by   INT,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_security_groups_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // SECURITY_GROUP_USERS — maps users to security groups
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS security_group_users (
        id        INT NOT NULL AUTO_INCREMENT,
        group_id  INT NOT NULL,
        user_id   INT NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_group_user (group_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // WORKFLOW_RULES — transitions between workflow states
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

    // PRODUCT_FAMILIES — product groupings
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS product_families (
        id           INT NOT NULL AUTO_INCREMENT,
        name         VARCHAR(255) NOT NULL,
        ingredients  JSON,
        is_active    TINYINT(1) NOT NULL DEFAULT 1,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_product_families_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CONTACTS — case contacts repository
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS contacts (
        id          INT NOT NULL AUTO_INCREMENT,
        type        VARCHAR(50) NOT NULL DEFAULT 'HCP',
        first_name  VARCHAR(255) NOT NULL,
        last_name   VARCHAR(255),
        email       VARCHAR(255),
        phone       VARCHAR(100),
        org_id      INT,
        site_id     INT,
        notes       TEXT,
        is_active   TINYINT(1) NOT NULL DEFAULT 1,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_contacts_type (type),
        KEY idx_contacts_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // COMPANY_REPS — company representative directory
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS company_reps (
        id         INT NOT NULL AUTO_INCREMENT,
        name       VARCHAR(255) NOT NULL,
        title      VARCHAR(255),
        email      VARCHAR(255),
        phone      VARCHAR(100),
        org_id     INT,
        is_active  TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // SITE_CONFIG — extended site configuration (email retry, GDPR flags)
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

    // EMAIL_RETRY_LOG — tracks retry attempts for failed notification emails
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS email_retry_log (
        id           INT NOT NULL AUTO_INCREMENT,
        site_id      INT,
        recipient    VARCHAR(255),
        subject      VARCHAR(500),
        attempt_no   INT NOT NULL DEFAULT 1,
        status       VARCHAR(50) NOT NULL DEFAULT 'pending',
        error_msg    TEXT,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CM_FOLDERS — top-level content management folders
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

    // CM_DOCUMENTS — content management documents with full lifecycle
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS cm_documents (
        id                INT NOT NULL AUTO_INCREMENT,
        doc_id            VARCHAR(50),
        folder_id         INT NOT NULL,
        doc_type          VARCHAR(50) NOT NULL DEFAULT 'SRD',
        name              VARCHAR(500) NOT NULL,
        content_html      MEDIUMTEXT,
        file_path         VARCHAR(1000),
        file_name         VARCHAR(500),
        file_size         INT,
        file_mime         VARCHAR(100),
        status            VARCHAR(50) NOT NULL DEFAULT 'Draft',
        version_major     INT NOT NULL DEFAULT 1,
        version_minor     INT NOT NULL DEFAULT 0,
        checked_out_by    INT,
        checked_out_at    DATETIME,
        expiry_date       DATE,
        activation_date   DATE,
        language          VARCHAR(20) NOT NULL DEFAULT 'en',
        is_product_specific TINYINT(1) NOT NULL DEFAULT 0,
        is_site_specific  TINYINT(1) NOT NULL DEFAULT 0,
        search_tags       TEXT,
        usage_instructions TEXT,
        attributes        JSON,
        created_by        INT NOT NULL,
        updated_by        INT,
        created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_cm_docs_folder (folder_id),
        KEY idx_cm_docs_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CM_REVIEWS — review sessions for documents
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

    // CM_REVIEWERS — individual reviewer assignments
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

    // CM_VERSION_HISTORY — version tracking per document/faq/merge-report
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS cm_version_history (
        id           INT NOT NULL AUTO_INCREMENT,
        entity_type  VARCHAR(30) NOT NULL,
        entity_id    INT NOT NULL,
        version      VARCHAR(20) NOT NULL,
        status       VARCHAR(50) NOT NULL,
        notes        TEXT,
        author_id    INT,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_cm_ver_entity (entity_type, entity_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CM_FAQS — FAQ content with lifecycle
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

    // CM_MERGE_REPORTS — merge report templates with lifecycle
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS cm_merge_reports (
        id            INT NOT NULL AUTO_INCREMENT,
        folder_id     INT NOT NULL,
        name          VARCHAR(500) NOT NULL,
        content_html  MEDIUMTEXT,
        file_path     VARCHAR(1000),
        status        VARCHAR(50) NOT NULL DEFAULT 'Draft',
        version_major INT NOT NULL DEFAULT 1,
        version_minor INT NOT NULL DEFAULT 0,
        checked_out_by INT,
        checked_out_at DATETIME,
        created_by    INT NOT NULL,
        updated_by    INT,
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_cm_mr_folder (folder_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CM_TEMPLATES — email/response templates
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS cm_templates (
        id          INT NOT NULL AUTO_INCREMENT,
        type        VARCHAR(50) NOT NULL DEFAULT 'Response',
        name        VARCHAR(500) NOT NULL,
        subject     VARCHAR(500),
        body_html   MEDIUMTEXT,
        status      VARCHAR(20) NOT NULL DEFAULT 'Active',
        created_by  INT NOT NULL,
        updated_by  INT,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── PHASE 1A: SPRINT 6 TABLES ────────────────────────────────────────────

    // CASE_NUMBER_CONFIG — per-org, per-case-type format configuration (F-01)
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

    // CASE_FORM_DEFINITION — per-org, per-case-type section visibility config (F-02)
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

    // SITE_EMAIL_ACCOUNTS — email accounts linked to a site (F-05)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS site_email_accounts (
        id          INT NOT NULL AUTO_INCREMENT,
        site_id     INT NOT NULL,
        email       VARCHAR(255) NOT NULL,
        label       VARCHAR(100),
        case_types  VARCHAR(50)  NOT NULL DEFAULT 'ALL',
        is_active   TINYINT(1)   NOT NULL DEFAULT 1,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_site_email_accounts_site (site_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // SITE_RESPONSE_TEMPLATES — auto-acknowledgement templates per site (F-05)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS site_response_templates (
        id          INT NOT NULL AUTO_INCREMENT,
        site_id     INT NOT NULL,
        subject     VARCHAR(500),
        body_html   MEDIUMTEXT,
        is_active   TINYINT(1)   NOT NULL DEFAULT 1,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_site_response (site_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // SITE_DATA_RETENTION — Right To Forget / data retention rules per site (F-05)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS site_data_retention (
        id                  INT NOT NULL AUTO_INCREMENT,
        site_id             INT NOT NULL,
        retention_days      INT NOT NULL DEFAULT 2555,
        regulation          VARCHAR(50)  NOT NULL DEFAULT 'GDPR',
        auto_delete_enabled TINYINT(1)   NOT NULL DEFAULT 0,
        notes               TEXT,
        created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_site_data_retention (site_id, regulation)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // SITE_ALERTS — threshold-based alert rules per site (F-05)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS site_alerts (
        id              INT NOT NULL AUTO_INCREMENT,
        site_id         INT NOT NULL,
        alert_type      VARCHAR(50)  NOT NULL,
        threshold_value INT          NOT NULL DEFAULT 10,
        notify_emails   TEXT,
        is_active       TINYINT(1)   NOT NULL DEFAULT 1,
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_site_alerts_site (site_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // PRODUCT_APPROVALS — regulatory approvals per product (F-07)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS product_approvals (
        id               INT NOT NULL AUTO_INCREMENT,
        product_id       INT NOT NULL,
        approval_number  VARCHAR(255) NOT NULL,
        regulatory_body  VARCHAR(255),
        approval_date    DATE,
        expiry_date      DATE,
        status           VARCHAR(50) NOT NULL DEFAULT 'Active',
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_product_approvals_product (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // PRODUCT_COUNTRY_AUTHORIZATIONS — country-level authorizations per product (F-07)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS product_country_authorizations (
        id              INT NOT NULL AUTO_INCREMENT,
        product_id      INT NOT NULL,
        country         VARCHAR(100) NOT NULL,
        auth_number     VARCHAR(255),
        auth_date       DATE,
        status          VARCHAR(50) NOT NULL DEFAULT 'Active',
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_product_country_auth_product (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // WORKFLOW_ACTIVITIES — named case activities that can trigger rules (F-12)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS workflow_activities (
        id          INT NOT NULL AUTO_INCREMENT,
        name        VARCHAR(255) NOT NULL,
        description TEXT,
        is_active   TINYINT(1) NOT NULL DEFAULT 1,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_workflow_activity_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // WORKFLOW_ACTIVITY_TRIGGERS — if-activity-then-action rules (F-12)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS workflow_activity_triggers (
        id               INT NOT NULL AUTO_INCREMENT,
        activity_id      INT NOT NULL,
        trigger_type     VARCHAR(50) NOT NULL,
        target_state_id  INT,
        alert_rule       VARCHAR(255),
        assign_to        VARCHAR(255),
        is_active        TINYINT(1) NOT NULL DEFAULT 1,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_wat_activity (activity_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CASE_AUDIT_TRAIL — immutable field-level audit log per case (F-09)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS case_audit_trail (
        id          INT NOT NULL AUTO_INCREMENT,
        case_id     INT NOT NULL,
        user_id     INT NOT NULL,
        user_name   VARCHAR(255),
        action_type VARCHAR(100) NOT NULL,
        field_name  VARCHAR(255),
        old_value   TEXT,
        new_value   TEXT,
        timestamp   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_case_audit_case (case_id),
        KEY idx_case_audit_ts (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // TRANSMISSION_AUDIT_TRAIL — immutable outbound transmission log per case (F-10)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS transmission_audit_trail (
        id              INT NOT NULL AUTO_INCREMENT,
        case_id         INT NOT NULL,
        user_id         INT NOT NULL,
        user_name       VARCHAR(255),
        target_system   VARCHAR(100) NOT NULL,
        payload_summary TEXT,
        status          VARCHAR(50) NOT NULL DEFAULT 'Sent',
        response_code   VARCHAR(50),
        timestamp       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_trans_audit_case (case_id),
        KEY idx_trans_audit_system (target_system)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── COLUMN ENHANCEMENTS — EXISTING TABLES ────────────────────────────────

    // picklists: add category column for grouping (F-04)
    try {
      await conn.execute(`ALTER TABLE picklists ADD COLUMN category VARCHAR(100) NOT NULL DEFAULT 'General' AFTER name`);
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // field_setup: add new columns for full Phase 1A support (F-03)
    try {
      await conn.execute(`ALTER TABLE field_setup ADD COLUMN help_text TEXT AFTER custom_label`);
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try {
      await conn.execute(`ALTER TABLE field_setup ADD COLUMN lookup_target VARCHAR(100) AFTER picklist_type`);
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try {
      await conn.execute(`ALTER TABLE field_setup ADD COLUMN do_not_update_master TINYINT(1) NOT NULL DEFAULT 0 AFTER lookup_target`);
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try {
      await conn.execute(`ALTER TABLE field_setup ADD COLUMN max_length INT AFTER do_not_update_master`);
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try {
      await conn.execute(`ALTER TABLE field_setup ADD COLUMN default_value VARCHAR(500) AFTER max_length`);
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // company_reps: add territory column (F-11)
    try {
      await conn.execute(`ALTER TABLE company_reps ADD COLUMN territory VARCHAR(255) AFTER title`);
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // contacts: add specialty, institution, address, do_not_update_master columns (F-08)
    try {
      await conn.execute(`ALTER TABLE contacts ADD COLUMN specialty VARCHAR(255) AFTER type`);
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try {
      await conn.execute(`ALTER TABLE contacts ADD COLUMN institution VARCHAR(255) AFTER specialty`);
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try {
      await conn.execute(`ALTER TABLE contacts ADD COLUMN address TEXT AFTER notes`);
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try {
      await conn.execute(`ALTER TABLE contacts ADD COLUMN do_not_update_master TINYINT(1) NOT NULL DEFAULT 0 AFTER address`);
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // workflow_activities: seed standard activities if table is empty (F-12)
    const [[{ actCount }]] = await conn.execute('SELECT COUNT(*) AS actCount FROM workflow_activities');
    if (actCount === 0) {
      const activities = [
        ['Version Created', 'A new case version was created'],
        ['Document Uploaded', 'A document was uploaded to the case'],
        ['Comment Added', 'A comment was added to the case'],
        ['Seriousness Flag Set', 'The seriousness flag was set or changed on a case'],
        ['Case Closed', 'The case was closed'],
        ['Transmission Sent', 'A transmission was sent to an external system'],
      ];
      for (const [name, description] of activities) {
        await conn.execute(
          'INSERT IGNORE INTO workflow_activities (name, description) VALUES (?, ?)',
          [name, description]
        );
      }
    }

    // ── PHASE 2: SPRINT 6 — CASE FORM TABLES ─────────────────────────────────

    // CASES — central case record (F-13)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS cases (
        id             INT           NOT NULL AUTO_INCREMENT,
        case_number    VARCHAR(100),
        case_type      ENUM('MI','AE','PC') NOT NULL,
        org_id         INT           NOT NULL,
        site_id        INT           NOT NULL,
        status_id      INT,
        case_owner_id  INT,
        intake_channel VARCHAR(50)   NOT NULL DEFAULT 'manual',
        priority       VARCHAR(20)   NOT NULL DEFAULT 'normal',
        date_received  DATE,
        date_of_intake DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        description    TEXT,
        internal_notes TEXT,
        is_deleted     TINYINT(1)    NOT NULL DEFAULT 0,
        created_by     INT,
        created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_cases_org (org_id),
        KEY idx_cases_site (site_id),
        KEY idx_cases_status (status_id),
        KEY idx_cases_owner (case_owner_id),
        KEY idx_cases_type (case_type),
        KEY idx_cases_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CASE_CONTACTS — contact/requestor entries linked to a case (F-14)
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

    // CASE_MI — Medical Information component per case (F-16)
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

    // CASE_AE_VERSIONS — AE component version control (F-17)
    // RAJEEV REVIEW: version locking — when V(n+1) is created, V(n) is locked atomically
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

    // CASE_AE_GENERAL — AE General tab (one row per version)
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

    // CASE_AE_EVENTS — AE Events tab (multiple rows per version)
    // RAJEEV REVIEW: ICH E2B R3 — seriousness stored as separate boolean columns, NOT JSON
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS case_ae_events (
        id                          INT           NOT NULL AUTO_INCREMENT,
        version_id                  INT           NOT NULL,
        event_description           TEXT,
        outcome                     VARCHAR(100),
        start_date                  DATE,
        end_date                    DATE,
        is_serious                  TINYINT(1)    NOT NULL DEFAULT 0,
        is_death                    TINYINT(1)    NOT NULL DEFAULT 0,
        is_life_threatening         TINYINT(1)    NOT NULL DEFAULT 0,
        is_hospitalization          TINYINT(1)    NOT NULL DEFAULT 0,
        is_disability               TINYINT(1)    NOT NULL DEFAULT 0,
        is_congenital_anomaly       TINYINT(1)    NOT NULL DEFAULT 0,
        is_other_medically_important TINYINT(1)   NOT NULL DEFAULT 0,
        created_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_ae_events_version (version_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CASE_AE_PATIENT_INFO — AE Patient Info tab (one row per version)
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

    // CASE_AE_LAB_RESULTS — AE Lab Results tab (multiple rows per version)
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

    // CASE_AE_LAB_NOTES — AE Lab Notes tab (one row per version)
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

    // CASE_AE_MEDICAL_HISTORY — AE Medical History tab (multiple rows per version)
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

    // CASE_AE_MEDICAL_NOTES — AE Medical Notes tab (one row per version)
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

    // CASE_AE_PRODUCT_INFO — AE Product Info tab + Concomitant Meds (multiple rows per version)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS case_ae_product_info (
        id              INT           NOT NULL AUTO_INCREMENT,
        version_id      INT           NOT NULL,
        product_id      INT,
        product_name    VARCHAR(255),
        dose            VARCHAR(100),
        dose_unit       VARCHAR(50),
        route_of_admin  VARCHAR(100),
        frequency       VARCHAR(100),
        start_date      DATE,
        end_date        DATE,
        indication      VARCHAR(255),
        is_suspect      TINYINT(1)    NOT NULL DEFAULT 1,
        is_concomitant  TINYINT(1)    NOT NULL DEFAULT 0,
        created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_ae_prodinfo_version (version_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CASE_PC_VERSIONS — PC component version control (F-18)
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

    // CASE_PC_GENERAL — PC General tab (one row per version)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS case_pc_general (
        id                   INT           NOT NULL AUTO_INCREMENT,
        version_id           INT           NOT NULL,
        complaint_description TEXT,
        pc_category          VARCHAR(255),
        date_of_complaint    DATE,
        date_received        DATE,
        severity             VARCHAR(50),
        additional_info      TEXT,
        created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_pc_general_version (version_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CASE_PC_PATIENT_INFO — PC Patient Info tab (one row per version)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS case_pc_patient_info (
        id                INT           NOT NULL AUTO_INCREMENT,
        version_id        INT           NOT NULL,
        age               INT,
        age_unit          VARCHAR(20),
        sex               VARCHAR(20),
        weight_kg         DECIMAL(6,2),
        therapy_start_date DATE,
        therapy_end_date  DATE,
        indication        VARCHAR(255),
        additional_info   TEXT,
        created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_pc_patient_version (version_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CASE_PC_PRODUCT_INFO — PC Product Info tab (one row per version)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS case_pc_product_info (
        id                  INT           NOT NULL AUTO_INCREMENT,
        version_id          INT           NOT NULL,
        product_id          INT,
        product_name        VARCHAR(255),
        lot_number          VARCHAR(100),
        expiry_date         DATE,
        quantity_available  TINYINT(1)    NOT NULL DEFAULT 0,
        storage_conditions  TEXT,
        additional_info     TEXT,
        created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_pc_product_version (version_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CASE_PC_RETURN_RETRIEVAL — PC Return/Retrieval tab (one row per version)
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

    // CASE_PC_REPLACEMENT — PC Replacement tab (one row per version)
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

    // CASE_PC_REFUND_CREDIT — PC Refund/Credit tab (one row per version)
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

    // ── Sprint 7: Multi-tenancy schema additions ─────────────────────────────

    // user_org_access — maps users to orgs/sites with role + permission
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_org_access (
        id               INT          NOT NULL AUTO_INCREMENT,
        user_id          INT          NOT NULL,
        org_id           INT          NOT NULL,
        primary_site_id  INT,
        role_at_org      VARCHAR(50)  NOT NULL DEFAULT 'user',
        site_permission  VARCHAR(50)  NOT NULL DEFAULT 'full',
        is_active        TINYINT(1)   NOT NULL DEFAULT 1,
        last_accessed_at DATETIME,
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_user_org (user_id, org_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (org_id)  REFERENCES organisations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // site_email_purpose — maps site → purpose → email_account
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS site_email_purpose (
        id               INT         NOT NULL AUTO_INCREMENT,
        site_id          INT         NOT NULL,
        purpose          ENUM('response','transmissions','correspondence','fax') NOT NULL,
        email_account_id INT         NOT NULL,
        created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        FOREIGN KEY (site_id)          REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (email_account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Sprint 7 column additions (idempotent — catch silently if already added)
    const s7Alters = [
      `ALTER TABLE users ADD COLUMN password_reset_required TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN org_id INT`,
      `ALTER TABLE sites ADD COLUMN is_finalized TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE sites ADD COLUMN abbreviation VARCHAR(20)`,
      `ALTER TABLE sites ADD COLUMN enable_dppr TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE sites ADD COLUMN country_specific TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE sites ADD COLUMN default_country VARCHAR(100)`,
      `ALTER TABLE sites ADD COLUMN enable_state_validation TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE picklists ADD COLUMN org_id INT`,
      `ALTER TABLE field_setup ADD COLUMN org_id INT`,
      `ALTER TABLE workflow_states ADD COLUMN org_id INT`,
      `ALTER TABLE source_types ADD COLUMN org_id INT`,
      `ALTER TABLE security_groups ADD COLUMN org_id INT`,
      `ALTER TABLE cm_folders ADD COLUMN org_id INT`,
      `ALTER TABLE workflow_activities ADD COLUMN org_id INT`,
      `ALTER TABLE product_families ADD COLUMN org_id INT`,
    ];
    for (const sql of s7Alters) {
      try { await conn.execute(sql); } catch (_) { /* column already exists */ }
    }

    const userOrgAccessAlters = [
      `ALTER TABLE user_org_access MODIFY COLUMN role_at_org VARCHAR(50) NOT NULL DEFAULT 'user'`,
      `ALTER TABLE user_org_access MODIFY COLUMN site_permission VARCHAR(50) NOT NULL DEFAULT 'full'`,
      `ALTER TABLE user_org_access ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ];
    for (const sql of userOrgAccessAlters) {
      try { await conn.execute(sql); } catch (_) { /* already aligned */ }
    }

    // Sprint 9: 2FA + trusted device additions
    const s9Alters = [
      `ALTER TABLE organisations ADD COLUMN two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE organisations ADD COLUMN two_factor_methods VARCHAR(100) NOT NULL DEFAULT 'email,totp'`,
      `ALTER TABLE organisations ADD COLUMN two_factor_remember_days INT NOT NULL DEFAULT 7`,
      `ALTER TABLE login_audit ADD COLUMN auth_event VARCHAR(100)`,
      `ALTER TABLE login_audit ADD COLUMN metadata TEXT`,
    ];
    for (const sql of s9Alters) {
      try { await conn.execute(sql); } catch (_) { /* column already exists */ }
    }

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_2fa_settings (
        id               INT          NOT NULL AUTO_INCREMENT,
        user_id          INT          NOT NULL,
        org_id           INT          NOT NULL,
        is_enabled       TINYINT(1)   NOT NULL DEFAULT 0,
        preferred_method VARCHAR(20)  DEFAULT NULL,
        totp_secret      VARCHAR(255) DEFAULT NULL,
        failed_attempts  INT          NOT NULL DEFAULT 0,
        is_locked        TINYINT(1)   NOT NULL DEFAULT 0,
        last_verified_at DATETIME     DEFAULT NULL,
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_user_2fa_org (user_id, org_id),
        KEY idx_user_2fa_org (org_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_2fa_backup_codes (
        id           INT          NOT NULL AUTO_INCREMENT,
        user_id      INT          NOT NULL,
        org_id       INT          NOT NULL,
        code_hash    VARCHAR(255) NOT NULL,
        is_used      TINYINT(1)   NOT NULL DEFAULT 0,
        used_at      DATETIME     DEFAULT NULL,
        created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_backup_codes_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_2fa_trusted_devices (
        id                INT          NOT NULL AUTO_INCREMENT,
        user_id           INT          NOT NULL,
        org_id            INT          NOT NULL,
        device_token_hash VARCHAR(255) NOT NULL,
        user_agent        VARCHAR(500),
        expires_at        DATETIME     NOT NULL,
        last_used_at      DATETIME     DEFAULT NULL,
        created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_trusted_device (user_id, org_id, device_token_hash),
        KEY idx_trusted_device_exp (expires_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_2fa_challenges (
        id             INT          NOT NULL AUTO_INCREMENT,
        user_id        INT          NOT NULL,
        org_id         INT          NOT NULL,
        challenge_type VARCHAR(20)  NOT NULL,
        code_hash      VARCHAR(255),
        totp_secret    VARCHAR(255),
        expires_at     DATETIME     NOT NULL,
        is_consumed    TINYINT(1)   NOT NULL DEFAULT 0,
        created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_2fa_challenge_user (user_id),
        KEY idx_2fa_challenge_exp (expires_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_password_history (
        id            INT          NOT NULL AUTO_INCREMENT,
        user_id       INT          NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_password_history_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS superadmin_alert_rules (
        id                INT           NOT NULL AUTO_INCREMENT,
        name              VARCHAR(255)  NOT NULL,
        event_type        VARCHAR(100)  NOT NULL,
        severity          VARCHAR(20)   NOT NULL DEFAULT 'medium',
        channels          VARCHAR(50)   NOT NULL DEFAULT 'email,in_app',
        recipient_emails  TEXT,
        threshold_value   INT           NOT NULL DEFAULT 1,
        window_minutes    INT           NOT NULL DEFAULT 15,
        cooldown_minutes  INT           NOT NULL DEFAULT 30,
        is_active         TINYINT(1)    NOT NULL DEFAULT 1,
        created_by        INT,
        updated_by        INT,
        created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_sa_alert_rules_event (event_type),
        KEY idx_sa_alert_rules_active (is_active),
        UNIQUE KEY uq_sa_alert_rules_event_type (event_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS superadmin_alert_events (
        id                INT           NOT NULL AUTO_INCREMENT,
        rule_id           INT           DEFAULT NULL,
        event_type        VARCHAR(100)  NOT NULL,
        severity          VARCHAR(20)   NOT NULL DEFAULT 'medium',
        title             VARCHAR(255)  NOT NULL,
        message           TEXT,
        metadata          TEXT,
        email_status      VARCHAR(20)   NOT NULL DEFAULT 'pending',
        in_app_status     VARCHAR(20)   NOT NULL DEFAULT 'pending',
        created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_sa_alert_events_rule (rule_id),
        KEY idx_sa_alert_events_event (event_type),
        KEY idx_sa_alert_events_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id           INT           NOT NULL AUTO_INCREMENT,
        user_id      INT           NOT NULL,
        category     VARCHAR(100)  NOT NULL DEFAULT 'general',
        title        VARCHAR(255)  NOT NULL,
        message      TEXT,
        link_url     VARCHAR(500),
        metadata     TEXT,
        is_read      TINYINT(1)    NOT NULL DEFAULT 0,
        created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        read_at      DATETIME      DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_notifications_user (user_id),
        KEY idx_notifications_category (category),
        KEY idx_notifications_read (is_read),
        KEY idx_notifications_created (created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Clean up duplicate seeded rules before enforcing uniqueness on event_type.
    await conn.execute(`
      DELETE r1
      FROM superadmin_alert_rules r1
      INNER JOIN superadmin_alert_rules r2
        ON r1.event_type = r2.event_type
       AND r1.id > r2.id
    `);

    try {
      await conn.execute(
        'ALTER TABLE superadmin_alert_rules ADD UNIQUE KEY uq_sa_alert_rules_event_type (event_type)'
      );
    } catch (_) { /* already exists */ }

    const defaultRules = [
      ['Failed Login Spike', 'failed_login_spike', 'high', 'email,in_app', '', 5, 15, 30],
      ['Repeated 2FA Lockouts', 'two_factor_lockout', 'high', 'email,in_app', '', 2, 30, 30],
      ['SMTP Failure', 'smtp_failure', 'high', 'email,in_app', '', 1, 15, 15],
      ['Mailbox Failure', 'mailbox_failure', 'high', 'email,in_app', '', 1, 15, 15],
      ['Organisation Deactivated', 'organization_deactivated', 'medium', 'email,in_app', '', 1, 60, 10],
      ['Site Deactivated', 'site_deactivated', 'medium', 'email,in_app', '', 1, 60, 10],
      ['Sensitive Config Change', 'sensitive_config_change', 'medium', 'email,in_app', '', 1, 60, 10],
      ['Service Error Threshold', 'service_error_threshold', 'high', 'email,in_app', '', 3, 30, 30],
    ];
    for (const rule of defaultRules) {
      await conn.execute(
        `INSERT INTO superadmin_alert_rules
         (name, event_type, severity, channels, recipient_emails, threshold_value, window_minutes, cooldown_minutes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           severity = VALUES(severity),
           channels = VALUES(channels),
           threshold_value = VALUES(threshold_value),
           window_minutes = VALUES(window_minutes),
           cooldown_minutes = VALUES(cooldown_minutes)`,
        rule
      );
    }

    console.log('✅ Database initialized — tables ready');

  } finally {
    conn.release();
  }
}

// ── Auto-initialize on startup ───────────────────────────────────────────────
// Export initPromise so server.js can await DB-ready before accepting requests.
const initPromise = initializeDatabase().catch(err => {
  console.error('❌ Database initialization failed:', err.message);
  process.exit(1);
});

module.exports = pool;
module.exports.initPromise = initPromise;
