-- 0008: Single Sign-On (SSO) — OIDC login, ported from the MIMS "Signal SSO" design.
-- Per-client OIDC provider configuration (Microsoft Entra / Google), a login-mode
-- flag on the client, and an external-identity link table so an SSO subject maps to
-- exactly one provisioned portal user. Client secrets are stored encrypted at rest
-- (utils/secretCrypto — enc:v1: envelope); no plaintext secret ever lands in a row.

-- login_mode governs which login methods a portal exposes:
--   local_only     — password login only (default; unchanged behaviour)
--   sso_only       — SSO only, password login hidden
--   local_and_sso  — both offered
ALTER TABLE cp_clients ADD COLUMN login_mode VARCHAR(30) NOT NULL DEFAULT 'local_only';

-- Per-client, per-provider OIDC config. oidc_client_id/tenant_id/secret come from the
-- client's IdP app registration. allowed_domains (JSON array) optionally restricts which
-- email domains may sign in. UNIQUE(client_id, provider_key) => one row per provider.
CREATE TABLE IF NOT EXISTS cp_sso_provider_configs (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  client_id                INT NOT NULL,
  provider_key             VARCHAR(30)  NOT NULL,
  provider_type            VARCHAR(30)  NOT NULL DEFAULT 'oidc',
  oidc_client_id           VARCHAR(500) NULL,
  client_secret_encrypted  TEXT NULL,
  tenant_id                VARCHAR(255) NULL,
  allowed_domains          JSON NULL,
  is_active                TINYINT(1) NOT NULL DEFAULT 0,
  updated_by               INT NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_client_provider (client_id, provider_key),
  CONSTRAINT fk_sso_cfg_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
);

-- Links an IdP identity (provider + immutable subject) to a provisioned portal user.
-- One subject can map to only one user per client. Created on first successful SSO login
-- against an existing (admin-provisioned) account matched by verified email.
CREATE TABLE IF NOT EXISTS cp_sso_identities (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  client_id      INT NOT NULL,
  portal_user_id INT NOT NULL,
  provider_key   VARCHAR(30)  NOT NULL,
  subject        VARCHAR(255) NOT NULL,
  email          VARCHAR(255) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at  TIMESTAMP NULL,
  UNIQUE KEY uq_client_provider_subject (client_id, provider_key, subject),
  KEY idx_sso_ident_user (portal_user_id),
  CONSTRAINT fk_sso_ident_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_sso_ident_user FOREIGN KEY (portal_user_id) REFERENCES cp_portal_users(id) ON DELETE CASCADE
);
