-- Passkeys for CP Portal admins (Rohith's sign-in Tier 2, 12 Oct 2026).
-- An admin can sign in with Touch ID, Face ID or Windows Hello instead of a
-- password and a code. The browser holds the private key; we keep only the
-- public key, so a copy of the database signs nobody in.
--   cp_admin_passkeys:            one row per registered device.
--   cp_admin_passkey_challenges:  the one-time challenge of a sign-in or
--                                 registration in progress; 90 seconds, used once.
CREATE TABLE IF NOT EXISTS cp_admin_passkeys (
  id            INT          NOT NULL AUTO_INCREMENT,
  admin_id      INT          NOT NULL,
  credential_id VARCHAR(512) NOT NULL,
  public_key    TEXT         NOT NULL,
  counter       BIGINT       NOT NULL DEFAULT 0,
  aaguid        VARCHAR(36)  NULL,
  device_name   VARCHAR(255) NULL,
  transports    VARCHAR(100) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cp_admin_passkey_credential (credential_id),
  KEY idx_cp_admin_passkey_admin (admin_id),
  CONSTRAINT fk_cp_admin_passkey_admin FOREIGN KEY (admin_id) REFERENCES cp_admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cp_admin_passkey_challenges (
  id             INT          NOT NULL AUTO_INCREMENT,
  admin_id       INT          NOT NULL,
  challenge      VARCHAR(512) NOT NULL,
  challenge_type VARCHAR(10)  NOT NULL,
  expires_at     DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_cp_admin_passkey_challenge (admin_id, challenge_type),
  CONSTRAINT fk_cp_admin_passkey_challenge_admin FOREIGN KEY (admin_id) REFERENCES cp_admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
