-- 0001_core_platform.sql (MySQL 8.0)
-- Converted from src/db/migrations/0001_core_platform.sql (PostgreSQL source of truth).
--
-- CREATE EXTENSION pgcrypto / citext removed: MySQL needs neither. UUID() is a
-- built-in, and the database default collation utf8mb4_0900_ai_ci is already
-- case-insensitive, which is what citext was providing.
--
-- Foreign keys are written as table-level FOREIGN KEY clauses rather than as
-- inline column REFERENCES. MySQL parses inline column-level REFERENCES and then
-- silently discards it — no constraint is created. Table-level clauses are the
-- only form that actually reproduces the Postgres referential integrity.

CREATE TABLE IF NOT EXISTS qms_orgs (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_code VARCHAR(100) NOT NULL UNIQUE,
  org_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS qms_users (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role_key VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(org_id, email),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS qms_roles (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  role_key VARCHAR(100) NOT NULL,
  role_name VARCHAR(255) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(org_id, role_key),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS qms_user_roles (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(org_id, user_id, role_id),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES qms_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (role_id) REFERENCES qms_roles(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS qms_permissions (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  permission_key VARCHAR(100) NOT NULL,
  description TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(org_id, permission_key),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS qms_role_permissions (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  permission_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(org_id, role_id, permission_id),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (role_id) REFERENCES qms_roles(id) ON DELETE RESTRICT,
  FOREIGN KEY (permission_id) REFERENCES qms_permissions(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS qms_auth_accounts (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  provider_subject VARCHAR(255),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(org_id, provider, provider_subject),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES qms_users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS qms_e_signatures (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  entity_table VARCHAR(255) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  signature_meaning VARCHAR(255) NOT NULL,
  signed_payload_hash VARCHAR(255) NOT NULL,
  signed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES qms_users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS qms_audit_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  module_key VARCHAR(100) NOT NULL,
  entity_table VARCHAR(255) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  action_key VARCHAR(100) NOT NULL,
  actor_user_id CHAR(36),
  payload_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  prev_hash VARCHAR(255),
  curr_hash VARCHAR(255) NOT NULL UNIQUE,
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES qms_users(id)
);

-- Immutability of the audit ledger (21 CFR Part 11). The Postgres source used a
-- plpgsql function `qms_block_audit_mutation()` whose entire body is
-- `RAISE EXCEPTION 'qms_audit_events is immutable'`, wired to BEFORE UPDATE and
-- BEFORE DELETE triggers. MySQL has no shared trigger function, so the RAISE is
-- expressed directly as SIGNAL in each trigger. This is a direct translation of
-- the Postgres behaviour, not a new control: same events, same message.
-- Each trigger body is a single statement, so no DELIMITER handling is required.

DROP TRIGGER IF EXISTS qms_audit_events_block_update;
CREATE TRIGGER qms_audit_events_block_update
BEFORE UPDATE ON qms_audit_events
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'qms_audit_events is immutable';

DROP TRIGGER IF EXISTS qms_audit_events_block_delete;
CREATE TRIGGER qms_audit_events_block_delete
BEFORE DELETE ON qms_audit_events
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'qms_audit_events is immutable';
