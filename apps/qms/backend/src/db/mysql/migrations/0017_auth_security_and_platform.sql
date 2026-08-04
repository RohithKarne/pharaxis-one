-- 0017_auth_security_and_platform.sql (MySQL 8.0)
-- Converted from src/db/migrations/0017_auth_security_and_platform.sql (PostgreSQL source of truth).
--
-- Notable mappings in this file:
--   BIGSERIAL      -> BIGINT NOT NULL AUTO_INCREMENT (same 8-byte range as Postgres)
--   INET           -> VARCHAR(45) (widest IPv6 text form, incl. IPv4-mapped)
--   TEXT[]         -> JSON, with the literal default expressed as JSON_ARRAY(...)
--   ON CONFLICT DO NOTHING -> INSERT IGNORE (relies on the UNIQUE keys declared in 0001)
--   initcap()      -> hand-rolled, see the comment on that statement

CREATE TABLE IF NOT EXISTS qms_login_audit (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id CHAR(36),
  email VARCHAR(255),
  login_surface VARCHAR(100) NOT NULL CHECK (login_surface IN ('user', 'superadmin')),
  outcome VARCHAR(100) NOT NULL CHECK (outcome IN ('Success', 'Failed')),
  reason TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE SET NULL
);

CREATE INDEX idx_qms_login_audit_occurred_at
  ON qms_login_audit (occurred_at DESC);
CREATE INDEX idx_qms_login_audit_org
  ON qms_login_audit (org_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS sa_platform_email_config (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  config_key VARCHAR(100) NOT NULL UNIQUE DEFAULT 'default',
  smtp_host VARCHAR(255) NOT NULL,
  smtp_port INT NOT NULL DEFAULT 587 CHECK (smtp_port > 0 AND smtp_port <= 65535),
  smtp_username VARCHAR(255),
  smtp_password_encrypted TEXT,
  smtp_from_email VARCHAR(255),
  smtp_from_name VARCHAR(255),
  use_tls BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by CHAR(36),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (updated_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sa_org_upload_policies (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL UNIQUE,
  max_upload_mb INT NOT NULL DEFAULT 25 CHECK (max_upload_mb >= 1 AND max_upload_mb <= 500),
  allowed_extensions JSON NOT NULL DEFAULT (JSON_ARRAY(
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'csv',
    'txt',
    'png',
    'jpg',
    'jpeg',
    'tiff',
    'eml',
    'msg'
  )),
  viewer_default_can_download BOOLEAN NOT NULL DEFAULT FALSE,
  viewer_download_requires_watermark BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by CHAR(36),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

INSERT IGNORE INTO sa_org_upload_policies (org_id)
SELECT o.id
FROM qms_orgs o;

-- Postgres used a VALUES list in a CROSS JOIN; MySQL's table value constructor
-- does not name its columns, so the same five rows are built with UNION ALL.
INSERT IGNORE INTO qms_roles (org_id, role_key, role_name, is_system)
SELECT
  o.id,
  role_map.role_key,
  role_map.role_name,
  TRUE
FROM qms_orgs o
CROSS JOIN (
            SELECT 'admin'       AS role_key, 'Admin'       AS role_name
  UNION ALL SELECT 'author',                  'Author'
  UNION ALL SELECT 'qa_reviewer',             'QA Reviewer'
  UNION ALL SELECT 'approver',                'Approver'
  UNION ALL SELECT 'viewer',                  'Viewer'
) AS role_map;

-- MySQL has no initcap() and no string-split function. The Postgres expression
-- initcap(replace(role_key, '_', ' ')) is reproduced by title-casing the first two
-- underscore-separated words and carrying any remainder through verbatim (spaces
-- for underscores). CONCAT_WS drops the NULL slots when a key has fewer words.
-- Every role_key in this schema is one or two words, so the result is identical to
-- Postgres; a hypothetical four-word key would keep every word but leave the third
-- and later words lowercase.
INSERT IGNORE INTO qms_roles (org_id, role_key, role_name, is_system)
SELECT
  u.org_id,
  u.role_key,
  CONCAT_WS(
    ' ',
    CONCAT(
      UPPER(LEFT(SUBSTRING_INDEX(u.role_key, '_', 1), 1)),
      LOWER(SUBSTRING(SUBSTRING_INDEX(u.role_key, '_', 1), 2))
    ),
    CASE WHEN LENGTH(u.role_key) - LENGTH(REPLACE(u.role_key, '_', '')) >= 1 THEN CONCAT(
      UPPER(LEFT(SUBSTRING_INDEX(SUBSTRING_INDEX(u.role_key, '_', 2), '_', -1), 1)),
      LOWER(SUBSTRING(SUBSTRING_INDEX(SUBSTRING_INDEX(u.role_key, '_', 2), '_', -1), 2))
    ) END,
    CASE WHEN LENGTH(u.role_key) - LENGTH(REPLACE(u.role_key, '_', '')) >= 2 THEN CONCAT(
      UPPER(LEFT(REPLACE(SUBSTRING_INDEX(u.role_key, '_', -(LENGTH(u.role_key) - LENGTH(REPLACE(u.role_key, '_', '')) - 1)), '_', ' '), 1)),
      LOWER(SUBSTRING(REPLACE(SUBSTRING_INDEX(u.role_key, '_', -(LENGTH(u.role_key) - LENGTH(REPLACE(u.role_key, '_', '')) - 1)), '_', ' '), 2))
    ) END
  ),
  TRUE
FROM qms_users u
WHERE u.role_key IS NOT NULL;

INSERT IGNORE INTO qms_user_roles (org_id, user_id, role_id)
SELECT
  u.org_id,
  u.id,
  r.id
FROM qms_users u
JOIN qms_roles r
  ON r.org_id = u.org_id
 AND r.role_key = u.role_key;

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
