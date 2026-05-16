'use strict';
// Migration 047 — Theme 9 Compliance Hardening (Wave 5).
// Three new tables on top of Wave 0 #2 (field_value_history.reason already
// captures reason-for-change strings):
//   - field_locks:       per-(status,field) admin-configured locks
//   - esign_events:      e-signature captures for case state transitions
//   - masked_reveal_log: audit trail every time a sensitive value is revealed

async function up(conn) {
  // ── A. Field locks per status ──────────────────────────────────────────────
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS field_locks (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NULL,                       -- NULL = global
      section_name  VARCHAR(120) NOT NULL,
      field_name    VARCHAR(120) NOT NULL,
      status        VARCHAR(60)  NOT NULL,          -- workflow status the lock applies to
      lock_mode     ENUM('read_only','admin_only','frozen') NOT NULL DEFAULT 'read_only',
      reason        VARCHAR(255) NULL,
      created_by    INT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_field_lock (org_id, section_name, field_name, status),
      KEY idx_lock_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ── B. E-signature events on state transitions ─────────────────────────────
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS esign_events (
      id            BIGINT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      case_id       BIGINT NOT NULL,
      transition    VARCHAR(80) NOT NULL,           -- 'submit','approve','close','transmit','lock','rescind'
      from_status   VARCHAR(60) NULL,
      to_status     VARCHAR(60) NULL,
      signed_by     INT NOT NULL,
      signed_name   VARCHAR(160) NULL,
      meaning       VARCHAR(255) NULL,              -- '21 CFR Part 11 statement / I confirm…'
      reason        VARCHAR(500) NULL,
      auth_method   VARCHAR(40) NOT NULL DEFAULT 'password', -- 'password','totp','sso'
      ip_address    VARCHAR(64)  NULL,
      user_agent    VARCHAR(255) NULL,
      hash_chain    CHAR(64) NULL,                  -- SHA-256(previous_hash + this_payload) — immutable chain
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_esign_case  (case_id, created_at),
      KEY idx_esign_user  (signed_by, created_at),
      KEY idx_esign_chain (hash_chain)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ── C. Masked-reveal audit log ─────────────────────────────────────────────
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS masked_reveal_log (
      id            BIGINT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      revealed_by   INT NOT NULL,
      entity_type   VARCHAR(40) NOT NULL,
      entity_id     BIGINT NOT NULL,
      section_name  VARCHAR(120) NULL,
      field_name    VARCHAR(120) NOT NULL,
      reason        VARCHAR(500) NULL,
      ip_address    VARCHAR(64)  NULL,
      user_agent    VARCHAR(255) NULL,
      revealed_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_reveal_entity (entity_type, entity_id, revealed_at),
      KEY idx_reveal_user   (revealed_by, revealed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  for (const t of ['masked_reveal_log','esign_events','field_locks']) {
    try { await conn.execute(`DROP TABLE IF EXISTS ${t}`); } catch (_) {}
  }
}

module.exports = { up, down };
