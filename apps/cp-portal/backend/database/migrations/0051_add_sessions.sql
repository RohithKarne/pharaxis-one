-- Server-side sessions for CP Portal admins and portal users (Rohith's sign-in
-- Tier 1, 12 Oct 2026). A sign-in cookie lasted its full 12 or 24 hours however
-- long the browser sat idle. Each sign-in now has a row; a request after the idle
-- limit (30 minutes for an admin, 60 for a portal user) is refused and the row
-- ended. Sign-out ends the row too. The token itself is stored hashed.
CREATE TABLE IF NOT EXISTS cp_sessions (
  id           INT          NOT NULL AUTO_INCREMENT,
  subject_type VARCHAR(10)  NOT NULL,
  subject_id   INT          NOT NULL,
  token_hash   CHAR(64)     NOT NULL,
  user_agent   VARCHAR(500) NULL,
  last_seen_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at     DATETIME     NULL,
  ended_reason VARCHAR(30)  NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cp_sessions_token (token_hash),
  KEY idx_cp_sessions_subject (subject_type, subject_id, ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
