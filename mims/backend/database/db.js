/**
 * db.js — SQLite Database Connection
 *
 * WHAT THIS FILE DOES:
 * - Opens (or creates) the SQLite database file on disk
 * - Creates all required tables the first time the app runs
 * - Exports the `db` object so other files can query the database
 *
 * WHY SQLite?
 * SQLite stores your entire database as a single file (mims.db).
 * No separate database server needed — great for development and learning.
 */
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

// The database file will be created at: mims/backend/database/mims.db
const DB_PATH = path.join(__dirname, 'mims.db');

// Open the database (creates the file if it doesn't exist)
const db = new Database(DB_PATH);

// Enable WAL mode — improves performance for concurrent reads/writes
db.pragma('journal_mode = WAL');

/**
 * initializeDatabase()
 * Creates all tables if they don't already exist.
 * This runs every time the server starts — safely does nothing if tables exist.
 */
function initializeDatabase() {
  // USERS table — stores all system users (admins, agents, reviewers)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      email       TEXT    NOT NULL UNIQUE,
      password    TEXT    NOT NULL,
      role        TEXT    NOT NULL DEFAULT 'agent',
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Bootstrap: ensure default Superadmin account exists on first run only.
  // Do NOT reset password on subsequent restarts — password changes must persist.
  const DEFAULT_SUPERADMIN_EMAIL = 'superadmin';
  const existingSuperadmin = db.prepare('SELECT id FROM users WHERE email = ?').get(DEFAULT_SUPERADMIN_EMAIL);
  if (existingSuperadmin) {
    // Only enforce role + active status — never touch the password
    db.prepare(`
      UPDATE users
      SET name = ?, role = 'superadmin', is_active = 1, updated_at = datetime('now')
      WHERE id = ?
    `).run('Superadmin', existingSuperadmin.id);
  } else {
    const defaultHash = bcrypt.hashSync('Manager@123', 10);
    db.prepare(`
      INSERT INTO users (name, email, password, role, is_active)
      VALUES (?, ?, ?, 'superadmin', 1)
    `).run('Superadmin', DEFAULT_SUPERADMIN_EMAIL, defaultHash);
  }

  // SESSIONS table — tracks active login sessions (JWT alternative for simplicity)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      token       TEXT    NOT NULL UNIQUE,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      expires_at  TEXT    NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // ─── Sprint 3: Admin Console Tables ──────────────────────────

  // ORGANISATIONS — pharma client companies
  db.exec(`
    CREATE TABLE IF NOT EXISTS organisations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // SITES — locations under each organisation
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id     INTEGER NOT NULL REFERENCES organisations(id),
      name       TEXT    NOT NULL,
      country    TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // WORKFLOW STATES — case status definitions (e.g. New, In Progress, Closed)
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_states (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // SOURCE TYPES — how inquiries arrive (Email, Phone, Fax, CP Portal etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_types (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // PRODUCTS — drug/trade names linked to organisations
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_name TEXT    NOT NULL,
      org_id     INTEGER REFERENCES organisations(id),
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // AUDIT LOGS — who changed what and when (required for pharma compliance)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER REFERENCES users(id),
      user_name  TEXT,
      action     TEXT    NOT NULL,
      entity     TEXT    NOT NULL,
      entity_id  INTEGER,
      details    TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ROLE PERMISSIONS — dynamic access control per module (ACC-01)
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      role        TEXT    NOT NULL,
      module      TEXT    NOT NULL,
      can_access  INTEGER NOT NULL DEFAULT 1,
      UNIQUE(role, module)
    );
  `);

  // USER MODULE PERMISSIONS — per-user module overrides (Superadmin)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_module_permissions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      module      TEXT    NOT NULL,
      can_access  INTEGER NOT NULL DEFAULT 1,
      UNIQUE(user_id, module)
    );
  `);

  // Seed default role permissions if table is empty
  const permCount = db.prepare('SELECT COUNT(*) as c FROM role_permissions').get().c;
  if (permCount === 0) {
    const modules = ['mims_core', 'inbox', 'case_mgmt', 'case_query', 'utilities', 'transmissions',
                     'browse_content', 'analytics', 'user_mgmt', 'admin_console',
                     'content_mgmt', 'data_visualization', 'superadmin_console'];
    const roles = ['admin', 'agent', 'reviewer', 'content_manager', 'superadmin'];
    const defaultAccess = {
      superadmin:      { mims_core:1, inbox:1, case_mgmt:1, case_query:1, utilities:1, transmissions:1, browse_content:1, analytics:1, user_mgmt:1, admin_console:1, content_mgmt:1, data_visualization:1, superadmin_console:1 },
      admin:           { mims_core:1, inbox:1, case_mgmt:1, case_query:1, utilities:1, transmissions:1, browse_content:1, analytics:1, user_mgmt:1, admin_console:1, content_mgmt:1, data_visualization:1, superadmin_console:0 },
      agent:           { mims_core:1, inbox:1, case_mgmt:1, case_query:1, utilities:1, transmissions:1, browse_content:1, analytics:0, user_mgmt:0, admin_console:0, content_mgmt:0, data_visualization:0, superadmin_console:0 },
      reviewer:        { mims_core:1, inbox:1, case_mgmt:1, case_query:1, utilities:0, transmissions:0, browse_content:1, analytics:1, user_mgmt:0, admin_console:0, content_mgmt:0, data_visualization:1, superadmin_console:0 },
      content_manager: { mims_core:0, inbox:0, case_mgmt:0, case_query:0, utilities:0, transmissions:0, browse_content:1, analytics:0, user_mgmt:0, admin_console:0, content_mgmt:1, data_visualization:0, superadmin_console:0 },
    };
    const ins = db.prepare('INSERT INTO role_permissions (role, module, can_access) VALUES (?, ?, ?)');
    for (const role of roles) {
      for (const mod of modules) {
        ins.run(role, mod, defaultAccess[role][mod] ?? 0);
      }
    }
  }

  // Migration-safe: ensure new modules + superadmin exist on already-seeded DBs
  const insOrIgnore = db.prepare('INSERT OR IGNORE INTO role_permissions (role, module, can_access) VALUES (?, ?, ?)');
  const migrateModules = ['mims_core', 'content_mgmt', 'data_visualization', 'superadmin_console'];
  const migrateRoles = ['admin', 'agent', 'reviewer', 'content_manager', 'superadmin'];
  const migrateDefaults = {
    superadmin:      { mims_core: 1, content_mgmt: 1, data_visualization: 1, superadmin_console: 1 },
    admin:           { mims_core: 1, content_mgmt: 1, data_visualization: 1, superadmin_console: 0 },
    agent:           { mims_core: 1, content_mgmt: 0, data_visualization: 0, superadmin_console: 0 },
    reviewer:        { mims_core: 1, content_mgmt: 0, data_visualization: 1, superadmin_console: 0 },
    content_manager: { mims_core: 0, content_mgmt: 1, data_visualization: 0, superadmin_console: 0 },
  };
  for (const role of migrateRoles) {
    for (const mod of migrateModules) {
      insOrIgnore.run(role, mod, migrateDefaults[role]?.[mod] ?? 0);
    }
  }
  // Ensure superadmin has full access across all modules
  const allModules = ['mims_core', 'inbox', 'case_mgmt', 'case_query', 'utilities', 'transmissions',
                      'browse_content', 'analytics', 'user_mgmt', 'admin_console',
                      'content_mgmt', 'data_visualization', 'superadmin_console'];
  for (const mod of allModules) {
    insOrIgnore.run('superadmin', mod, 1);
  }

  // Bootstrap: ensure Rohith has superadmin role
  db.prepare(`UPDATE users SET role = 'superadmin' WHERE email = ?`).run('rohithreddy480@gmail.com');

  // LOGIN AUDIT TRAIL — 21 CFR Part 11 compliance (AUD-02)
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_audit (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER REFERENCES users(id),
      user_name    TEXT,
      role         TEXT,
      login_time   TEXT    NOT NULL DEFAULT (datetime('now')),
      logout_time  TEXT,
      status       TEXT    NOT NULL DEFAULT 'success',
      fail_reason  TEXT
    );
  `);

  // EMAIL ACCOUNTS — Org mailbox connectors (Sprint 4 F1)
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id                INTEGER NOT NULL REFERENCES organisations(id),
      account_name          TEXT    NOT NULL,
      provider              TEXT    NOT NULL DEFAULT 'Generic',
      direction             TEXT    NOT NULL DEFAULT 'Both',
      is_active             INTEGER NOT NULL DEFAULT 1,
      mailbox_email         TEXT,
      from_email            TEXT,
      display_name          TEXT,
      is_default_outbound   INTEGER NOT NULL DEFAULT 0,
      imap_host             TEXT,
      imap_port             INTEGER,
      imap_encryption       TEXT,
      imap_username         TEXT,
      imap_password         TEXT,    -- plain text dev; TODO: encrypt before PostgreSQL migration
      smtp_host             TEXT,
      smtp_port             INTEGER,
      smtp_encryption       TEXT,
      smtp_username         TEXT,
      smtp_password         TEXT,    -- plain text dev; TODO: encrypt before PostgreSQL migration
      polling_interval_min  INTEGER NOT NULL DEFAULT 5,
      initial_fetch_days    INTEGER NOT NULL DEFAULT 7,
      mailbox_folder        TEXT    NOT NULL DEFAULT 'INBOX',
      ingest_attachments    INTEGER NOT NULL DEFAULT 0,
      max_attachment_mb     INTEGER NOT NULL DEFAULT 10,
      last_imap_test_at     TEXT,
      last_imap_test_status TEXT,
      last_imap_test_error  TEXT,
      last_smtp_test_at     TEXT,
      last_smtp_test_status TEXT,
      last_smtp_test_error  TEXT,
      last_send_test_at     TEXT,
      last_send_test_status TEXT,
      last_send_test_error  TEXT,
      last_ingest_at        TEXT,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // INBOX INQUIRIES — persisted email-derived inquiries (used by /api/inbox)
  // Sprint 4: supports IMAP ingestion; falls back to seed data if empty.
  db.exec(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id            INTEGER REFERENCES organisations(id),
      email_account_id  INTEGER REFERENCES email_accounts(id),
      message_id        TEXT,
      message_hash      TEXT,
      sender            TEXT,
      recipient         TEXT,
      subject           TEXT,
      body              TEXT,
      received_at       TEXT,
      status            TEXT    NOT NULL DEFAULT 'inbox',
      attachments_count INTEGER NOT NULL DEFAULT 0,
      source_tag        TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_msgid
      ON inquiries(email_account_id, message_id)
      WHERE message_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_msghash
      ON inquiries(email_account_id, message_hash)
      WHERE message_hash IS NOT NULL;
  `);

  // Add UI-state columns to inquiries if not yet present (safe on existing DBs)
  try { db.exec(`ALTER TABLE inquiries ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0`) } catch (_) {}
  try { db.exec(`ALTER TABLE inquiries ADD COLUMN locked_by TEXT`) } catch (_) {}
  try { db.exec(`ALTER TABLE inquiries ADD COLUMN color TEXT`) } catch (_) {}
  try { db.exec(`ALTER TABLE inquiries ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0`) } catch (_) {}

  // Phase 2 — Workflow & filter columns
  try { db.exec(`ALTER TABLE inquiries ADD COLUMN assigned_to TEXT`) } catch (_) {}
  try { db.exec(`ALTER TABLE inquiries ADD COLUMN priority TEXT`) } catch (_) {}
  try { db.exec(`ALTER TABLE inquiries ADD COLUMN due_date TEXT`) } catch (_) {}
  try { db.exec(`ALTER TABLE inquiries ADD COLUMN original_inquiry_id INTEGER`) } catch (_) {}

  // REPLY TEMPLATES — global; admin creates/edits; all users select in compose
  db.exec(`
    CREATE TABLE IF NOT EXISTS reply_templates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      subject    TEXT,
      body       TEXT    NOT NULL,
      created_by INTEGER REFERENCES users(id),
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // INQUIRY NOTES — internal notes per inquiry; all roles; timestamped; read-only after post
  db.exec(`
    CREATE TABLE IF NOT EXISTS inquiry_notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      inquiry_id  INTEGER NOT NULL REFERENCES inquiries(id),
      user_id     INTEGER REFERENCES users(id),
      user_name   TEXT    NOT NULL,
      note        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_inquiry_notes_inquiry ON inquiry_notes(inquiry_id);
  `);

  // SERVICE LOGS — tracks all service events across the platform (Email, future services)
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      source        TEXT    NOT NULL,
      service_type  TEXT    NOT NULL,
      description   TEXT    NOT NULL,
      details       TEXT,
      status        TEXT    NOT NULL DEFAULT 'success',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_service_logs_source     ON service_logs(source);
    CREATE INDEX IF NOT EXISTS idx_service_logs_created_at ON service_logs(created_at);
  `);

  // Add details column if not yet present (safe on existing DBs)
  try { db.exec(`ALTER TABLE service_logs ADD COLUMN details TEXT`) } catch (_) {}

  // INQUIRY ATTACHMENTS — stored files/metadata (local dev storage)
  db.exec(`
    CREATE TABLE IF NOT EXISTS inquiry_attachments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      inquiry_id    INTEGER NOT NULL REFERENCES inquiries(id),
      filename      TEXT,
      mime_type     TEXT,
      size_bytes    INTEGER,
      storage_path  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_inquiry_attachments_inquiry
      ON inquiry_attachments(inquiry_id);
  `);

  console.log('✅ Database initialized — tables ready');
}

// Run initialization on startup
initializeDatabase();

module.exports = db;
