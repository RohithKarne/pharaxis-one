'use strict';

/**
 * Migration 161 — an organisation's grant of support access to its cases
 * (Rohith's decision, 2026-10-04, MIPM-131 follow-up).
 *
 * Platform admins could read every organisation's cases whatever organisation
 * they had selected. From now on they read a client's cases only while that
 * client's admin has granted support access — time-boxed, with a reason — and
 * each case they open is recorded in the audit log.
 */

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS org_support_access (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      granted_by    INT NOT NULL,
      reason        VARCHAR(500) NOT NULL,
      expires_at    DATETIME NOT NULL,
      revoked_at    DATETIME NULL,
      revoked_by    INT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_org_support_access_org (org_id, revoked_at, expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(_conn) {}

module.exports = { up, down };
