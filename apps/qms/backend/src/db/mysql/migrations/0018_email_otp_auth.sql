-- 0018_email_otp_auth.sql (MySQL 8.0)
-- Converted from src/db/migrations/0018_email_otp_auth.sql (PostgreSQL source of truth).
--
-- qms_user_2fa_settings.user_id keeps its UNIQUE key: the application upserts on
-- it, so it is load-bearing, not decoration.

CREATE TABLE IF NOT EXISTS sa_org_security_policies (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL UNIQUE,
  email_otp_required BOOLEAN NOT NULL DEFAULT TRUE,
  allow_org_admin_2fa_reset BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by CHAR(36),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

INSERT IGNORE INTO sa_org_security_policies (org_id)
SELECT id
FROM qms_orgs;

CREATE TABLE IF NOT EXISTS qms_user_2fa_settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL UNIQUE,
  email_otp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reset_required BOOLEAN NOT NULL DEFAULT FALSE,
  last_verified_at DATETIME(3),
  reset_by CHAR(36),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES qms_users(id) ON DELETE CASCADE,
  FOREIGN KEY (reset_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

INSERT IGNORE INTO qms_user_2fa_settings (org_id, user_id, email_otp_enabled)
SELECT u.org_id, u.id, TRUE
FROM qms_users u
WHERE u.role_key <> 'superadmin';

CREATE TABLE IF NOT EXISTS qms_login_otp_challenges (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  otp_code_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  consumed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES qms_users(id) ON DELETE CASCADE
);

CREATE INDEX idx_qms_login_otp_challenges_user
  ON qms_login_otp_challenges (user_id, created_at DESC);
-- Partial index unsupported in MySQL: the Postgres predicate `WHERE consumed_at IS NULL`
-- was dropped, so this index now covers consumed challenges too. Queries looking for
-- live challenges must keep the `consumed_at IS NULL` filter in the WHERE clause.
CREATE INDEX idx_qms_login_otp_challenges_active
  ON qms_login_otp_challenges (org_id, expires_at DESC);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
