-- 0007: JWT revocation support (CP-26)
-- A per-user token version embedded in the JWT. Bumping it invalidates every
-- outstanding token for that user (used on password change / reset).
ALTER TABLE cp_portal_users ADD COLUMN token_version INT NOT NULL DEFAULT 0;
ALTER TABLE cp_admin_users  ADD COLUMN token_version INT NOT NULL DEFAULT 0;
