-- 0006: password reset support for portal users (CP-37)
-- Stores a SHA-256 hash of the reset token (never the raw token) plus an expiry.
ALTER TABLE cp_portal_users
  ADD COLUMN reset_token VARCHAR(64) NULL,
  ADD COLUMN reset_token_expires_at DATETIME NULL;
