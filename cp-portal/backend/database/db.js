/**
 * db.js — CP Portal SQLite Database
 *
 * Fully configuration-driven schema.
 * Every client (pharma company) gets their own configuration rows —
 * branding, features, form fields, content, integration settings.
 */

const Database = require('better-sqlite3');
const bcrypt   = require('bcrypt');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'cp-portal.db');
const db      = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function initializeDatabase() {

  // ── ADMIN USERS — CP Portal admin console users ───────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_admin_users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      email      TEXT    NOT NULL UNIQUE,
      password   TEXT    NOT NULL,
      role       TEXT    NOT NULL DEFAULT 'admin',  -- 'superadmin' | 'admin'
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default superadmin
  const DEFAULT_EMAIL    = 'cpadmin';
  const DEFAULT_PASSWORD = 'Admin@123';
  const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
  const existing = db.prepare('SELECT id FROM cp_admin_users WHERE email = ?').get(DEFAULT_EMAIL);
  if (existing) {
    db.prepare(`UPDATE cp_admin_users SET name=?, password=?, role='superadmin', is_active=1, updated_at=datetime('now') WHERE id=?`)
      .run('CP Superadmin', hash, existing.id);
  } else {
    db.prepare(`INSERT INTO cp_admin_users (name, email, password, role) VALUES (?, ?, ?, 'superadmin')`)
      .run('CP Superadmin', DEFAULT_EMAIL, hash);
  }

  // ── CLIENTS — pharma companies using CP Portal ────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_clients (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      code         TEXT    NOT NULL UNIQUE,  -- short slug e.g. 'ardelyx', 'pfizer'
      description  TEXT,
      contact_name TEXT,
      contact_email TEXT,
      is_active    INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── BRANDING & THEME — fully configurable per client ──────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_branding (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id          INTEGER NOT NULL UNIQUE REFERENCES cp_clients(id),

      -- Identity
      portal_name        TEXT    NOT NULL DEFAULT 'Medical Portal',
      tagline            TEXT,
      logo_url           TEXT,
      favicon_url        TEXT,
      custom_domain      TEXT,

      -- Colors
      primary_color      TEXT    NOT NULL DEFAULT '#6B3FA0',
      secondary_color    TEXT    NOT NULL DEFAULT '#4A2D7A',
      accent_color       TEXT    NOT NULL DEFAULT '#9B6FCC',
      background_color   TEXT    NOT NULL DEFAULT '#FFFFFF',
      surface_color      TEXT    NOT NULL DEFAULT '#F8F8FB',
      text_primary       TEXT    NOT NULL DEFAULT '#1A1A2E',
      text_secondary     TEXT    NOT NULL DEFAULT '#6B7280',
      header_bg          TEXT    NOT NULL DEFAULT '#6B3FA0',
      header_text        TEXT    NOT NULL DEFAULT '#FFFFFF',
      footer_bg          TEXT    NOT NULL DEFAULT '#1A1A2E',
      footer_text        TEXT    NOT NULL DEFAULT '#9CA3AF',
      button_bg          TEXT    NOT NULL DEFAULT '#6B3FA0',
      button_text        TEXT    NOT NULL DEFAULT '#FFFFFF',
      link_color         TEXT    NOT NULL DEFAULT '#6B3FA0',
      border_color       TEXT    NOT NULL DEFAULT '#E5E7EB',

      -- Typography
      font_family        TEXT    NOT NULL DEFAULT 'Inter, sans-serif',
      heading_font       TEXT    NOT NULL DEFAULT 'Inter, sans-serif',
      base_font_size     TEXT    NOT NULL DEFAULT '14px',
      border_radius      TEXT    NOT NULL DEFAULT '8px',

      -- Header & Footer
      header_style       TEXT    NOT NULL DEFAULT 'solid',  -- 'solid' | 'transparent' | 'gradient'
      footer_text_content TEXT,
      copyright_text     TEXT,
      show_powered_by    INTEGER NOT NULL DEFAULT 1,

      updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── FEATURES — which portal sections are enabled per client ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_features (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id      INTEGER NOT NULL REFERENCES cp_clients(id),
      feature_key    TEXT    NOT NULL,
      -- Keys: therapeutic_areas | events | medical_inquiry | adverse_event |
      --       product_complaint | other_inquiry | find_msl | resources |
      --       drug_info | chatbox | user_auth | hcp_gate | homepage_quicklinks
      is_enabled     INTEGER NOT NULL DEFAULT 1,
      display_name   TEXT,   -- override display label shown on portal nav
      display_order  INTEGER NOT NULL DEFAULT 0,
      icon           TEXT,   -- icon class or emoji
      UNIQUE(client_id, feature_key)
    );
  `);

  // ── FORM CONFIGURATION — configurable fields per form type ────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_form_config (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id      INTEGER NOT NULL REFERENCES cp_clients(id),
      form_type      TEXT    NOT NULL,
      -- form_type: medical_inquiry | adverse_event | product_complaint | other_inquiry
      field_key      TEXT    NOT NULL,
      field_label    TEXT    NOT NULL,
      field_type     TEXT    NOT NULL DEFAULT 'text',
      -- field_type: text | email | phone | textarea | select | multiselect | checkbox | date | file
      field_options  TEXT,   -- JSON array for select/multiselect e.g. ["Option A","Option B"]
      placeholder    TEXT,
      help_text      TEXT,
      is_required    INTEGER NOT NULL DEFAULT 0,
      is_active      INTEGER NOT NULL DEFAULT 1,
      display_order  INTEGER NOT NULL DEFAULT 0,
      UNIQUE(client_id, form_type, field_key)
    );
  `);

  // ── INTEGRATION CONFIG — MIMS or third-party system ───────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_integration_config (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id    INTEGER NOT NULL REFERENCES cp_clients(id),
      system_name  TEXT    NOT NULL DEFAULT 'MIMS',  -- 'MIMS' | 'custom'
      api_base_url TEXT,
      api_key      TEXT,
      api_secret   TEXT,
      auth_type    TEXT    NOT NULL DEFAULT 'bearer', -- 'bearer' | 'basic' | 'apikey'
      extra_headers TEXT,  -- JSON key-value pairs
      is_active    INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── INTEGRATION FIELD MAPPING — CP fields → target system ─────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_field_mapping (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id        INTEGER NOT NULL REFERENCES cp_clients(id),
      integration_id   INTEGER NOT NULL REFERENCES cp_integration_config(id),
      form_type        TEXT    NOT NULL,
      cp_field         TEXT    NOT NULL,   -- CP portal form field key
      target_field     TEXT    NOT NULL,   -- target system field key
      transform        TEXT,               -- optional: 'uppercase' | 'date_iso' | custom
      default_value    TEXT,
      UNIQUE(client_id, integration_id, form_type, cp_field)
    );
  `);

  // ── PORTAL USERS — patients, HCPs, physicians etc. ────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_portal_users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id      INTEGER NOT NULL REFERENCES cp_clients(id),
      first_name     TEXT    NOT NULL,
      last_name      TEXT    NOT NULL,
      email          TEXT    NOT NULL,
      password       TEXT    NOT NULL,
      user_type      TEXT    NOT NULL DEFAULT 'other',
      -- user_type: hcp | patient | non_hcp | physician | other
      specialty      TEXT,
      country        TEXT,
      phone          TEXT,
      is_active      INTEGER NOT NULL DEFAULT 1,
      is_verified    INTEGER NOT NULL DEFAULT 0,
      last_login_at  TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(client_id, email)
    );
  `);

  // ── SUBMISSIONS — all portal form submissions ──────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_submissions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id        INTEGER NOT NULL REFERENCES cp_clients(id),
      submission_type  TEXT    NOT NULL,
      -- submission_type: medical_inquiry | adverse_event | product_complaint | other_inquiry
      user_id          INTEGER REFERENCES cp_portal_users(id),  -- null if anonymous
      submitter_name   TEXT,
      submitter_email  TEXT,
      submitter_type   TEXT,   -- hcp | patient | physician | other
      form_data        TEXT    NOT NULL,  -- JSON of all submitted field values
      status           TEXT    NOT NULL DEFAULT 'submitted',
      -- status: submitted | pending_sync | synced | failed_sync | closed
      external_ref     TEXT,   -- case ID returned by MIMS or external system
      sync_attempts    INTEGER NOT NULL DEFAULT 0,
      sync_error       TEXT,
      ip_address       TEXT,
      submitted_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      synced_at        TEXT,
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cp_submissions_client   ON cp_submissions(client_id);
    CREATE INDEX IF NOT EXISTS idx_cp_submissions_status   ON cp_submissions(status);
    CREATE INDEX IF NOT EXISTS idx_cp_submissions_type     ON cp_submissions(submission_type);
  `);

  // ── THERAPEUTIC AREAS — content per client ────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_therapeutic_areas (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id       INTEGER NOT NULL REFERENCES cp_clients(id),
      name            TEXT    NOT NULL,
      slug            TEXT    NOT NULL,
      short_desc      TEXT,
      content         TEXT,   -- rich text / HTML
      image_url       TEXT,
      is_active       INTEGER NOT NULL DEFAULT 1,
      display_order   INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(client_id, slug)
    );
  `);

  // ── DRUG INFORMATION — approved drugs per client ──────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_drugs (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id             INTEGER NOT NULL REFERENCES cp_clients(id),
      therapeutic_area_id   INTEGER REFERENCES cp_therapeutic_areas(id),
      brand_name            TEXT    NOT NULL,
      generic_name          TEXT,
      indication            TEXT,
      prescribing_info_url  TEXT,
      storage_conditions    TEXT,
      dosage_info           TEXT,
      contraindications     TEXT,
      side_effects          TEXT,
      image_url             TEXT,
      is_active             INTEGER NOT NULL DEFAULT 1,
      display_order         INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── EVENTS & CONFERENCES ──────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id         INTEGER NOT NULL REFERENCES cp_clients(id),
      title             TEXT    NOT NULL,
      description       TEXT,
      event_type        TEXT    NOT NULL DEFAULT 'conference',
      -- event_type: conference | webinar | symposium | workshop
      venue             TEXT,
      city              TEXT,
      country           TEXT,
      start_date        TEXT,
      end_date          TEXT,
      registration_url  TEXT,
      image_url         TEXT,
      is_active         INTEGER NOT NULL DEFAULT 1,
      is_featured       INTEGER NOT NULL DEFAULT 0,
      display_order     INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── MSL DIRECTORY — Medical Science Liaisons per client ───────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_msls (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id            INTEGER NOT NULL REFERENCES cp_clients(id),
      name                 TEXT    NOT NULL,
      title                TEXT,
      specialty            TEXT,
      region               TEXT,
      territory            TEXT,
      email                TEXT,
      phone                TEXT,
      profile_image_url    TEXT,
      therapeutic_areas    TEXT,   -- JSON array of area names
      is_active            INTEGER NOT NULL DEFAULT 1,
      display_order        INTEGER NOT NULL DEFAULT 0,
      created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── RESOURCES — documents, links, publications per client ─────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_resources (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id      INTEGER NOT NULL REFERENCES cp_clients(id),
      title          TEXT    NOT NULL,
      description    TEXT,
      resource_type  TEXT    NOT NULL DEFAULT 'document',
      -- resource_type: document | video | link | publication | guideline
      url            TEXT,
      file_path      TEXT,
      category       TEXT,
      is_active      INTEGER NOT NULL DEFAULT 1,
      display_order  INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── CHATBOX CONFIG — AI chatbox settings per client ───────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_chatbox_config (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id       INTEGER NOT NULL UNIQUE REFERENCES cp_clients(id),
      ai_provider     TEXT    NOT NULL DEFAULT 'anthropic',  -- 'anthropic' | 'openai'
      model           TEXT    NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
      system_prompt   TEXT,   -- AI persona and context
      welcome_message TEXT    NOT NULL DEFAULT 'Hello! How can I help you today?',
      max_tokens      INTEGER NOT NULL DEFAULT 1024,
      is_active       INTEGER NOT NULL DEFAULT 0,
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── REPLY TEMPLATES — quick reply templates per client ────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_templates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id  INTEGER NOT NULL REFERENCES cp_clients(id),
      name       TEXT    NOT NULL,
      subject    TEXT,
      body       TEXT    NOT NULL,
      category   TEXT,   -- 'medical_inquiry' | 'adverse_event' | 'general' etc.
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── AUDIT LOGS — every admin action logged ────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_audit_logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id     INTEGER REFERENCES cp_admin_users(id),
      admin_name   TEXT,
      action       TEXT    NOT NULL,
      entity       TEXT    NOT NULL,
      entity_id    INTEGER,
      details      TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cp_audit_created ON cp_audit_logs(created_at);
  `);

  console.log('✅ CP Portal database initialized — tables ready');
}

initializeDatabase();

module.exports = db;
