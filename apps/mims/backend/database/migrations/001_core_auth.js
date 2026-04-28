'use strict';
// Migration 001 — Core auth: users, sessions, organisations, sites, role_permissions, login_audit, system_config

const bcrypt = require('bcrypt');

async function up(conn) {
  const MYSQL_DATABASE = conn.config?.database || process.env.MYSQL_DATABASE || 'pharaxis_mims_dev';

  async function ensureColumn(tableName, columnName, definitionSql) {
    const [rows] = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.columns
        WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
      [MYSQL_DATABASE, tableName, columnName]
    );
    if (!rows.length) {
      await conn.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definitionSql}`);
    }
  }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id                     INT           NOT NULL AUTO_INCREMENT,
      name                   VARCHAR(255)  NOT NULL,
      email                  VARCHAR(255)  NOT NULL,
      password               VARCHAR(255)  NOT NULL,
      role                   VARCHAR(50)   NOT NULL DEFAULT 'agent',
      is_active              TINYINT(1)    NOT NULL DEFAULT 1,
      email_verified         TINYINT(1)    NOT NULL DEFAULT 1,
      email_verified_at      DATETIME      NULL,
      password_reset_nonce   VARCHAR(128)  NULL,
      failed_login_attempts  INT           DEFAULT 0,
      locked_until           DATETIME      NULL,
      password_reset_required TINYINT(1)  NOT NULL DEFAULT 0,
      org_id                 INT,
      created_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Idempotent column additions for pre-migration DBs
  const userAlters = [
    ['failed_login_attempts', 'INT DEFAULT 0'],
    ['locked_until', 'DATETIME NULL'],
    ['email_verified', 'TINYINT(1) NOT NULL DEFAULT 1'],
    ['email_verified_at', 'DATETIME NULL'],
    ['password_reset_nonce', 'VARCHAR(128) NULL'],
    ['password_reset_required', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['org_id', 'INT'],
  ];
  for (const [col, def] of userAlters) {
    try { await conn.execute(`ALTER TABLE users ADD COLUMN \`${col}\` ${def}`); } catch (_) {}
  }

  // Superadmin bootstrap — idempotent
  const DEFAULT_SUPERADMIN_EMAIL = (process.env.BOOTSTRAP_SUPERADMIN_EMAIL || 'superadmin').trim();
  const [[existingSuperadmin]] = await conn.execute(
    'SELECT id FROM users WHERE email = ?', [DEFAULT_SUPERADMIN_EMAIL]
  );
  if (existingSuperadmin) {
    await conn.execute(
      `UPDATE users SET name = ?, role = 'superadmin', is_active = 1, updated_at = NOW() WHERE id = ?`,
      ['Superadmin', existingSuperadmin.id]
    );
  } else {
    const bootstrapPassword = String(process.env.BOOTSTRAP_SUPERADMIN_PASSWORD || '');
    if (!bootstrapPassword) throw new Error('BOOTSTRAP_SUPERADMIN_PASSWORD must be set.');
    const hash = await bcrypt.hash(bootstrapPassword, 12);
    await conn.execute(
      `INSERT INTO users (name, email, password, role, is_active, email_verified) VALUES (?, ?, ?, 'superadmin', 1, 1)`,
      ['Superadmin', DEFAULT_SUPERADMIN_EMAIL, hash]
    );
  }

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

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS sites (
      id          INT           NOT NULL AUTO_INCREMENT,
      org_id      INT           NOT NULL,
      name        VARCHAR(255)  NOT NULL,
      country     VARCHAR(100),
      is_primary  TINYINT(1)    NOT NULL DEFAULT 0,
      is_active   TINYINT(1)    NOT NULL DEFAULT 1,
      is_finalized TINYINT(1)   NOT NULL DEFAULT 0,
      abbreviation VARCHAR(20),
      enable_dppr  TINYINT(1)  NOT NULL DEFAULT 0,
      country_specific TINYINT(1) NOT NULL DEFAULT 0,
      default_country VARCHAR(100),
      enable_state_validation TINYINT(1) NOT NULL DEFAULT 0,
      created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY fk_sites_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const siteAlters = [
    ['is_finalized', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['abbreviation', 'VARCHAR(20)'],
    ['enable_dppr', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['country_specific', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['default_country', 'VARCHAR(100)'],
    ['enable_state_validation', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ];
  for (const [col, def] of siteAlters) {
    try { await conn.execute(`ALTER TABLE sites ADD COLUMN \`${col}\` ${def}`); } catch (_) {}
  }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id         INT           NOT NULL AUTO_INCREMENT,
      user_id    INT,
      user_name  VARCHAR(255),
      action     VARCHAR(255)  NOT NULL,
      entity     VARCHAR(255)  NOT NULL,
      entity_id  INT,
      details    TEXT,
      before_value TEXT        NULL,
      after_value  TEXT        NULL,
      change_reason VARCHAR(500) NULL,
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_audit_logs_user (user_id),
      KEY idx_audit_logs_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const col of ['before_value TEXT NULL', 'after_value TEXT NULL', 'change_reason VARCHAR(500) NULL']) {
    try { await conn.execute(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ${col}`); } catch (_) {}
  }

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

  // Seed role permissions if empty
  const [[{ c: permCount }]] = await conn.execute('SELECT COUNT(*) AS c FROM role_permissions');
  if (permCount === 0) {
    const modules = ['mims_core','inbox','case_mgmt','case_query','utilities','transmissions',
                     'browse_content','analytics','user_mgmt','admin_console',
                     'content_mgmt','data_visualization','reports','superadmin_console'];
    const defaultAccess = {
      superadmin:      { mims_core:1,inbox:1,case_mgmt:1,case_query:1,utilities:1,transmissions:1,browse_content:1,analytics:1,user_mgmt:1,admin_console:1,content_mgmt:1,data_visualization:1,reports:1,superadmin_console:1 },
      admin:           { mims_core:1,inbox:1,case_mgmt:1,case_query:1,utilities:1,transmissions:1,browse_content:1,analytics:1,user_mgmt:1,admin_console:1,content_mgmt:1,data_visualization:1,reports:1,superadmin_console:0 },
      agent:           { mims_core:1,inbox:1,case_mgmt:1,case_query:1,utilities:1,transmissions:1,browse_content:1,analytics:0,user_mgmt:0,admin_console:0,content_mgmt:0,data_visualization:0,reports:0,superadmin_console:0 },
      reviewer:        { mims_core:1,inbox:1,case_mgmt:1,case_query:1,utilities:0,transmissions:0,browse_content:1,analytics:1,user_mgmt:0,admin_console:0,content_mgmt:0,data_visualization:1,reports:1,superadmin_console:0 },
      content_manager: { mims_core:0,inbox:0,case_mgmt:0,case_query:0,utilities:0,transmissions:0,browse_content:1,analytics:0,user_mgmt:0,admin_console:0,content_mgmt:1,data_visualization:0,reports:0,superadmin_console:0 },
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
  // Ensure all modules exist for all roles
  const allModules = ['mims_core','inbox','case_mgmt','case_query','utilities','transmissions',
                      'browse_content','analytics','user_mgmt','admin_console',
                      'content_mgmt','data_visualization','reports','superadmin_console'];
  for (const mod of allModules) {
    await conn.execute(
      'INSERT IGNORE INTO role_permissions (role, module, can_access) VALUES (?, ?, 1)',
      ['superadmin', mod]
    );
  }
  await conn.execute(
    `INSERT IGNORE INTO user_module_permissions (user_id, module, can_access)
     SELECT ump.user_id, 'reports', 1 FROM user_module_permissions ump
     WHERE ump.module = 'data_visualization' AND ump.can_access = 1`
  );

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS login_audit (
      id           INT           NOT NULL AUTO_INCREMENT,
      user_id      INT,
      user_name    VARCHAR(255),
      role         VARCHAR(50),
      auth_event   VARCHAR(100),
      metadata     TEXT,
      login_time   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      logout_time  DATETIME,
      status       VARCHAR(50)   NOT NULL DEFAULT 'success',
      fail_reason  TEXT,
      PRIMARY KEY (id),
      KEY idx_login_audit_user (user_id),
      KEY idx_login_audit_time (login_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const col of ['auth_event VARCHAR(100)', 'metadata TEXT']) {
    try { await conn.execute(`ALTER TABLE login_audit ADD COLUMN ${col}`); } catch (_) {}
  }

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

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_org_access (
      id               INT          NOT NULL AUTO_INCREMENT,
      user_id          INT          NOT NULL,
      org_id           INT          NOT NULL,
      site_id          INT,
      is_active        TINYINT(1)   NOT NULL DEFAULT 1,
      role_at_org      VARCHAR(50)  NOT NULL DEFAULT 'user',
      site_permission  VARCHAR(50)  NOT NULL DEFAULT 'full',
      access_expires_at DATETIME   NULL,
      updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_org (user_id, org_id),
      KEY fk_uoa_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const uoaAlters = [
    `ALTER TABLE user_org_access MODIFY COLUMN role_at_org VARCHAR(50) NOT NULL DEFAULT 'user'`,
    `ALTER TABLE user_org_access MODIFY COLUMN site_permission VARCHAR(50) NOT NULL DEFAULT 'full'`,
    `ALTER TABLE user_org_access ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    `ALTER TABLE user_org_access ADD COLUMN IF NOT EXISTS access_expires_at DATETIME NULL`,
  ];
  for (const sql of uoaAlters) { try { await conn.execute(sql); } catch (_) {} }
}

module.exports = { up };
