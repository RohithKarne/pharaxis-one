-- Two-step sign-in for every CP Portal admin (Rohith's sign-in Tier 1, 12 Oct 2026).
-- An admin signed in with a password alone and could see reporter identity and
-- change client settings. Now the password is step one; a code from email or an
-- authenticator app is step two, with backup codes for recovery and a remembered
-- device for a few days.
--   cp_admin_2fa:               one row per admin once set up; totp_secret is
--                               encrypted with utils/secretCrypto; three wrong
--                               codes lock it until another admin resets it.
--   cp_admin_2fa_backup_codes:  ten one-time codes, stored hashed, each usable once.
--   cp_admin_2fa_challenges:    short-lived email codes and app secrets being set
--                               up; consumed once used, five guesses at most.
--   cp_admin_trusted_devices:   a remembered browser, stored hashed, with an expiry.
CREATE TABLE IF NOT EXISTS cp_admin_2fa (
  admin_id         INT          NOT NULL,
  is_enabled       TINYINT(1)   NOT NULL DEFAULT 0,
  preferred_method VARCHAR(20)  NULL,
  totp_secret      VARCHAR(255) NULL,
  failed_attempts  INT          NOT NULL DEFAULT 0,
  is_locked        TINYINT(1)   NOT NULL DEFAULT 0,
  last_verified_at DATETIME     NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (admin_id),
  CONSTRAINT fk_cp_admin_2fa_admin FOREIGN KEY (admin_id) REFERENCES cp_admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cp_admin_2fa_backup_codes (
  id         INT          NOT NULL AUTO_INCREMENT,
  admin_id   INT          NOT NULL,
  code_hash  CHAR(64)     NOT NULL,
  is_used    TINYINT(1)   NOT NULL DEFAULT 0,
  used_at    DATETIME     NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cp_admin_2fa_backup_admin (admin_id),
  CONSTRAINT fk_cp_admin_2fa_backup_admin FOREIGN KEY (admin_id) REFERENCES cp_admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cp_admin_2fa_challenges (
  id             INT          NOT NULL AUTO_INCREMENT,
  admin_id       INT          NOT NULL,
  challenge_type VARCHAR(20)  NOT NULL,
  code_hash      CHAR(64)     NULL,
  totp_secret    VARCHAR(255) NULL,
  attempts       INT          NOT NULL DEFAULT 0,
  expires_at     DATETIME     NOT NULL,
  is_consumed    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cp_admin_2fa_challenge_admin (admin_id, challenge_type),
  CONSTRAINT fk_cp_admin_2fa_challenge_admin FOREIGN KEY (admin_id) REFERENCES cp_admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cp_admin_trusted_devices (
  id                INT          NOT NULL AUTO_INCREMENT,
  admin_id          INT          NOT NULL,
  device_token_hash CHAR(64)     NOT NULL,
  user_agent        VARCHAR(500) NULL,
  expires_at        DATETIME     NOT NULL,
  last_used_at      DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cp_admin_trusted_device (admin_id, device_token_hash),
  CONSTRAINT fk_cp_admin_trusted_admin FOREIGN KEY (admin_id) REFERENCES cp_admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
