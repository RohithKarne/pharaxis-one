-- 0000: full CP Portal schema baseline.
--
-- Why this exists: before this file, a fresh database could not be provisioned at
-- all. The 42 CREATE TABLEs lived only in database/db.js, but server.js runs
-- runMigrations() BEFORE initializeDatabase(), so on an empty database the first
-- FK-bearing migration (0002 -> cp_clients) failed with ER_FK_CANNOT_OPEN_PARENT
-- and startup exited 1 before the bootstrap ever ran. Reversing the two calls did
-- not help either: db.js had since absorbed several post-bootstrap changes, so a
-- bootstrapped schema then collided with 0005 (api_key, cp_form_config.updated_at,
-- uq_notif_dedup) and 0009 (mims_case_url_base) as duplicate-column errors.
--
-- This file is the complete current schema — the union of db.js and migrations
-- 0002-0012 — so an empty database is provisioned by the migration runner alone.
-- It then records 0002-0012 as applied, because their contents are already
-- included here and re-running them would duplicate columns.
--
-- Existing databases are unaffected: every statement is CREATE TABLE IF NOT
-- EXISTS, so each one is a no-op where the table already exists, and the
-- bookkeeping insert is INSERT IGNORE. db.js keeps its bootstrap-state
-- early-return and remains the owner of the superadmin and default-form-field
-- seeds, which cannot live in a migration (bcrypt, env var, and the no-seed-data
-- rule in this folder's README).
--
-- Tables are ordered so every foreign key resolves against a table already
-- created above it. Indexes that db.js adds via standalone CREATE INDEX are
-- declared inline as KEY clauses here, because MySQL has no
-- CREATE INDEX IF NOT EXISTS and a bare CREATE INDEX would fail on any database
-- that already has the index.

-- ── CLIENTS (root of nearly every foreign key) ─────────────────
-- login_mode folded in from 0008.
CREATE TABLE IF NOT EXISTS cp_clients (
  id                   INT          NOT NULL AUTO_INCREMENT,
  name                 VARCHAR(255) NOT NULL,
  code                 VARCHAR(100) NOT NULL UNIQUE,
  description          TEXT         NULL,
  contact_name         VARCHAR(255) NULL,
  contact_email        VARCHAR(255) NULL,
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  language_config_json VARCHAR(500) NOT NULL DEFAULT '{"default":"en","enabled":["en"]}',
  login_mode           VARCHAR(30)  NOT NULL DEFAULT 'local_only',
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── ADMIN USERS ────────────────────────────────────────────────
-- token_version folded in from 0007. db.js adds the client_id foreign key via a
-- follow-up ALTER because it creates this table before cp_clients — here the
-- parent already exists, so the constraint is declared inline under the same name.
CREATE TABLE IF NOT EXISTS cp_admin_users (
  id            INT          NOT NULL AUTO_INCREMENT,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password      TEXT         NOT NULL,
  role          VARCHAR(50)  NOT NULL DEFAULT 'admin',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  client_id     INT          NULL,
  token_version INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_admin_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── BOOTSTRAP STATE ────────────────────────────────────────────
-- Read by initializeDatabase() to decide whether to run the legacy bootstrap.
-- Deliberately left empty here: on a fresh database db.js must still run once to
-- seed the superadmin and the default form fields, and it writes this row itself
-- when it finishes.
CREATE TABLE IF NOT EXISTS cp_schema_bootstrap_state (
  id           INT         NOT NULL PRIMARY KEY,
  version_tag  VARCHAR(50) NOT NULL,
  completed_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── PORTAL USERS ───────────────────────────────────────────────
-- reset_token / reset_token_expires_at folded in from 0006, token_version from 0007.
CREATE TABLE IF NOT EXISTS cp_portal_users (
  id                            INT          NOT NULL AUTO_INCREMENT,
  client_id                     INT          NOT NULL,
  first_name                    VARCHAR(255) NOT NULL,
  last_name                     VARCHAR(255) NOT NULL,
  email                         VARCHAR(255) NOT NULL,
  password                      TEXT         NOT NULL,
  user_type                     VARCHAR(50)  NOT NULL DEFAULT 'other',
  specialty                     VARCHAR(255) NULL,
  country                       VARCHAR(100) NULL,
  phone                         VARCHAR(50)  NULL,
  is_active                     TINYINT(1)   NOT NULL DEFAULT 1,
  is_verified                   TINYINT(1)   NOT NULL DEFAULT 0,
  user_type_confirmed           TINYINT(1)   NOT NULL DEFAULT 0,
  last_login_at                 DATETIME     NULL,
  notif_prefs_json              VARCHAR(500) NOT NULL DEFAULT '{"news":true,"documents":true,"safety":true}',
  email_verified                TINYINT(1)   NOT NULL DEFAULT 1,
  verification_token            VARCHAR(255) NULL,
  verification_token_expires_at DATETIME     NULL,
  reset_token                   VARCHAR(64)  NULL,
  reset_token_expires_at        DATETIME     NULL,
  token_version                 INT          NOT NULL DEFAULT 0,
  created_at                    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_portal_users (client_id, email),
  CONSTRAINT fk_portal_users_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── BRANDING ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_branding (
  id                  INT          NOT NULL AUTO_INCREMENT,
  client_id           INT          NOT NULL UNIQUE,
  portal_name         VARCHAR(255) NOT NULL DEFAULT 'Medical Portal',
  tagline             TEXT         NULL,
  logo_url            TEXT         NULL,
  favicon_url         TEXT         NULL,
  custom_domain       VARCHAR(255) NULL,
  primary_color       VARCHAR(20)  NOT NULL DEFAULT '#6B3FA0',
  secondary_color     VARCHAR(20)  NOT NULL DEFAULT '#4A2D7A',
  accent_color        VARCHAR(20)  NOT NULL DEFAULT '#9B6FCC',
  background_color    VARCHAR(20)  NOT NULL DEFAULT '#FFFFFF',
  surface_color       VARCHAR(20)  NOT NULL DEFAULT '#F8F8FB',
  text_primary        VARCHAR(20)  NOT NULL DEFAULT '#1A1A2E',
  text_secondary      VARCHAR(20)  NOT NULL DEFAULT '#6B7280',
  header_bg           VARCHAR(20)  NOT NULL DEFAULT '#6B3FA0',
  header_text         VARCHAR(20)  NOT NULL DEFAULT '#FFFFFF',
  footer_bg           VARCHAR(20)  NOT NULL DEFAULT '#1A1A2E',
  footer_text         VARCHAR(20)  NOT NULL DEFAULT '#9CA3AF',
  button_bg           VARCHAR(20)  NOT NULL DEFAULT '#6B3FA0',
  button_text         VARCHAR(20)  NOT NULL DEFAULT '#FFFFFF',
  link_color          VARCHAR(20)  NOT NULL DEFAULT '#6B3FA0',
  border_color        VARCHAR(20)  NOT NULL DEFAULT '#E5E7EB',
  font_family         VARCHAR(100) NOT NULL DEFAULT 'Inter, sans-serif',
  heading_font        VARCHAR(100) NOT NULL DEFAULT 'Inter, sans-serif',
  base_font_size      VARCHAR(10)  NOT NULL DEFAULT '14px',
  border_radius       VARCHAR(10)  NOT NULL DEFAULT '8px',
  header_style        VARCHAR(20)  NOT NULL DEFAULT 'solid',
  footer_text_content TEXT         NULL,
  copyright_text      TEXT         NULL,
  show_powered_by     TINYINT(1)   NOT NULL DEFAULT 1,
  sla_response_text   MEDIUMTEXT   NULL,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_branding_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── FEATURES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_features (
  id            INT          NOT NULL AUTO_INCREMENT,
  client_id     INT          NOT NULL,
  feature_key   VARCHAR(100) NOT NULL,
  is_enabled    TINYINT(1)   NOT NULL DEFAULT 1,
  display_name  VARCHAR(255) NULL,
  display_order INT          NOT NULL DEFAULT 0,
  icon          VARCHAR(100) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_features (client_id, feature_key),
  CONSTRAINT fk_features_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── FORM CONFIG ────────────────────────────────────────────────
-- updated_at is present from the start here (0005 added it to older databases).
CREATE TABLE IF NOT EXISTS cp_form_config (
  id            INT          NOT NULL AUTO_INCREMENT,
  client_id     INT          NOT NULL,
  form_type     VARCHAR(100) NOT NULL,
  field_key     VARCHAR(100) NOT NULL,
  field_label   VARCHAR(255) NOT NULL,
  field_type    VARCHAR(50)  NOT NULL DEFAULT 'text',
  field_options TEXT         NULL,
  placeholder   TEXT         NULL,
  help_text     TEXT         NULL,
  is_required   TINYINT(1)   NOT NULL DEFAULT 0,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  display_order INT          NOT NULL DEFAULT 0,
  updated_at    DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_form_config (client_id, form_type, field_key),
  CONSTRAINT fk_form_config_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── INTEGRATION CONFIG ─────────────────────────────────────────
-- mims_case_url_base is present from the start here (0009 added it to older databases).
CREATE TABLE IF NOT EXISTS cp_integration_config (
  id                 INT          NOT NULL AUTO_INCREMENT,
  client_id          INT          NOT NULL,
  system_name        VARCHAR(100) NOT NULL DEFAULT 'MIMS',
  api_base_url       TEXT         NULL,
  api_key            TEXT         NULL,
  api_secret         TEXT         NULL,
  auth_type          VARCHAR(50)  NOT NULL DEFAULT 'bearer',
  extra_headers      TEXT         NULL,
  mims_case_url_base VARCHAR(500) NULL,
  is_active          TINYINT(1)   NOT NULL DEFAULT 0,
  last_sync_at       DATETIME     NULL,
  last_sync_status   VARCHAR(50)  NOT NULL DEFAULT 'unknown',
  last_sync_error    TEXT         NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_integration_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── FIELD MAPPING ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_field_mapping (
  id             INT          NOT NULL AUTO_INCREMENT,
  client_id      INT          NOT NULL,
  integration_id INT          NOT NULL,
  form_type      VARCHAR(100) NOT NULL,
  cp_field       VARCHAR(100) NOT NULL,
  target_field   VARCHAR(100) NOT NULL,
  transform      VARCHAR(100) NULL,
  default_value  TEXT         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_field_mapping (client_id, integration_id, form_type, cp_field),
  CONSTRAINT fk_mapping_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_mapping_integration FOREIGN KEY (integration_id) REFERENCES cp_integration_config(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── SUBMISSIONS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_submissions (
  id              INT          NOT NULL AUTO_INCREMENT,
  client_id       INT          NOT NULL,
  submission_type VARCHAR(100) NOT NULL,
  user_id         INT          NULL,
  submitter_name  VARCHAR(255) NULL,
  submitter_email VARCHAR(255) NULL,
  submitter_type  VARCHAR(100) NULL,
  form_data       MEDIUMTEXT   NOT NULL,
  status          VARCHAR(50)  NOT NULL DEFAULT 'submitted',
  external_ref    VARCHAR(255) NULL,
  sync_attempts   INT          NOT NULL DEFAULT 0,
  sync_error      TEXT         NULL,
  ip_address      VARCHAR(100) NULL,
  submitted_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at       DATETIME     NULL,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cp_submissions_client (client_id),
  KEY idx_cp_submissions_status (status),
  KEY idx_cp_submissions_type (submission_type),
  KEY idx_cp_submissions_user (user_id),
  CONSTRAINT fk_submissions_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_submissions_user   FOREIGN KEY (user_id)   REFERENCES cp_portal_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── THERAPEUTIC AREAS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_therapeutic_areas (
  id            INT          NOT NULL AUTO_INCREMENT,
  client_id     INT          NOT NULL,
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(255) NOT NULL,
  short_desc    TEXT         NULL,
  content       MEDIUMTEXT   NULL,
  image_url     TEXT         NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  display_order INT          NOT NULL DEFAULT 0,
  status        VARCHAR(50)  NOT NULL DEFAULT 'draft',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_therapeutic_areas (client_id, slug),
  CONSTRAINT fk_ta_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── DRUGS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_drugs (
  id                   INT          NOT NULL AUTO_INCREMENT,
  client_id            INT          NOT NULL,
  therapeutic_area_id  INT          NULL,
  brand_name           VARCHAR(255) NOT NULL,
  generic_name         VARCHAR(255) NULL,
  indication           TEXT         NULL,
  prescribing_info_url TEXT         NULL,
  storage_conditions   TEXT         NULL,
  dosage_info          TEXT         NULL,
  contraindications    TEXT         NULL,
  side_effects         TEXT         NULL,
  image_url            TEXT         NULL,
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  display_order        INT          NOT NULL DEFAULT 0,
  status               VARCHAR(50)  NOT NULL DEFAULT 'draft',
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_drugs_client FOREIGN KEY (client_id)          REFERENCES cp_clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_drugs_ta     FOREIGN KEY (therapeutic_area_id) REFERENCES cp_therapeutic_areas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── EVENTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_events (
  id               INT          NOT NULL AUTO_INCREMENT,
  client_id        INT          NOT NULL,
  title            VARCHAR(500) NOT NULL,
  description      TEXT         NULL,
  event_type       VARCHAR(50)  NOT NULL DEFAULT 'conference',
  venue            VARCHAR(255) NULL,
  city             VARCHAR(100) NULL,
  country          VARCHAR(100) NULL,
  start_date       DATETIME     NULL,
  end_date         DATETIME     NULL,
  registration_url TEXT         NULL,
  image_url        TEXT         NULL,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  is_featured      TINYINT(1)   NOT NULL DEFAULT 0,
  display_order    INT          NOT NULL DEFAULT 0,
  status           VARCHAR(50)  NOT NULL DEFAULT 'draft',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_events_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── MSLs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_msls (
  id                INT          NOT NULL AUTO_INCREMENT,
  client_id         INT          NOT NULL,
  name              VARCHAR(255) NOT NULL,
  title             VARCHAR(255) NULL,
  specialty         VARCHAR(255) NULL,
  region            VARCHAR(255) NULL,
  territory         VARCHAR(255) NULL,
  email             VARCHAR(255) NULL,
  phone             VARCHAR(50)  NULL,
  profile_image_url TEXT         NULL,
  therapeutic_areas TEXT         NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  display_order     INT          NOT NULL DEFAULT 0,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_msls_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── RESOURCES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_resources (
  id            INT          NOT NULL AUTO_INCREMENT,
  client_id     INT          NOT NULL,
  title         VARCHAR(500) NOT NULL,
  description   TEXT         NULL,
  resource_type VARCHAR(50)  NOT NULL DEFAULT 'document',
  url           TEXT         NULL,
  file_path     TEXT         NULL,
  category      VARCHAR(255) NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  display_order INT          NOT NULL DEFAULT 0,
  status        VARCHAR(50)  NOT NULL DEFAULT 'draft',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_resources_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── CHATBOX CONFIG ─────────────────────────────────────────────
-- api_key is present from the start here (0005 added it to older databases).
CREATE TABLE IF NOT EXISTS cp_chatbox_config (
  id              INT          NOT NULL AUTO_INCREMENT,
  client_id       INT          NOT NULL UNIQUE,
  ai_provider     VARCHAR(50)  NOT NULL DEFAULT 'anthropic',
  model           VARCHAR(100) NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  system_prompt   MEDIUMTEXT   NULL,
  welcome_message VARCHAR(500) NOT NULL DEFAULT 'Hello! How can I help you today?',
  max_tokens      INT          NOT NULL DEFAULT 1024,
  api_key         TEXT         NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_chatbox_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── TEMPLATES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_templates (
  id         INT          NOT NULL AUTO_INCREMENT,
  client_id  INT          NOT NULL,
  name       VARCHAR(255) NOT NULL,
  subject    VARCHAR(500) NULL,
  body       MEDIUMTEXT   NOT NULL,
  category   VARCHAR(100) NULL,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_templates_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── GATE CONFIG ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_gate_config (
  id                 INT          NOT NULL AUTO_INCREMENT,
  client_id          INT          NOT NULL UNIQUE,
  is_enabled         TINYINT(1)   NOT NULL DEFAULT 0,
  gate_title         VARCHAR(500) NOT NULL DEFAULT 'Welcome — Please Identify Yourself',
  gate_subtitle      TEXT         NULL,
  disclaimer_text    TEXT         NULL,
  require_disclaimer TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_gate_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── GATE USER TYPES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_gate_user_types (
  id            INT          NOT NULL AUTO_INCREMENT,
  client_id     INT          NOT NULL,
  type_key      VARCHAR(100) NOT NULL,
  label         VARCHAR(255) NOT NULL,
  description   TEXT         NULL,
  icon          VARCHAR(20)  NOT NULL DEFAULT '👤',
  display_order INT          NOT NULL DEFAULT 0,
  is_enabled    TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gate_user_types (client_id, type_key),
  CONSTRAINT fk_gut_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── FEATURE ACCESS MATRIX ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_feature_access (
  id          INT          NOT NULL AUTO_INCREMENT,
  client_id   INT          NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  type_key    VARCHAR(100) NOT NULL,
  is_allowed  TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_feature_access (client_id, feature_key, type_key),
  CONSTRAINT fk_fa_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── COMPLIANCE CONFIG ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_compliance_config (
  id                 INT          NOT NULL AUTO_INCREMENT,
  client_id          INT          NOT NULL UNIQUE,
  jurisdictions_json TEXT         NULL,
  banner_config_json TEXT         NULL,
  version            VARCHAR(20)  NOT NULL DEFAULT 'v1.0',
  require_reconsent  TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_compliance_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── CONSENT RECORDS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_consent_records (
  id           INT          NOT NULL AUTO_INCREMENT,
  client_id    INT          NOT NULL,
  user_id      INT          NULL,
  ip_hash      VARCHAR(255) NULL,
  version      VARCHAR(20)  NOT NULL,
  choices_json TEXT         NULL,
  consented_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cp_consent_client (client_id),
  KEY idx_cp_consent_user (user_id),
  CONSTRAINT fk_consent_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_consent_user   FOREIGN KEY (user_id)   REFERENCES cp_portal_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── DOCUMENT CATEGORIES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_document_categories (
  id         INT          NOT NULL AUTO_INCREMENT,
  client_id  INT          NOT NULL,
  name       VARCHAR(255) NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_doc_categories (client_id, name),
  CONSTRAINT fk_doccat_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── DOCUMENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_documents (
  id                INT          NOT NULL AUTO_INCREMENT,
  client_id         INT          NOT NULL,
  title             VARCHAR(500) NOT NULL,
  category          VARCHAR(255) NULL,
  doc_type          VARCHAR(50)  NOT NULL DEFAULT 'other',
  file_path         TEXT         NOT NULL,
  file_name         VARCHAR(500) NOT NULL,
  file_size         INT          NOT NULL DEFAULT 0,
  mime_type         VARCHAR(100) NOT NULL,
  visible_to_json   TEXT         NULL,
  source            VARCHAR(50)  NOT NULL DEFAULT 'manual',
  mims_ref_id       VARCHAR(255) NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  status            VARCHAR(50)  NOT NULL DEFAULT 'draft',
  expires_at        DATETIME     NULL,
  version           VARCHAR(50)  NULL,
  download_count    INT          NOT NULL DEFAULT 0,
  translations_json MEDIUMTEXT   NULL,
  publish_at        DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cp_docs_client (client_id),
  CONSTRAINT fk_docs_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── NEWS POSTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_news_posts (
  id                INT          NOT NULL AUTO_INCREMENT,
  client_id         INT          NOT NULL,
  title             VARCHAR(500) NOT NULL,
  body_html         MEDIUMTEXT   NULL,
  category          VARCHAR(255) NULL,
  thumbnail_path    TEXT         NULL,
  target_types_json TEXT         NULL,
  status            VARCHAR(50)  NOT NULL DEFAULT 'draft',
  publish_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  view_count        INT          NOT NULL DEFAULT 0,
  is_pinned         TINYINT(1)   NOT NULL DEFAULT 0,
  translations_json MEDIUMTEXT   NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cp_news_client (client_id),
  KEY idx_cp_news_status (status),
  CONSTRAINT fk_news_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── SAFETY ALERTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_safety_alerts (
  id                INT          NOT NULL AUTO_INCREMENT,
  client_id         INT          NOT NULL,
  title             VARCHAR(500) NOT NULL,
  alert_type        VARCHAR(100) NOT NULL DEFAULT 'other',
  severity          VARCHAR(50)  NOT NULL DEFAULT 'informational',
  product_name      VARCHAR(255) NULL,
  ref_number        VARCHAR(255) NULL,
  body_html         MEDIUMTEXT   NULL,
  effective_date    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  target_types_json TEXT         NULL,
  attachment_path   TEXT         NULL,
  attachment_name   VARCHAR(500) NULL,
  status            VARCHAR(50)  NOT NULL DEFAULT 'active',
  view_count        INT          NOT NULL DEFAULT 0,
  translations_json MEDIUMTEXT   NULL,
  publish_at        DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cp_safety_client (client_id),
  KEY idx_cp_safety_status (status),
  KEY idx_cp_safety_severity (severity),
  CONSTRAINT fk_safety_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── AUDIT LOGS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_audit_logs (
  id         INT          NOT NULL AUTO_INCREMENT,
  admin_id   INT          NULL,
  admin_name VARCHAR(255) NULL,
  client_id  INT          NULL,
  action     VARCHAR(100) NOT NULL,
  entity     VARCHAR(100) NOT NULL,
  entity_id  INT          NULL,
  details    TEXT         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cp_audit_created (created_at),
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES cp_admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── MIMS TOKEN CACHE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_mims_token_cache (
  integration_id INT      NOT NULL PRIMARY KEY,
  access_token   TEXT     NOT NULL,
  expires_at     DATETIME NOT NULL,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── SAVED ITEMS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_saved_items (
  id             INT         NOT NULL AUTO_INCREMENT,
  portal_user_id INT         NOT NULL,
  client_id      INT         NOT NULL,
  item_type      VARCHAR(50) NOT NULL,
  item_id        INT         NOT NULL,
  created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_saved_items (portal_user_id, item_type, item_id),
  CONSTRAINT fk_saved_user   FOREIGN KEY (portal_user_id) REFERENCES cp_portal_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_client FOREIGN KEY (client_id)      REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── NOTIFICATIONS ──────────────────────────────────────────────
-- uq_notif_dedup is present from the start here (0005 added it to older databases,
-- after clearing the duplicate rows that had accumulated without it).
CREATE TABLE IF NOT EXISTS cp_notifications (
  id             INT          NOT NULL AUTO_INCREMENT,
  portal_user_id INT          NOT NULL,
  client_id      INT          NOT NULL,
  type           VARCHAR(50)  NOT NULL,
  title          VARCHAR(500) NOT NULL,
  item_id        INT          NOT NULL,
  is_read        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notif_dedup (portal_user_id, type, item_id),
  KEY idx_cp_notif_user (portal_user_id, is_read),
  CONSTRAINT fk_notif_user   FOREIGN KEY (portal_user_id) REFERENCES cp_portal_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_client FOREIGN KEY (client_id)      REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── SSO PROVIDER CONFIGS & IDENTITIES ─────────────────────────
-- These follow migration 0008, NOT the definitions in db.js, which have drifted
-- from it (VARCHAR widths, TEXT vs JSON for allowed_domains, is_active default 1
-- vs 0, and different unique-key names). 0008 is authoritative because every
-- deployed database got these tables from it, and because routes/admin/sso.js
-- calls .join() on allowed_domains, which only works when the driver parses it as
-- a JSON column. The db.js copies are a latent defect tracked separately.
CREATE TABLE IF NOT EXISTS cp_sso_provider_configs (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  client_id               INT NOT NULL,
  provider_key            VARCHAR(30)  NOT NULL,
  provider_type           VARCHAR(30)  NOT NULL DEFAULT 'oidc',
  oidc_client_id          VARCHAR(500) NULL,
  client_secret_encrypted TEXT NULL,
  tenant_id               VARCHAR(255) NULL,
  allowed_domains         JSON NULL,
  is_active               TINYINT(1) NOT NULL DEFAULT 0,
  updated_by              INT NULL,
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_client_provider (client_id, provider_key),
  CONSTRAINT fk_sso_cfg_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
);

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

-- ── CLINICAL TRIALS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_clinical_trials (
  id            INT          NOT NULL AUTO_INCREMENT,
  client_id     INT          NOT NULL,
  nct_id        VARCHAR(50)  NOT NULL,
  title         VARCHAR(500) NOT NULL,
  phase         VARCHAR(50)  NOT NULL,
  indication    VARCHAR(255) NOT NULL,
  status        VARCHAR(50)  NOT NULL DEFAULT 'Recruiting',
  site_location VARCHAR(500) NULL,
  pi            VARCHAR(255) NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_trials_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── TRAINING MODULES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_training_modules (
  id         INT          NOT NULL AUTO_INCREMENT,
  client_id  INT          NOT NULL,
  title      VARCHAR(500) NOT NULL,
  type       VARCHAR(100) NOT NULL DEFAULT 'CME Accredited',
  duration   VARCHAR(50)  NOT NULL DEFAULT '30 mins',
  credits    VARCHAR(50)  NOT NULL DEFAULT '1.5 CME',
  pass_score INT          NOT NULL DEFAULT 80,
  status     VARCHAR(50)  NOT NULL DEFAULT 'Available',
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_training_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── EMAIL CONFIG ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_email_config (
  id              INT          NOT NULL AUTO_INCREMENT,
  client_id       INT          NOT NULL UNIQUE,
  smtp_host       VARCHAR(255) NULL,
  smtp_port       INT          NOT NULL DEFAULT 587,
  smtp_encryption VARCHAR(20)  NOT NULL DEFAULT 'STARTTLS',
  smtp_username   VARCHAR(255) NULL,
  smtp_password   TEXT         NULL,
  from_email      VARCHAR(255) NULL,
  from_name       VARCHAR(255) NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_emailcfg_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── FEEDBACK ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_feedback (
  id           INT      NOT NULL AUTO_INCREMENT,
  client_id    INT      NOT NULL,
  user_id      INT      NULL,
  rating       TINYINT  NOT NULL,
  message      TEXT     NULL,
  page_url     TEXT     NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_feedback_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_user   FOREIGN KEY (user_id)   REFERENCES cp_portal_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── FAQ ITEMS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_faq_items (
  id                INT          NOT NULL AUTO_INCREMENT,
  client_id         INT          NOT NULL,
  question          TEXT         NOT NULL,
  answer            MEDIUMTEXT   NOT NULL,
  category          VARCHAR(255) NULL,
  sort_order        INT          NOT NULL DEFAULT 0,
  is_published      TINYINT(1)   NOT NULL DEFAULT 1,
  translations_json MEDIUMTEXT   NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_faq_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── MSL BOOKINGS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_msl_bookings (
  id                  INT          NOT NULL AUTO_INCREMENT,
  client_id           INT          NOT NULL,
  msl_id              INT          NOT NULL,
  portal_user_id      INT          NULL,
  requester_name      VARCHAR(255) NOT NULL,
  requester_email     VARCHAR(255) NOT NULL,
  requester_user_type VARCHAR(100) NULL,
  preferred_date      DATETIME     NULL,
  topic               TEXT         NULL,
  message             TEXT         NULL,
  status              VARCHAR(50)  NOT NULL DEFAULT 'pending',
  admin_notes         TEXT         NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_bookings_client FOREIGN KEY (client_id)     REFERENCES cp_clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_bookings_msl    FOREIGN KEY (msl_id)        REFERENCES cp_msls(id) ON DELETE CASCADE,
  CONSTRAINT fk_bookings_user   FOREIGN KEY (portal_user_id) REFERENCES cp_portal_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── MSL AVAILABILITY SLOTS (from 0002) ─────────────────────────
CREATE TABLE IF NOT EXISTS cp_msl_slots (
  id         INT        NOT NULL AUTO_INCREMENT,
  client_id  INT        NOT NULL,
  msl_id     INT        NOT NULL,
  starts_at  DATETIME   NOT NULL,
  ends_at    DATETIME   NOT NULL,
  is_booked  TINYINT(1) NOT NULL DEFAULT 0,
  booking_id INT        NULL,
  created_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_slots_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_slots_msl    FOREIGN KEY (msl_id)    REFERENCES cp_msls(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── SUBMISSION ATTACHMENTS (from 0003) ─────────────────────────
CREATE TABLE IF NOT EXISTS cp_submission_attachments (
  id            INT          NOT NULL AUTO_INCREMENT,
  submission_id INT          NOT NULL,
  client_id     INT          NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  file_path     VARCHAR(500) NOT NULL,
  file_size     INT          NULL,
  mime_type     VARCHAR(120) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_subatt_submission (submission_id),
  CONSTRAINT fk_subatt_sub    FOREIGN KEY (submission_id) REFERENCES cp_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_subatt_client FOREIGN KEY (client_id)     REFERENCES cp_clients(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── USER FOLLOWS (from 0004) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS cp_user_follows (
  id             INT         NOT NULL AUTO_INCREMENT,
  portal_user_id INT         NOT NULL,
  client_id      INT         NOT NULL,
  item_type      VARCHAR(40) NOT NULL,
  item_id        INT         NOT NULL,
  created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_follow (portal_user_id, item_type, item_id),
  CONSTRAINT fk_follow_user   FOREIGN KEY (portal_user_id) REFERENCES cp_portal_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_client FOREIGN KEY (client_id)      REFERENCES cp_clients(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── WEEKLY DIGEST STATE (from 0002) ────────────────────────────
CREATE TABLE IF NOT EXISTS cp_digest_state (
  client_id      INT         NOT NULL,
  last_sent_week VARCHAR(12) NULL,
  last_sent_at   DATETIME    NULL,
  PRIMARY KEY (client_id),
  CONSTRAINT fk_digest_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── DATA-SUBJECT REQUESTS (from 0010) ──────────────────────────
-- Defined only in 0010, never in db.js. Reproduced verbatim, including the
-- absence of foreign keys.
CREATE TABLE IF NOT EXISTS cp_data_requests (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  client_id       INT NOT NULL,
  portal_user_id  INT NULL,
  request_type    VARCHAR(20) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  requester_email VARCHAR(255) NULL,
  requester_name  VARCHAR(255) NULL,
  notes           TEXT NULL,
  requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fulfilled_at    DATETIME NULL,
  fulfilled_by    VARCHAR(255) NULL,
  KEY idx_dr_client_status (client_id, status),
  KEY idx_dr_user (portal_user_id)
);

-- ── AE REVIEW TASKS (from 0011) ────────────────────────────────
-- Defined only in 0011, never in db.js. Reproduced verbatim, including the
-- absence of foreign keys.
CREATE TABLE IF NOT EXISTS cp_ae_review_tasks (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  client_id       INT NOT NULL,
  submission_id   INT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'open',
  outcome         VARCHAR(30) NULL,
  outcome_reason  TEXT NULL,
  reported_detail TEXT NULL,
  closed_by       INT NULL,
  closed_at       DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ae_task_submission (submission_id),
  KEY idx_ae_task_client_status (client_id, status)
);

-- ── RECORD 0002-0012 AS APPLIED ────────────────────────────────
-- Everything those files do is already included above, and re-running them on the
-- schema created here would fail on duplicate columns and keys. On an existing
-- database these rows are already present, so INSERT IGNORE leaves them untouched
-- along with their real checksums and applied_at timestamps.
-- 0001 is deliberately not listed: it only creates cp_schema_migrations with
-- IF NOT EXISTS, so it is safe to let it run and be recorded normally.
INSERT IGNORE INTO cp_schema_migrations (filename, checksum) VALUES
  ('0002_add_digest_and_msl_slots.sql',      NULL),
  ('0003_add_submission_attachments.sql',    NULL),
  ('0004_add_user_follows.sql',              NULL),
  ('0005_fix_chatbox_forms_notifications.sql', NULL),
  ('0006_add_password_reset.sql',            NULL),
  ('0007_add_token_version.sql',             NULL),
  ('0008_add_sso.sql',                       NULL),
  ('0009_add_mims_case_url_base.sql',        NULL),
  ('0010_add_data_requests.sql',             NULL),
  ('0011_add_ae_review_tasks.sql',           NULL),
  ('0012_add_trials_and_training.sql',       NULL);
