/**
 * db.js — CP Portal MySQL Database (mysql2/promise)
 *
 * Fully configuration-driven schema.
 * Every client (pharma company) gets their own configuration rows —
 * branding, features, form fields, content, integration settings.
 */

const mysql  = require('mysql2/promise');
const bcrypt = require('bcrypt');

const pool = mysql.createPool({
  host              : process.env.MYSQL_HOST     || 'localhost',
  port              : parseInt(process.env.MYSQL_PORT || '3306'),
  user              : process.env.MYSQL_USER     || 'devuser',
  password          : process.env.MYSQL_PASSWORD || 'devpass',
  database          : process.env.MYSQL_DATABASE || 'pharaxis_cp_portal_dev',
  waitForConnections: true,
  connectionLimit   : 10,
  charset           : 'utf8mb4',
  // TZ: interpret/emit DATETIME values as UTC so the API always sends ISO-8601
  // with a trailing Z. The browser then converts each instant to the viewer's
  // local timezone (with correct DST) at display time.
  timezone          : 'Z',
});

// Pin every pooled connection's session timezone to UTC so CURRENT_TIMESTAMP /
// NOW() / UTC_TIMESTAMP() all produce UTC regardless of the DB server's system
// timezone (our dev server runs on IST). This makes all NEW writes UTC-correct.
// NOTE: rows written before this change are in the server's old local time and
// require a one-time migration to UTC — tracked separately.
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

async function run(sql) {
  await pool.query(sql);
}

// MySQL does not support CREATE INDEX IF NOT EXISTS — ignore duplicate-index errors (errno 1061)
async function runIndex(sql) {
  try {
    await pool.query(sql.replace(' IF NOT EXISTS ', ' '));
  } catch (err) {
    if (err.errno !== 1061) throw err;
  }
}

async function initializeDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS cp_schema_bootstrap_state (
      id INT NOT NULL PRIMARY KEY,
      version_tag VARCHAR(50) NOT NULL,
      completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [[bootstrapState]] = await pool.execute(
    'SELECT id, version_tag, completed_at FROM cp_schema_bootstrap_state WHERE id = 1 LIMIT 1'
  );
  if (bootstrapState?.completed_at) {
    console.log('✅ CP Portal schema bootstrap already completed — skipping legacy bootstrap');
    return;
  }

  // ── ADMIN USERS ────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_admin_users (
      id         INT          NOT NULL AUTO_INCREMENT,
      name       VARCHAR(255) NOT NULL,
      email      VARCHAR(255) NOT NULL UNIQUE,
      password   TEXT         NOT NULL,
      role       VARCHAR(50)  NOT NULL DEFAULT 'admin',
      is_active  TINYINT(1)   NOT NULL DEFAULT 1,
      client_id  INT          NULL,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Seed local superadmin only on first insert; production must provide an explicit bootstrap password.
  const DEFAULT_EMAIL    = 'cpadmin';
  const DEFAULT_PASSWORD = String(process.env.CP_BOOTSTRAP_SUPERADMIN_PASSWORD || '').trim();
  const [[existing]] = await pool.execute('SELECT id FROM cp_admin_users WHERE email = ?', [DEFAULT_EMAIL]);
  if (existing) {
    await pool.execute(
      `UPDATE cp_admin_users SET name=?, role='superadmin', is_active=1 WHERE id=?`,
      ['CP Superadmin', existing.id]
    );
  } else {
    if (!DEFAULT_PASSWORD) throw new Error('CP_BOOTSTRAP_SUPERADMIN_PASSWORD is required before seeding CP Portal superadmin.');
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    await pool.execute(
      `INSERT INTO cp_admin_users (name, email, password, role) VALUES (?, ?, ?, 'superadmin')`,
      ['CP Superadmin', DEFAULT_EMAIL, hash]
    );
  }

  // ── CLIENTS ────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_clients (
      id                   INT          NOT NULL AUTO_INCREMENT,
      name                 VARCHAR(255) NOT NULL,
      code                 VARCHAR(100) NOT NULL UNIQUE,
      description          TEXT         NULL,
      contact_name         VARCHAR(255) NULL,
      contact_email        VARCHAR(255) NULL,
      is_active            TINYINT(1)   NOT NULL DEFAULT 1,
      language_config_json VARCHAR(500) NOT NULL DEFAULT '{"default":"en","enabled":["en"]}',
      created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Add FK for cp_admin_users.client_id → cp_clients (after cp_clients is created)
  // Using IF NOT EXISTS check to avoid re-adding on restart
  await pool.query(`
    ALTER TABLE cp_admin_users
    ADD CONSTRAINT fk_admin_client
    FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE SET NULL
  `).catch(() => {}); // ignore if constraint already exists (errno 1826 / ER_DUP_CONSTRAINT_NAME)

  // ── BRANDING ───────────────────────────────────────────────────
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── FEATURES ───────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_features (
      id             INT          NOT NULL AUTO_INCREMENT,
      client_id      INT          NOT NULL,
      feature_key    VARCHAR(100) NOT NULL,
      is_enabled     TINYINT(1)   NOT NULL DEFAULT 1,
      display_name   VARCHAR(255) NULL,
      display_order  INT          NOT NULL DEFAULT 0,
      icon           VARCHAR(100) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_features (client_id, feature_key),
      CONSTRAINT fk_features_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── FORM CONFIG ────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_form_config (
      id             INT          NOT NULL AUTO_INCREMENT,
      client_id      INT          NOT NULL,
      form_type      VARCHAR(100) NOT NULL,
      field_key      VARCHAR(100) NOT NULL,
      field_label    VARCHAR(255) NOT NULL,
      field_type     VARCHAR(50)  NOT NULL DEFAULT 'text',
      field_options  TEXT         NULL,
      placeholder    TEXT         NULL,
      help_text      TEXT         NULL,
      is_required    TINYINT(1)   NOT NULL DEFAULT 0,
      is_active      TINYINT(1)   NOT NULL DEFAULT 1,
      display_order  INT          NOT NULL DEFAULT 0,
      updated_at     DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_form_config (client_id, form_type, field_key),
      CONSTRAINT fk_form_config_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── INTEGRATION CONFIG ─────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_integration_config (
      id               INT          NOT NULL AUTO_INCREMENT,
      client_id        INT          NOT NULL,
      system_name      VARCHAR(100) NOT NULL DEFAULT 'MIMS',
      api_base_url     TEXT         NULL,
      api_key          TEXT         NULL,
      api_secret       TEXT         NULL,
      auth_type        VARCHAR(50)  NOT NULL DEFAULT 'bearer',
      extra_headers    TEXT         NULL,
      is_active        TINYINT(1)   NOT NULL DEFAULT 0,
      last_sync_at     DATETIME     NULL,
      last_sync_status VARCHAR(50)  NOT NULL DEFAULT 'unknown',
      last_sync_error  TEXT         NULL,
      created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT fk_integration_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── FIELD MAPPING ──────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_field_mapping (
      id               INT          NOT NULL AUTO_INCREMENT,
      client_id        INT          NOT NULL,
      integration_id   INT          NOT NULL,
      form_type        VARCHAR(100) NOT NULL,
      cp_field         VARCHAR(100) NOT NULL,
      target_field     VARCHAR(100) NOT NULL,
      transform        VARCHAR(100) NULL,
      default_value    TEXT         NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_field_mapping (client_id, integration_id, form_type, cp_field),
      CONSTRAINT fk_mapping_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_mapping_integration FOREIGN KEY (integration_id) REFERENCES cp_integration_config(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── PORTAL USERS ───────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_portal_users (
      id                               INT          NOT NULL AUTO_INCREMENT,
      client_id                        INT          NOT NULL,
      first_name                       VARCHAR(255) NOT NULL,
      last_name                        VARCHAR(255) NOT NULL,
      email                            VARCHAR(255) NOT NULL,
      password                         TEXT         NOT NULL,
      user_type                        VARCHAR(50)  NOT NULL DEFAULT 'other',
      specialty                        VARCHAR(255) NULL,
      country                          VARCHAR(100) NULL,
      phone                            VARCHAR(50)  NULL,
      is_active                        TINYINT(1)   NOT NULL DEFAULT 1,
      is_verified                      TINYINT(1)   NOT NULL DEFAULT 0,
      user_type_confirmed              TINYINT(1)   NOT NULL DEFAULT 0,
      last_login_at                    DATETIME     NULL,
      notif_prefs_json                 VARCHAR(500) NOT NULL DEFAULT '{"news":true,"documents":true,"safety":true}',
      email_verified                   TINYINT(1)   NOT NULL DEFAULT 1,
      verification_token               VARCHAR(255) NULL,
      verification_token_expires_at    DATETIME     NULL,
      created_at                       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_portal_users (client_id, email),
      CONSTRAINT fk_portal_users_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── SUBMISSIONS ────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_submissions (
      id               INT          NOT NULL AUTO_INCREMENT,
      client_id        INT          NOT NULL,
      submission_type  VARCHAR(100) NOT NULL,
      user_id          INT          NULL,
      submitter_name   VARCHAR(255) NULL,
      submitter_email  VARCHAR(255) NULL,
      submitter_type   VARCHAR(100) NULL,
      form_data        MEDIUMTEXT   NOT NULL,
      status           VARCHAR(50)  NOT NULL DEFAULT 'submitted',
      external_ref     VARCHAR(255) NULL,
      sync_attempts    INT          NOT NULL DEFAULT 0,
      sync_error       TEXT         NULL,
      ip_address       VARCHAR(100) NULL,
      submitted_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      synced_at        DATETIME     NULL,
      updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT fk_submissions_client  FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_submissions_user    FOREIGN KEY (user_id)   REFERENCES cp_portal_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_submissions_client ON cp_submissions(client_id)`);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_submissions_status ON cp_submissions(status)`);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_submissions_type   ON cp_submissions(submission_type)`);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_submissions_user   ON cp_submissions(user_id)`);

  // ── THERAPEUTIC AREAS ──────────────────────────────────────────
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── DRUGS ──────────────────────────────────────────────────────
  await run(`
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
      CONSTRAINT fk_drugs_client FOREIGN KEY (client_id)           REFERENCES cp_clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_drugs_ta    FOREIGN KEY (therapeutic_area_id)  REFERENCES cp_therapeutic_areas(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── EVENTS ─────────────────────────────────────────────────────
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── MSLs ───────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_msls (
      id                 INT          NOT NULL AUTO_INCREMENT,
      client_id          INT          NOT NULL,
      name               VARCHAR(255) NOT NULL,
      title              VARCHAR(255) NULL,
      specialty          VARCHAR(255) NULL,
      region             VARCHAR(255) NULL,
      territory          VARCHAR(255) NULL,
      email              VARCHAR(255) NULL,
      phone              VARCHAR(50)  NULL,
      profile_image_url  TEXT         NULL,
      therapeutic_areas  TEXT         NULL,
      is_active          TINYINT(1)   NOT NULL DEFAULT 1,
      display_order      INT          NOT NULL DEFAULT 0,
      created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT fk_msls_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── RESOURCES ──────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_resources (
      id             INT          NOT NULL AUTO_INCREMENT,
      client_id      INT          NOT NULL,
      title          VARCHAR(500) NOT NULL,
      description    TEXT         NULL,
      resource_type  VARCHAR(50)  NOT NULL DEFAULT 'document',
      url            TEXT         NULL,
      file_path      TEXT         NULL,
      category       VARCHAR(255) NULL,
      is_active      TINYINT(1)   NOT NULL DEFAULT 1,
      display_order  INT          NOT NULL DEFAULT 0,
      status         VARCHAR(50)  NOT NULL DEFAULT 'draft',
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT fk_resources_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── CHATBOX CONFIG ─────────────────────────────────────────────
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── TEMPLATES ──────────────────────────────────────────────────
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── GATE CONFIG ────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_gate_config (
      id                  INT          NOT NULL AUTO_INCREMENT,
      client_id           INT          NOT NULL UNIQUE,
      is_enabled          TINYINT(1)   NOT NULL DEFAULT 0,
      gate_title          VARCHAR(500) NOT NULL DEFAULT 'Welcome — Please Identify Yourself',
      gate_subtitle       TEXT         NULL,
      disclaimer_text     TEXT         NULL,
      require_disclaimer  TINYINT(1)   NOT NULL DEFAULT 1,
      updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT fk_gate_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── GATE USER TYPES ────────────────────────────────────────────
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── FEATURE ACCESS MATRIX ──────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_feature_access (
      id          INT          NOT NULL AUTO_INCREMENT,
      client_id   INT          NOT NULL,
      feature_key VARCHAR(100) NOT NULL,
      type_key    VARCHAR(100) NOT NULL,
      is_allowed  TINYINT(1)   NOT NULL DEFAULT 1,
      PRIMARY KEY (id),
      UNIQUE KEY uq_feature_access (client_id, feature_key, type_key),
      CONSTRAINT fk_fa_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── COMPLIANCE CONFIG ──────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_compliance_config (
      id                  INT          NOT NULL AUTO_INCREMENT,
      client_id           INT          NOT NULL UNIQUE,
      jurisdictions_json  TEXT         NULL,
      banner_config_json  TEXT         NULL,
      version             VARCHAR(20)  NOT NULL DEFAULT 'v1.0',
      require_reconsent   TINYINT(1)   NOT NULL DEFAULT 0,
      updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT fk_compliance_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── CONSENT RECORDS ────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_consent_records (
      id           INT      NOT NULL AUTO_INCREMENT,
      client_id    INT      NOT NULL,
      user_id      INT      NULL,
      ip_hash      VARCHAR(255) NULL,
      version      VARCHAR(20)  NOT NULL,
      choices_json TEXT     NULL,
      consented_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT fk_consent_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_consent_user   FOREIGN KEY (user_id)   REFERENCES cp_portal_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_consent_client ON cp_consent_records(client_id)`);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_consent_user   ON cp_consent_records(user_id)`);

  // ── DOCUMENT CATEGORIES ────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_document_categories (
      id         INT          NOT NULL AUTO_INCREMENT,
      client_id  INT          NOT NULL,
      name       VARCHAR(255) NOT NULL,
      sort_order INT          NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uq_doc_categories (client_id, name),
      CONSTRAINT fk_doccat_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── DOCUMENTS ──────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_documents (
      id               INT          NOT NULL AUTO_INCREMENT,
      client_id        INT          NOT NULL,
      title            VARCHAR(500) NOT NULL,
      category         VARCHAR(255) NULL,
      doc_type         VARCHAR(50)  NOT NULL DEFAULT 'other',
      file_path        TEXT         NOT NULL,
      file_name        VARCHAR(500) NOT NULL,
      file_size        INT          NOT NULL DEFAULT 0,
      mime_type        VARCHAR(100) NOT NULL,
      visible_to_json  TEXT         NULL,
      source           VARCHAR(50)  NOT NULL DEFAULT 'manual',
      mims_ref_id      VARCHAR(255) NULL,
      is_active        TINYINT(1)   NOT NULL DEFAULT 1,
      status           VARCHAR(50)  NOT NULL DEFAULT 'draft',
      expires_at       DATETIME     NULL,
      version          VARCHAR(50)  NULL,
      download_count   INT          NOT NULL DEFAULT 0,
      translations_json MEDIUMTEXT  NULL,
      publish_at       DATETIME     NULL,
      created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT fk_docs_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_docs_client ON cp_documents(client_id)`);

  // ── NEWS POSTS ─────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_news_posts (
      id                  INT          NOT NULL AUTO_INCREMENT,
      client_id           INT          NOT NULL,
      title               VARCHAR(500) NOT NULL,
      body_html           MEDIUMTEXT   NULL,
      category            VARCHAR(255) NULL,
      thumbnail_path      TEXT         NULL,
      target_types_json   TEXT         NULL,
      status              VARCHAR(50)  NOT NULL DEFAULT 'draft',
      publish_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      view_count          INT          NOT NULL DEFAULT 0,
      is_pinned           TINYINT(1)   NOT NULL DEFAULT 0,
      translations_json   MEDIUMTEXT   NULL,
      created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT fk_news_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_news_client ON cp_news_posts(client_id)`);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_news_status ON cp_news_posts(status)`);

  // ── SAFETY ALERTS ──────────────────────────────────────────────
  await run(`
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
      CONSTRAINT fk_safety_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_safety_client   ON cp_safety_alerts(client_id)`);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_safety_status   ON cp_safety_alerts(status)`);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_safety_severity ON cp_safety_alerts(severity)`);

  // ── AUDIT LOGS ─────────────────────────────────────────────────
  await run(`
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
      CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES cp_admin_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_audit_created ON cp_audit_logs(created_at)`);

  // ── SAVED ITEMS ────────────────────────────────────────────────
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── NOTIFICATIONS ──────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_notifications (
      id             INT         NOT NULL AUTO_INCREMENT,
      portal_user_id INT         NOT NULL,
      client_id      INT         NOT NULL,
      type           VARCHAR(50) NOT NULL,
      title          VARCHAR(500) NOT NULL,
      item_id        INT         NOT NULL,
      is_read        TINYINT(1)  NOT NULL DEFAULT 0,
      created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_notif_dedup (portal_user_id, type, item_id),
      CONSTRAINT fk_notif_user   FOREIGN KEY (portal_user_id) REFERENCES cp_portal_users(id) ON DELETE CASCADE,
      CONSTRAINT fk_notif_client FOREIGN KEY (client_id)      REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await runIndex(`CREATE INDEX IF NOT EXISTS idx_cp_notif_user ON cp_notifications(portal_user_id, is_read)`);

  // ── EMAIL CONFIG ───────────────────────────────────────────────
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── FEEDBACK ───────────────────────────────────────────────────
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── FAQ ITEMS ──────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS cp_faq_items (
      id                INT      NOT NULL AUTO_INCREMENT,
      client_id         INT      NOT NULL,
      question          TEXT     NOT NULL,
      answer            MEDIUMTEXT NOT NULL,
      category          VARCHAR(255) NULL,
      sort_order        INT      NOT NULL DEFAULT 0,
      is_published      TINYINT(1)   NOT NULL DEFAULT 1,
      translations_json MEDIUMTEXT   NULL,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT fk_faq_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── MSL BOOKINGS ───────────────────────────────────────────────
  await run(`
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
      CONSTRAINT fk_bookings_client FOREIGN KEY (client_id)      REFERENCES cp_clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_bookings_msl    FOREIGN KEY (msl_id)          REFERENCES cp_msls(id) ON DELETE CASCADE,
      CONSTRAINT fk_bookings_user   FOREIGN KEY (portal_user_id)  REFERENCES cp_portal_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── MSL AVAILABILITY SLOTS ─────────────────────────────────────
  // Admin-defined bookable time slots per MSL (v1 — no external calendar sync).
  await run(`
    CREATE TABLE IF NOT EXISTS cp_msl_slots (
      id         INT       NOT NULL AUTO_INCREMENT,
      client_id  INT       NOT NULL,
      msl_id     INT       NOT NULL,
      starts_at  DATETIME  NOT NULL,
      ends_at    DATETIME  NOT NULL,
      is_booked  TINYINT(1) NOT NULL DEFAULT 0,
      booking_id INT       NULL,
      created_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT fk_slots_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_slots_msl    FOREIGN KEY (msl_id)    REFERENCES cp_msls(id)    ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── SUBMISSION ATTACHMENTS ─────────────────────────────────────
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── USER FOLLOWS (personalization) ─────────────────────────────
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── WEEKLY DIGEST STATE ────────────────────────────────────────
  // Tracks the last ISO week a digest was sent per client, so the scheduler
  // sends at most once per client per week.
  await run(`
    CREATE TABLE IF NOT EXISTS cp_digest_state (
      client_id      INT          NOT NULL,
      last_sent_week VARCHAR(12)  NULL,
      last_sent_at   DATETIME     NULL,
      PRIMARY KEY (client_id),
      CONSTRAINT fk_digest_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── SEED DEFAULT FORM FIELDS for active clients (safe — skips if already exist) ──
  const DEFAULT_FORM_FIELDS = {
    medical_inquiry: [
      { key: 'first_name',      label: 'First Name',          type: 'text',     required: 1, order: 1, placeholder: 'Enter your first name' },
      { key: 'last_name',       label: 'Last Name',           type: 'text',     required: 1, order: 2, placeholder: 'Enter your last name' },
      { key: 'email',           label: 'Email Address',       type: 'email',    required: 1, order: 3, placeholder: 'your@email.com' },
      { key: 'phone',           label: 'Phone Number',        type: 'phone',    required: 0, order: 4, placeholder: 'Optional' },
      { key: 'organization',    label: 'Organization',        type: 'text',     required: 0, order: 5, placeholder: 'Hospital, clinic, or company name' },
      { key: 'product_name',    label: 'Product / Drug Name', type: 'text',     required: 1, order: 6, placeholder: 'Name of the product' },
      { key: 'inquiry_details', label: 'Inquiry Details',     type: 'textarea', required: 1, order: 7, placeholder: 'Please describe your medical inquiry in detail' },
    ],
    adverse_event: [
      { key: 'first_name',        label: 'First Name',         type: 'text',     required: 1, order: 1, placeholder: 'Enter your first name' },
      { key: 'last_name',         label: 'Last Name',          type: 'text',     required: 1, order: 2, placeholder: 'Enter your last name' },
      { key: 'email',             label: 'Email Address',      type: 'email',    required: 1, order: 3, placeholder: 'your@email.com' },
      { key: 'phone',             label: 'Phone Number',       type: 'phone',    required: 0, order: 4, placeholder: 'Optional' },
      { key: 'product_name',      label: 'Product Name',       type: 'text',     required: 1, order: 5, placeholder: 'Product involved in the adverse event' },
      { key: 'lot_number',        label: 'Lot / Batch Number', type: 'text',     required: 0, order: 6, placeholder: 'If available' },
      { key: 'event_date',        label: 'Date of Event',      type: 'text',     required: 0, order: 7, placeholder: 'DD/MM/YYYY' },
      { key: 'event_description', label: 'Event Description',  type: 'textarea', required: 1, order: 8, placeholder: 'Describe the adverse event in detail' },
      { key: 'patient_age',       label: 'Patient Age',        type: 'text',     required: 0, order: 9, placeholder: 'Optional' },
    ],
    product_complaint: [
      { key: 'first_name',       label: 'First Name',          type: 'text',     required: 1, order: 1, placeholder: 'Enter your first name' },
      { key: 'last_name',        label: 'Last Name',           type: 'text',     required: 1, order: 2, placeholder: 'Enter your last name' },
      { key: 'email',            label: 'Email Address',       type: 'email',    required: 1, order: 3, placeholder: 'your@email.com' },
      { key: 'product_name',     label: 'Product Name',        type: 'text',     required: 1, order: 4, placeholder: 'Name of the product' },
      { key: 'lot_number',       label: 'Lot / Batch Number',  type: 'text',     required: 0, order: 5, placeholder: 'If available' },
      { key: 'complaint_details',label: 'Complaint Details',   type: 'textarea', required: 1, order: 6, placeholder: 'Describe the product complaint in detail' },
    ],
    other_inquiry: [
      { key: 'first_name',      label: 'First Name',      type: 'text',     required: 1, order: 1, placeholder: 'Enter your first name' },
      { key: 'last_name',       label: 'Last Name',       type: 'text',     required: 1, order: 2, placeholder: 'Enter your last name' },
      { key: 'email',           label: 'Email Address',   type: 'email',    required: 1, order: 3, placeholder: 'your@email.com' },
      { key: 'inquiry_details', label: 'Inquiry Details', type: 'textarea', required: 1, order: 4, placeholder: 'Please describe your inquiry' },
    ],
  };

  const [activeClients] = await pool.execute('SELECT id FROM cp_clients WHERE is_active = 1');
  for (const client of activeClients) {
    for (const [formType, fields] of Object.entries(DEFAULT_FORM_FIELDS)) {
      const [[{ cnt }]] = await pool.execute(
        'SELECT COUNT(*) as cnt FROM cp_form_config WHERE client_id = ? AND form_type = ?',
        [client.id, formType]
      );
      if (cnt === 0) {
        for (const f of fields) {
          await pool.execute(
            `INSERT IGNORE INTO cp_form_config
               (client_id, form_type, field_key, field_label, field_type, placeholder, is_required, is_active, display_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [client.id, formType, f.key, f.label, f.type, f.placeholder, f.required, f.order]
          );
        }
      }
    }
  }

  await pool.execute(
    `INSERT INTO cp_schema_bootstrap_state (id, version_tag)
     VALUES (1, 'legacy-bootstrap-v1')
     ON DUPLICATE KEY UPDATE version_tag = VALUES(version_tag), completed_at = NOW()`
  );

  console.log('✅ CP Portal database initialized — tables ready');
}

module.exports = { pool, initializeDatabase };
