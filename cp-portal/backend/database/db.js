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
db.pragma('foreign_keys = ON');

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

  // Seed default superadmin — only set password on first insert, never overwrite on restart
  const DEFAULT_EMAIL    = 'cpadmin';
  const DEFAULT_PASSWORD = 'Admin@123';
  const existing = db.prepare('SELECT id FROM cp_admin_users WHERE email = ?').get(DEFAULT_EMAIL);
  if (existing) {
    // SEC-01: Do NOT touch the password — admin may have changed it. Only ensure role/active state.
    db.prepare(`UPDATE cp_admin_users SET name=?, role='superadmin', is_active=1, updated_at=datetime('now') WHERE id=?`)
      .run('CP Superadmin', existing.id);
  } else {
    const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
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
      client_id          INTEGER NOT NULL UNIQUE REFERENCES cp_clients(id) ON DELETE CASCADE,

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
      client_id      INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
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
      client_id      INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
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
  // TODO Sprint 3: encrypt api_key and api_secret at rest using AES-256 with server-side key from env
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_integration_config (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id    INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
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
      client_id        INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      integration_id   INTEGER NOT NULL REFERENCES cp_integration_config(id) ON DELETE CASCADE,
      form_type        TEXT    NOT NULL,
      cp_field         TEXT    NOT NULL,   -- CP portal form field key
      target_field     TEXT    NOT NULL,   -- target system field key
      transform        TEXT,               -- optional: 'uppercase' | 'date_iso' | custom
      default_value    TEXT,
      UNIQUE(client_id, integration_id, form_type, cp_field)
    );
  `);

  // ── PORTAL USERS — patients, HCPs, physicians etc. ────────────
  // DB-02: UNIQUE(client_id, email) creates an implicit B-tree index in SQLite —
  // no separate CREATE INDEX needed for the login query:
  //   SELECT * FROM cp_portal_users WHERE client_id = ? AND email = ?
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_portal_users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id      INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
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
      UNIQUE(client_id, email)  -- implicit index covers login lookup on (client_id, email)
    );
  `);

  // ── SUBMISSIONS — all portal form submissions ──────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_submissions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id        INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      submission_type  TEXT    NOT NULL,
      -- submission_type: medical_inquiry | adverse_event | product_complaint | other_inquiry
      user_id          INTEGER REFERENCES cp_portal_users(id) ON DELETE SET NULL,  -- null if anonymous
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
    CREATE INDEX IF NOT EXISTS idx_cp_submissions_user     ON cp_submissions(user_id);
  `);

  // ── THERAPEUTIC AREAS — content per client ────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_therapeutic_areas (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id       INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
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
      client_id             INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      therapeutic_area_id   INTEGER REFERENCES cp_therapeutic_areas(id) ON DELETE SET NULL,
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
      client_id         INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
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
      client_id            INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
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
      client_id      INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
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
      client_id       INTEGER NOT NULL UNIQUE REFERENCES cp_clients(id) ON DELETE CASCADE,
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
      client_id  INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      subject    TEXT,
      body       TEXT    NOT NULL,
      category   TEXT,   -- 'medical_inquiry' | 'adverse_event' | 'general' etc.
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── USER TYPE GATE CONFIG — per client gate settings ──────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_gate_config (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id               INTEGER NOT NULL UNIQUE REFERENCES cp_clients(id) ON DELETE CASCADE,
      is_enabled              INTEGER NOT NULL DEFAULT 0,
      gate_title              TEXT    NOT NULL DEFAULT 'Welcome — Please Identify Yourself',
      gate_subtitle           TEXT    NOT NULL DEFAULT 'To provide you with the most relevant information, please select the option that best describes you.',
      disclaimer_text         TEXT    NOT NULL DEFAULT 'By confirming your selection, you declare that the information you have provided is accurate. Content on this portal is tailored based on your declared role.',
      require_disclaimer      INTEGER NOT NULL DEFAULT 1,
      updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── GATE USER TYPES — configurable type options per client ─────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_gate_user_types (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id     INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      type_key      TEXT    NOT NULL,
      label         TEXT    NOT NULL,
      description   TEXT,
      icon          TEXT    NOT NULL DEFAULT '👤',
      display_order INTEGER NOT NULL DEFAULT 0,
      is_enabled    INTEGER NOT NULL DEFAULT 1,
      UNIQUE(client_id, type_key)
    );
  `);

  // ── FEATURE ACCESS MATRIX — which user types can see which features
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_feature_access (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id   INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      feature_key TEXT    NOT NULL,
      type_key    TEXT    NOT NULL,
      is_allowed  INTEGER NOT NULL DEFAULT 1,
      UNIQUE(client_id, feature_key, type_key)
    );
  `);

  // Safe migration: add user_type_confirmed to portal users if not present
  const puCols = db.prepare("PRAGMA table_info(cp_portal_users)").all().map(c => c.name);
  if (!puCols.includes('user_type_confirmed')) {
    db.exec(`ALTER TABLE cp_portal_users ADD COLUMN user_type_confirmed INTEGER NOT NULL DEFAULT 0`);
  }

  // Safe migration: add sla_response_text to branding if not present
  const bCols = db.prepare("PRAGMA table_info(cp_branding)").all().map(c => c.name);
  if (!bCols.includes('sla_response_text')) {
    db.exec(`ALTER TABLE cp_branding ADD COLUMN sla_response_text TEXT`);
  }

  // DB-03: Safe migration — ensure user_id index exists on cp_submissions for My Submissions query:
  //   SELECT * FROM cp_submissions WHERE user_id = ? ORDER BY submitted_at DESC
  // IF NOT EXISTS makes this a no-op on fresh databases (index already in CREATE TABLE above).
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cp_submissions_user ON cp_submissions(user_id)`);

  // ── F-02: COMPLIANCE CONFIG — jurisdiction + banner per client ─
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_compliance_config (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id           INTEGER NOT NULL UNIQUE REFERENCES cp_clients(id) ON DELETE CASCADE,
      jurisdictions_json  TEXT    NOT NULL DEFAULT '[]',
      -- e.g. ["gdpr","ccpa","pdpb","apac"]  — strictest governs banner
      banner_config_json  TEXT    NOT NULL DEFAULT '{}',
      -- { title, body, accept_label, decline_label, manage_label }
      version             TEXT    NOT NULL DEFAULT 'v1.0',
      require_reconsent   INTEGER NOT NULL DEFAULT 0,
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── F-02: CONSENT RECORDS — per user consent audit trail ──────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_consent_records (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id    INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      user_id      INTEGER REFERENCES cp_portal_users(id) ON DELETE SET NULL,  -- NULL for anonymous visitors
      ip_hash      TEXT,      -- hashed IP for anonymous records (no PII)
      version      TEXT    NOT NULL,
      choices_json TEXT    NOT NULL DEFAULT '{}',
      -- { necessary: true, functional: true, analytics: false, marketing: false }
      consented_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cp_consent_client  ON cp_consent_records(client_id);
    CREATE INDEX IF NOT EXISTS idx_cp_consent_user    ON cp_consent_records(user_id);
  `);

  // ── F-04: DOCUMENT CATEGORIES — admin-defined per client ──────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_document_categories (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id    INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      name         TEXT    NOT NULL,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      UNIQUE(client_id, name)
    );
  `);

  // ── F-04: DOCUMENTS — medical doc library per client ──────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_documents (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id        INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      title            TEXT    NOT NULL,
      category         TEXT,
      doc_type         TEXT    NOT NULL DEFAULT 'other',
      -- doc_type: smpc | pil | ifu | clinical_summary | other
      file_path        TEXT    NOT NULL,
      file_name        TEXT    NOT NULL,
      file_size        INTEGER NOT NULL DEFAULT 0,
      mime_type        TEXT    NOT NULL,
      visible_to_json  TEXT    NOT NULL DEFAULT '[]',
      -- [] = all user types; ["hcp","physician"] = restricted
      source           TEXT    NOT NULL DEFAULT 'manual',
      -- source: manual | mims
      mims_ref_id      TEXT,   -- future MIMS sync reference
      is_active        INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cp_docs_client ON cp_documents(client_id);
  `);

  // ── F-05: NEWS POSTS — news & announcements per client ────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_news_posts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id        INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      title            TEXT    NOT NULL,
      body_html        TEXT    NOT NULL DEFAULT '',
      category         TEXT,
      thumbnail_path   TEXT,
      target_types_json TEXT   NOT NULL DEFAULT '[]',
      -- [] = all user types; ["hcp"] = HCP only
      status           TEXT    NOT NULL DEFAULT 'draft',
      -- status: draft | scheduled | published | archived
      publish_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      view_count       INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cp_news_client ON cp_news_posts(client_id);
    CREATE INDEX IF NOT EXISTS idx_cp_news_status ON cp_news_posts(status);
  `);

  // ── F-13: SAFETY ALERTS — regulatory communications per client ─
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_safety_alerts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id        INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      title            TEXT    NOT NULL,
      alert_type       TEXT    NOT NULL DEFAULT 'other',
      -- alert_type: dhcp_letter | product_recall | urgent_safety_restriction | field_safety_notice | other
      severity         TEXT    NOT NULL DEFAULT 'informational'
                       CHECK(severity IN ('critical','high','medium','informational')),
      product_name     TEXT,
      ref_number       TEXT,
      body_html        TEXT    NOT NULL DEFAULT '',
      effective_date   TEXT    NOT NULL DEFAULT (datetime('now')),
      target_types_json TEXT   NOT NULL DEFAULT '[]',
      -- [] = all user types
      attachment_path  TEXT,
      attachment_name  TEXT,
      status           TEXT    NOT NULL DEFAULT 'active'
                       CHECK(status IN ('active','resolved','archived')),
      view_count       INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cp_safety_client   ON cp_safety_alerts(client_id);
    CREATE INDEX IF NOT EXISTS idx_cp_safety_status   ON cp_safety_alerts(status);
    CREATE INDEX IF NOT EXISTS idx_cp_safety_severity ON cp_safety_alerts(severity);
  `);

  // ── AUDIT LOGS — every admin action logged ────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_audit_logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id     INTEGER REFERENCES cp_admin_users(id) ON DELETE SET NULL,
      admin_name   TEXT,
      action       TEXT    NOT NULL,
      entity       TEXT    NOT NULL,
      entity_id    INTEGER,
      details      TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cp_audit_created ON cp_audit_logs(created_at);
  `);

  // Add status column to content tables (safe migration)
  const contentTables = ['cp_therapeutic_areas', 'cp_drugs', 'cp_events', 'cp_resources']
  for (const table of contentTables) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'`) } catch {}
  }

  // Backfill: existing active content that has status='draft' (pre-dates status field) → publish it
  // so the portal doesn't go empty after the published-only filter was applied.
  for (const table of contentTables) {
    try { db.exec(`UPDATE ${table} SET status='published' WHERE is_active=1 AND status='draft'`) } catch {}
  }

  // ── F3: Document lifecycle columns (safe migration) ───────────────────────
  try { db.exec(`ALTER TABLE cp_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'`) } catch {}
  try { db.exec(`ALTER TABLE cp_documents ADD COLUMN expires_at TEXT`) } catch {}
  try { db.exec(`ALTER TABLE cp_documents ADD COLUMN version TEXT`) } catch {}
  try { db.exec(`ALTER TABLE cp_documents ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0`) } catch {}
  // Backfill: active docs were uploaded before status field existed — publish them
  try { db.exec(`UPDATE cp_documents SET status='published' WHERE is_active=1 AND status='draft'`) } catch {}

  // ── F4: Pin news posts (safe migration) ───────────────────────────────────
  try { db.exec(`ALTER TABLE cp_news_posts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`) } catch {}

  // ── S4-1: Saved items / bookmarks ─────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_saved_items (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      portal_user_id INTEGER NOT NULL REFERENCES cp_portal_users(id) ON DELETE CASCADE,
      client_id      INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      item_type      TEXT    NOT NULL CHECK(item_type IN ('news','document')),
      item_id        INTEGER NOT NULL,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(portal_user_id, item_type, item_id)
    );
  `);

  // ── S4-2: Integration health sync columns (safe migration) ────────────────
  try { db.exec(`ALTER TABLE cp_integration_config ADD COLUMN last_sync_at TEXT`) } catch {}
  try { db.exec(`ALTER TABLE cp_integration_config ADD COLUMN last_sync_status TEXT NOT NULL DEFAULT 'unknown'`) } catch {}
  try { db.exec(`ALTER TABLE cp_integration_config ADD COLUMN last_sync_error TEXT`) } catch {}

  // ── S4-3: Portal notifications ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_notifications (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      portal_user_id INTEGER NOT NULL REFERENCES cp_portal_users(id) ON DELETE CASCADE,
      client_id      INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      type           TEXT    NOT NULL CHECK(type IN ('news','document','safety')),
      title          TEXT    NOT NULL,
      item_id        INTEGER NOT NULL,
      is_read        INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cp_notif_user ON cp_notifications(portal_user_id, is_read);
  `);

  // ── S4-5: Scheduled publish columns (safe migration) ──────────────────────
  try { db.exec(`ALTER TABLE cp_documents ADD COLUMN publish_at TEXT`) } catch {}
  try { db.exec(`ALTER TABLE cp_safety_alerts ADD COLUMN publish_at TEXT`) } catch {}
  // Backfill: existing published content has no scheduled publish — set to now so filters pass
  try { db.exec(`UPDATE cp_documents SET publish_at = created_at WHERE publish_at IS NULL`) } catch {}
  try { db.exec(`UPDATE cp_safety_alerts SET publish_at = created_at WHERE publish_at IS NULL`) } catch {}

  // ── S5: Email service config — SMTP settings per client ──────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_email_config (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id         INTEGER NOT NULL UNIQUE REFERENCES cp_clients(id) ON DELETE CASCADE,
      smtp_host         TEXT,
      smtp_port         INTEGER NOT NULL DEFAULT 587,
      smtp_encryption   TEXT    NOT NULL DEFAULT 'STARTTLS',
      -- smtp_encryption: STARTTLS | SSL/TLS | None
      smtp_username     TEXT,
      smtp_password     TEXT,
      from_email        TEXT,
      from_name         TEXT,
      is_active         INTEGER NOT NULL DEFAULT 0,
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── S5: Custom report dashboards ──────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_custom_reports (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id    INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      name         TEXT    NOT NULL,
      layout_json  TEXT    NOT NULL DEFAULT '[]',
      widgets_json TEXT    NOT NULL DEFAULT '[]',
      created_by   INTEGER REFERENCES cp_admin_users(id) ON DELETE SET NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── S5-1: Feedback Widget ─────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_feedback (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id    INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      user_id      INTEGER REFERENCES cp_portal_users(id) ON DELETE SET NULL,
      rating       INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      message      TEXT,
      page_url     TEXT,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── S5-5: FAQ v1 ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_faq_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id    INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      question     TEXT    NOT NULL,
      answer       TEXT    NOT NULL,
      category     TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── S5-8: MSL Booking requests ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_msl_bookings (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id           INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
      msl_id              INTEGER NOT NULL REFERENCES cp_msls(id) ON DELETE CASCADE,
      portal_user_id      INTEGER REFERENCES cp_portal_users(id) ON DELETE SET NULL,
      requester_name      TEXT    NOT NULL,
      requester_email     TEXT    NOT NULL,
      requester_user_type TEXT,
      preferred_date      TEXT,
      topic               TEXT,
      message             TEXT,
      status              TEXT    NOT NULL DEFAULT 'pending',
      admin_notes         TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Process Explorer: full API activity log (admin + portal) ─────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_process_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      source          TEXT    NOT NULL DEFAULT 'admin',  -- 'admin' | 'portal'
      method          TEXT    NOT NULL,
      path            TEXT    NOT NULL,
      path_pattern    TEXT,
      status_code     INTEGER,
      duration_ms     INTEGER,
      admin_id        INTEGER REFERENCES cp_admin_users(id) ON DELETE SET NULL,
      portal_user_id  INTEGER REFERENCES cp_portal_users(id) ON DELETE SET NULL,
      client_id       INTEGER REFERENCES cp_clients(id) ON DELETE SET NULL,
      payload_summary TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cp_process_logs_ts ON cp_process_logs(created_at DESC);
  `);

  // ── Process Explorer: add error_message column (safe migration) ──────────────
  try { db.exec(`ALTER TABLE cp_process_logs ADD COLUMN error_message TEXT`) } catch {}

  // ── S4-10: Role-based admin access — client_id on admin users (safe migration) ──
  // Fixes Sprint 2 gap: requireClientAccess was blocking regular admins because no clientId
  // was stored. NULL = superadmin (cross-client), non-null = scoped to that client.
  try { db.exec(`ALTER TABLE cp_admin_users ADD COLUMN client_id INTEGER REFERENCES cp_clients(id) ON DELETE SET NULL`) } catch {}

  // ── S4-9: User notification preferences (safe migration) ──────────────────
  try { db.exec(`ALTER TABLE cp_portal_users ADD COLUMN notif_prefs_json TEXT NOT NULL DEFAULT '{"news":true,"documents":true,"safety":true}'`) } catch {}

  // ── S5-9: Multi-language config (safe migration) ──────────────────────────
  try { db.exec(`ALTER TABLE cp_clients ADD COLUMN language_config_json TEXT NOT NULL DEFAULT '{"default":"en","enabled":["en"]}'`) } catch {}

  // ── Auto-translation storage (safe migration) ──────────────────────────────
  // translations_json stores { "fr": { "title": "...", "body_html": "..." }, "de": {...} }
  try { db.exec(`ALTER TABLE cp_news_posts    ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}'`) } catch {}
  try { db.exec(`ALTER TABLE cp_safety_alerts ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}'`) } catch {}
  try { db.exec(`ALTER TABLE cp_faq_items     ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}'`) } catch {}
  try { db.exec(`ALTER TABLE cp_documents     ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}'`) } catch {}

  // ── S5-7: Email verification (safe migration) ─────────────────────────────
  // Default 1 so existing users are not locked out on upgrade
  try { db.exec(`ALTER TABLE cp_portal_users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1`) } catch {}
  try { db.exec(`ALTER TABLE cp_portal_users ADD COLUMN verification_token TEXT`) } catch {}
  try { db.exec(`ALTER TABLE cp_portal_users ADD COLUMN verification_token_expires_at TEXT`) } catch {}

  // ── Safe migration: seed default form fields for all active clients ──────
  // Runs once per client+formType — skips if any fields already exist for that combo.
  const DEFAULT_FORM_FIELDS = {
    medical_inquiry: [
      { key: 'first_name',       label: 'First Name',         type: 'text',     required: 1, order: 1, placeholder: 'Enter your first name' },
      { key: 'last_name',        label: 'Last Name',          type: 'text',     required: 1, order: 2, placeholder: 'Enter your last name' },
      { key: 'email',            label: 'Email Address',      type: 'email',    required: 1, order: 3, placeholder: 'your@email.com' },
      { key: 'phone',            label: 'Phone Number',       type: 'phone',    required: 0, order: 4, placeholder: 'Optional' },
      { key: 'organization',     label: 'Organization',       type: 'text',     required: 0, order: 5, placeholder: 'Hospital, clinic, or company name' },
      { key: 'product_name',     label: 'Product / Drug Name',type: 'text',     required: 1, order: 6, placeholder: 'Name of the product' },
      { key: 'inquiry_details',  label: 'Inquiry Details',    type: 'textarea', required: 1, order: 7, placeholder: 'Please describe your medical inquiry in detail' },
    ],
    adverse_event: [
      { key: 'first_name',         label: 'First Name',          type: 'text',     required: 1, order: 1, placeholder: 'Enter your first name' },
      { key: 'last_name',          label: 'Last Name',           type: 'text',     required: 1, order: 2, placeholder: 'Enter your last name' },
      { key: 'email',              label: 'Email Address',       type: 'email',    required: 1, order: 3, placeholder: 'your@email.com' },
      { key: 'phone',              label: 'Phone Number',        type: 'phone',    required: 0, order: 4, placeholder: 'Optional' },
      { key: 'product_name',       label: 'Product Name',        type: 'text',     required: 1, order: 5, placeholder: 'Product involved in the adverse event' },
      { key: 'lot_number',         label: 'Lot / Batch Number',  type: 'text',     required: 0, order: 6, placeholder: 'If available' },
      { key: 'event_date',         label: 'Date of Event',       type: 'text',     required: 0, order: 7, placeholder: 'DD/MM/YYYY' },
      { key: 'event_description',  label: 'Event Description',   type: 'textarea', required: 1, order: 8, placeholder: 'Describe the adverse event in detail' },
      { key: 'patient_age',        label: 'Patient Age',         type: 'text',     required: 0, order: 9, placeholder: 'Optional' },
    ],
    product_complaint: [
      { key: 'first_name',         label: 'First Name',          type: 'text',     required: 1, order: 1, placeholder: 'Enter your first name' },
      { key: 'last_name',          label: 'Last Name',           type: 'text',     required: 1, order: 2, placeholder: 'Enter your last name' },
      { key: 'email',              label: 'Email Address',       type: 'email',    required: 1, order: 3, placeholder: 'your@email.com' },
      { key: 'product_name',       label: 'Product Name',        type: 'text',     required: 1, order: 4, placeholder: 'Name of the product' },
      { key: 'lot_number',         label: 'Lot / Batch Number',  type: 'text',     required: 0, order: 5, placeholder: 'If available' },
      { key: 'complaint_details',  label: 'Complaint Details',   type: 'textarea', required: 1, order: 6, placeholder: 'Describe the product complaint in detail' },
    ],
    other_inquiry: [
      { key: 'first_name',      label: 'First Name',      type: 'text',     required: 1, order: 1, placeholder: 'Enter your first name' },
      { key: 'last_name',       label: 'Last Name',       type: 'text',     required: 1, order: 2, placeholder: 'Enter your last name' },
      { key: 'email',           label: 'Email Address',   type: 'email',    required: 1, order: 3, placeholder: 'your@email.com' },
      { key: 'inquiry_details', label: 'Inquiry Details', type: 'textarea', required: 1, order: 4, placeholder: 'Please describe your inquiry' },
    ],
  };

  const insertField = db.prepare(`
    INSERT OR IGNORE INTO cp_form_config
      (client_id, form_type, field_key, field_label, field_type, placeholder, is_required, is_active, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const activeClients = db.prepare('SELECT id FROM cp_clients WHERE is_active = 1').all();
  for (const client of activeClients) {
    for (const [formType, fields] of Object.entries(DEFAULT_FORM_FIELDS)) {
      const existing = db.prepare('SELECT COUNT(*) as cnt FROM cp_form_config WHERE client_id = ? AND form_type = ?').get(client.id, formType);
      if (existing.cnt === 0) {
        for (const f of fields) {
          insertField.run(client.id, formType, f.key, f.label, f.type, f.placeholder, f.required, f.order);
        }
      }
    }
  }

  console.log('✅ CP Portal database initialized — tables ready');
}

initializeDatabase();

module.exports = db;
