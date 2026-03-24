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

    // Ensure Rohith has superadmin role
    await conn.execute(
      `UPDATE users SET role = 'superadmin' WHERE email = ?`,
      ['rohithreddy480@gmail.com']
    );

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
