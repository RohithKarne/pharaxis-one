'use strict';
// Migration 008 — Multi-tenancy: user_org_access extended, site_email_purpose, Sprint 7/9 alters, 2FA tables

const bcrypt = require('bcrypt');

async function up(conn) {
  // user_org_access already created in 001 with base columns — add Sprint 7 columns
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
  for (const sql of [
    `ALTER TABLE user_org_access ADD COLUMN primary_site_id INT`,
    `ALTER TABLE user_org_access ADD COLUMN last_accessed_at DATETIME`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

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

  // Sprint 7 org_id additions on config tables
  for (const sql of [
    `ALTER TABLE picklists ADD COLUMN org_id INT`,
    `ALTER TABLE field_setup ADD COLUMN org_id INT`,
    `ALTER TABLE workflow_states ADD COLUMN org_id INT`,
    `ALTER TABLE source_types ADD COLUMN org_id INT`,
    `ALTER TABLE security_groups ADD COLUMN org_id INT`,
    `ALTER TABLE cm_folders ADD COLUMN org_id INT`,
    `ALTER TABLE workflow_activities ADD COLUMN org_id INT`,
    `ALTER TABLE product_families ADD COLUMN org_id INT`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  // Sprint 9: 2FA org-level settings + login audit columns
  for (const sql of [
    `ALTER TABLE organisations ADD COLUMN two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE organisations ADD COLUMN two_factor_methods VARCHAR(100) NOT NULL DEFAULT 'email,totp'`,
    `ALTER TABLE organisations ADD COLUMN two_factor_remember_days INT NOT NULL DEFAULT 7`,
    `ALTER TABLE organisations ADD COLUMN process_explorer_enabled TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE login_audit ADD COLUMN auth_event VARCHAR(100)`,
    `ALTER TABLE login_audit ADD COLUMN metadata TEXT`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

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
      id         INT          NOT NULL AUTO_INCREMENT,
      user_id    INT          NOT NULL,
      org_id     INT          NOT NULL,
      code_hash  VARCHAR(255) NOT NULL,
      is_used    TINYINT(1)   NOT NULL DEFAULT 0,
      used_at    DATETIME     DEFAULT NULL,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    CREATE TABLE IF NOT EXISTS user_email_verification_challenges (
      id          INT          NOT NULL AUTO_INCREMENT,
      user_id     INT          NOT NULL,
      code_hash   VARCHAR(255) NOT NULL,
      expires_at  DATETIME     NOT NULL,
      is_consumed TINYINT(1)   NOT NULL DEFAULT 0,
      attempts    INT          NOT NULL DEFAULT 0,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_email_verif_user (user_id),
      KEY idx_email_verif_exp (expires_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

  // Seed regression test user if credentials are configured
  const REGRESSION_EMAIL = String(process.env.REGRESSION_EMAIL || '').trim();
  const REGRESSION_PASSWORD = String(process.env.REGRESSION_PASSWORD || '');
  if (REGRESSION_EMAIL && REGRESSION_PASSWORD) {
    const [[existingRegUser]] = await conn.execute('SELECT id FROM users WHERE email = ?', [REGRESSION_EMAIL]);
    if (!existingRegUser) {
      const regHash = await bcrypt.hash(REGRESSION_PASSWORD, 12);
      await conn.execute(
        `INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, 'admin', 1)`,
        ['Regression Test User', REGRESSION_EMAIL, regHash]
      );
    }
    try {
      const [[regUserRow]] = await conn.execute('SELECT id FROM users WHERE email = ?', [REGRESSION_EMAIL]);
      if (regUserRow?.id) {
        const [[firstOrg]] = await conn.execute(
          `SELECT id FROM organisations WHERE is_active = 1 ORDER BY id ASC LIMIT 1`
        );
        if (firstOrg?.id) {
          await conn.execute(
            `INSERT IGNORE INTO user_org_access (user_id, org_id, is_active) VALUES (?, ?, 1)`,
            [regUserRow.id, firstOrg.id]
          );
        }
      }
    } catch (_) {}
  }
}

module.exports = { up };
