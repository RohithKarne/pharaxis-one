-- Rohith, 27 Oct 2026 (CP Portal review, row 6). Admins already confirm every
-- sign-in with a second step; doctors signed in with a password alone, though their
-- accounts hold their questions and side-effect reports. Each client can now ask
-- doctors for a code emailed to them after the password. Off unless the client
-- turns it on (Sign-in settings). Single sign-on is unchanged: the identity
-- provider runs its own second step.
--   cp_clients.portal_two_step: 1 = doctors confirm password sign-in with a code.
--   cp_portal_2fa_codes:        one row per code sent; stored hashed, ten minutes,
--                               five guesses, used once.
ALTER TABLE cp_clients
  ADD COLUMN portal_two_step TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS cp_portal_2fa_codes (
  id             INT          NOT NULL AUTO_INCREMENT,
  portal_user_id INT          NOT NULL,
  client_id      INT          NOT NULL,
  code_hash      CHAR(64)     NOT NULL,
  attempts       INT          NOT NULL DEFAULT 0,
  expires_at     DATETIME     NOT NULL,
  is_consumed    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cp_portal_2fa_codes_user (portal_user_id, is_consumed),
  CONSTRAINT fk_cp_portal_2fa_codes_user FOREIGN KEY (portal_user_id) REFERENCES cp_portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
