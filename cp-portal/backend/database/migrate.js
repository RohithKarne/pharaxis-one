/**
 * migrate.js — CP Portal SQLite Migration
 *
 * Adds ON DELETE CASCADE / ON DELETE SET NULL to all FK references
 * in an existing cp-portal.db that was created before Sprint 2.
 *
 * SQLite does not support ALTER TABLE ADD CONSTRAINT.
 * Pattern: rename old table → create new table with correct constraints
 *          → copy data → drop old → (indexes recreated automatically).
 *
 * Usage:
 *   node database/migrate.js
 *   node database/migrate.js --dry-run   (lists what would be changed)
 *
 * Safe to run on a database that already has the correct constraints —
 * each table is checked first via PRAGMA foreign_key_list.
 */

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DRY_RUN  = process.argv.includes('--dry-run');
const DB_PATH  = path.join(__dirname, 'cp-portal.db');

if (!fs.existsSync(DB_PATH)) {
  console.error(`❌  Database not found at ${DB_PATH}`);
  process.exit(1);
}

// Backup before any changes
if (!DRY_RUN) {
  const backupPath = `${DB_PATH}.bak-${Date.now()}`;
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`📦  Backup created: ${backupPath}`);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Helpers ────────────────────────────────────────────────────────────────

function getFKList(table) {
  return db.prepare(`PRAGMA foreign_key_list(${table})`).all();
}

function tableHasCorrectFKs(table, expectedFKs) {
  const actual = getFKList(table);
  for (const expected of expectedFKs) {
    const match = actual.find(
      fk => fk.from === expected.from && fk.table === expected.table && fk.on_delete === expected.on_delete
    );
    if (!match) return false;
  }
  return true;
}

function needsMigration(table, expectedFKs) {
  const actual = getFKList(table);
  for (const expected of expectedFKs) {
    const match = actual.find(
      fk => fk.from === expected.from && fk.table === expected.table && fk.on_delete === expected.on_delete
    );
    if (!match) return true;
  }
  return false;
}

function rebuildTable(tableName, createSQL, extraSQL) {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would rebuild: ${tableName}`);
    return;
  }
  console.log(`  Rebuilding ${tableName}…`);
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name).join(', ');
  db.exec(`
    ALTER TABLE ${tableName} RENAME TO _${tableName}_old;
    ${createSQL}
    INSERT INTO ${tableName} (${cols}) SELECT ${cols} FROM _${tableName}_old;
    DROP TABLE _${tableName}_old;
    ${extraSQL || ''}
  `);
  console.log(`  ✅  ${tableName} migrated.`);
}

// ── Migration definitions ──────────────────────────────────────────────────
// Each entry: { table, expectedFKs, createSQL, extraSQL }
// expectedFKs: FK relationships the table SHOULD have after migration
// createSQL:   full CREATE TABLE statement (copy from db.js, never IF NOT EXISTS here)
// extraSQL:    optional index CREATE statements

const migrations = [

  {
    table: 'cp_branding',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_branding (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id           INTEGER NOT NULL UNIQUE REFERENCES cp_clients(id) ON DELETE CASCADE,
        portal_name         TEXT    NOT NULL DEFAULT 'Medical Portal',
        tagline             TEXT,
        logo_url            TEXT,
        favicon_url         TEXT,
        custom_domain       TEXT,
        primary_color       TEXT    NOT NULL DEFAULT '#6B3FA0',
        secondary_color     TEXT    NOT NULL DEFAULT '#4A2D7A',
        accent_color        TEXT    NOT NULL DEFAULT '#9B6FCC',
        background_color    TEXT    NOT NULL DEFAULT '#FFFFFF',
        surface_color       TEXT    NOT NULL DEFAULT '#F8F8FB',
        text_primary        TEXT    NOT NULL DEFAULT '#1A1A2E',
        text_secondary      TEXT    NOT NULL DEFAULT '#6B7280',
        header_bg           TEXT    NOT NULL DEFAULT '#6B3FA0',
        header_text         TEXT    NOT NULL DEFAULT '#FFFFFF',
        footer_bg           TEXT    NOT NULL DEFAULT '#1A1A2E',
        footer_text         TEXT    NOT NULL DEFAULT '#9CA3AF',
        button_bg           TEXT    NOT NULL DEFAULT '#6B3FA0',
        button_text         TEXT    NOT NULL DEFAULT '#FFFFFF',
        link_color          TEXT    NOT NULL DEFAULT '#6B3FA0',
        border_color        TEXT    NOT NULL DEFAULT '#E5E7EB',
        font_family         TEXT    NOT NULL DEFAULT 'Inter, sans-serif',
        heading_font        TEXT    NOT NULL DEFAULT 'Inter, sans-serif',
        base_font_size      TEXT    NOT NULL DEFAULT '14px',
        border_radius       TEXT    NOT NULL DEFAULT '8px',
        header_style        TEXT    NOT NULL DEFAULT 'solid',
        footer_text_content TEXT,
        copyright_text      TEXT,
        show_powered_by     INTEGER NOT NULL DEFAULT 1,
        sla_response_text   TEXT,
        updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
  },

  {
    table: 'cp_features',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_features (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id      INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        feature_key    TEXT    NOT NULL,
        is_enabled     INTEGER NOT NULL DEFAULT 1,
        display_name   TEXT,
        display_order  INTEGER NOT NULL DEFAULT 0,
        icon           TEXT,
        UNIQUE(client_id, feature_key)
      );`,
  },

  {
    table: 'cp_form_config',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_form_config (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id      INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        form_type      TEXT    NOT NULL,
        field_key      TEXT    NOT NULL,
        field_label    TEXT    NOT NULL,
        field_type     TEXT    NOT NULL DEFAULT 'text',
        field_options  TEXT,
        placeholder    TEXT,
        help_text      TEXT,
        is_required    INTEGER NOT NULL DEFAULT 0,
        is_active      INTEGER NOT NULL DEFAULT 1,
        display_order  INTEGER NOT NULL DEFAULT 0,
        UNIQUE(client_id, form_type, field_key)
      );`,
  },

  {
    table: 'cp_integration_config',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_integration_config (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id    INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        system_name  TEXT    NOT NULL DEFAULT 'MIMS',
        api_base_url TEXT,
        api_key      TEXT,
        api_secret   TEXT,
        auth_type    TEXT    NOT NULL DEFAULT 'bearer',
        extra_headers TEXT,
        is_active    INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
  },

  {
    table: 'cp_field_mapping',
    expectedFKs: [
      { from: 'client_id',       table: 'cp_clients',            on_delete: 'CASCADE' },
      { from: 'integration_id',  table: 'cp_integration_config', on_delete: 'CASCADE' },
    ],
    createSQL: `
      CREATE TABLE cp_field_mapping (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id        INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        integration_id   INTEGER NOT NULL REFERENCES cp_integration_config(id) ON DELETE CASCADE,
        form_type        TEXT    NOT NULL,
        cp_field         TEXT    NOT NULL,
        target_field     TEXT    NOT NULL,
        transform        TEXT,
        default_value    TEXT,
        UNIQUE(client_id, integration_id, form_type, cp_field)
      );`,
  },

  {
    table: 'cp_portal_users',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_portal_users (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id             INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        first_name            TEXT    NOT NULL,
        last_name             TEXT    NOT NULL,
        email                 TEXT    NOT NULL,
        password              TEXT    NOT NULL,
        user_type             TEXT    NOT NULL DEFAULT 'other',
        specialty             TEXT,
        country               TEXT,
        phone                 TEXT,
        is_active             INTEGER NOT NULL DEFAULT 1,
        is_verified           INTEGER NOT NULL DEFAULT 0,
        user_type_confirmed   INTEGER NOT NULL DEFAULT 0,
        last_login_at         TEXT,
        created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(client_id, email)
      );`,
  },

  {
    table: 'cp_submissions',
    expectedFKs: [
      { from: 'client_id', table: 'cp_clients',      on_delete: 'CASCADE'  },
      { from: 'user_id',   table: 'cp_portal_users', on_delete: 'SET NULL' },
    ],
    createSQL: `
      CREATE TABLE cp_submissions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id        INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        submission_type  TEXT    NOT NULL,
        user_id          INTEGER REFERENCES cp_portal_users(id) ON DELETE SET NULL,
        submitter_name   TEXT,
        submitter_email  TEXT,
        submitter_type   TEXT,
        form_data        TEXT    NOT NULL,
        status           TEXT    NOT NULL DEFAULT 'submitted',
        external_ref     TEXT,
        sync_attempts    INTEGER NOT NULL DEFAULT 0,
        sync_error       TEXT,
        ip_address       TEXT,
        submitted_at     TEXT    NOT NULL DEFAULT (datetime('now')),
        synced_at        TEXT,
        updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
    extraSQL: `
      CREATE INDEX IF NOT EXISTS idx_cp_submissions_client ON cp_submissions(client_id);
      CREATE INDEX IF NOT EXISTS idx_cp_submissions_status ON cp_submissions(status);
      CREATE INDEX IF NOT EXISTS idx_cp_submissions_type   ON cp_submissions(submission_type);`,
  },

  {
    table: 'cp_therapeutic_areas',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_therapeutic_areas (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id       INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        name            TEXT    NOT NULL,
        slug            TEXT    NOT NULL,
        short_desc      TEXT,
        content         TEXT,
        image_url       TEXT,
        is_active       INTEGER NOT NULL DEFAULT 1,
        display_order   INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(client_id, slug)
      );`,
  },

  {
    table: 'cp_drugs',
    expectedFKs: [
      { from: 'client_id',            table: 'cp_clients',           on_delete: 'CASCADE'  },
      { from: 'therapeutic_area_id',  table: 'cp_therapeutic_areas', on_delete: 'SET NULL' },
    ],
    createSQL: `
      CREATE TABLE cp_drugs (
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
      );`,
  },

  {
    table: 'cp_events',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_events (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id         INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        title             TEXT    NOT NULL,
        description       TEXT,
        event_type        TEXT    NOT NULL DEFAULT 'conference',
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
      );`,
  },

  {
    table: 'cp_msls',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_msls (
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
        therapeutic_areas    TEXT,
        is_active            INTEGER NOT NULL DEFAULT 1,
        display_order        INTEGER NOT NULL DEFAULT 0,
        created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
  },

  {
    table: 'cp_resources',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_resources (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id      INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        title          TEXT    NOT NULL,
        description    TEXT,
        resource_type  TEXT    NOT NULL DEFAULT 'document',
        url            TEXT,
        file_path      TEXT,
        category       TEXT,
        is_active      INTEGER NOT NULL DEFAULT 1,
        display_order  INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
  },

  {
    table: 'cp_chatbox_config',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_chatbox_config (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id       INTEGER NOT NULL UNIQUE REFERENCES cp_clients(id) ON DELETE CASCADE,
        ai_provider     TEXT    NOT NULL DEFAULT 'anthropic',
        model           TEXT    NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
        system_prompt   TEXT,
        welcome_message TEXT    NOT NULL DEFAULT 'Hello! How can I help you today?',
        max_tokens      INTEGER NOT NULL DEFAULT 1024,
        is_active       INTEGER NOT NULL DEFAULT 0,
        updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
  },

  {
    table: 'cp_templates',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_templates (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id  INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        name       TEXT    NOT NULL,
        subject    TEXT,
        body       TEXT    NOT NULL,
        category   TEXT,
        is_active  INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
  },

  {
    table: 'cp_gate_config',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_gate_config (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id               INTEGER NOT NULL UNIQUE REFERENCES cp_clients(id) ON DELETE CASCADE,
        is_enabled              INTEGER NOT NULL DEFAULT 0,
        gate_title              TEXT    NOT NULL DEFAULT 'Welcome — Please Identify Yourself',
        gate_subtitle           TEXT    NOT NULL DEFAULT 'To provide you with the most relevant information, please select the option that best describes you.',
        disclaimer_text         TEXT    NOT NULL DEFAULT 'By confirming your selection, you declare that the information you have provided is accurate. Content on this portal is tailored based on your declared role.',
        require_disclaimer      INTEGER NOT NULL DEFAULT 1,
        updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
  },

  {
    table: 'cp_gate_user_types',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_gate_user_types (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id     INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        type_key      TEXT    NOT NULL,
        label         TEXT    NOT NULL,
        description   TEXT,
        icon          TEXT    NOT NULL DEFAULT '👤',
        display_order INTEGER NOT NULL DEFAULT 0,
        is_enabled    INTEGER NOT NULL DEFAULT 1,
        UNIQUE(client_id, type_key)
      );`,
  },

  {
    table: 'cp_feature_access',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_feature_access (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id   INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        feature_key TEXT    NOT NULL,
        type_key    TEXT    NOT NULL,
        is_allowed  INTEGER NOT NULL DEFAULT 1,
        UNIQUE(client_id, feature_key, type_key)
      );`,
  },

  {
    table: 'cp_compliance_config',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_compliance_config (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id           INTEGER NOT NULL UNIQUE REFERENCES cp_clients(id) ON DELETE CASCADE,
        jurisdictions_json  TEXT    NOT NULL DEFAULT '[]',
        banner_config_json  TEXT    NOT NULL DEFAULT '{}',
        version             TEXT    NOT NULL DEFAULT 'v1.0',
        require_reconsent   INTEGER NOT NULL DEFAULT 0,
        updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
  },

  {
    // DB-01b-GAP-01: user_id had no REFERENCES at all
    table: 'cp_consent_records',
    expectedFKs: [
      { from: 'client_id', table: 'cp_clients',      on_delete: 'CASCADE'  },
      { from: 'user_id',   table: 'cp_portal_users', on_delete: 'SET NULL' },
    ],
    createSQL: `
      CREATE TABLE cp_consent_records (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id    INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        user_id      INTEGER REFERENCES cp_portal_users(id) ON DELETE SET NULL,
        ip_hash      TEXT,
        version      TEXT    NOT NULL,
        choices_json TEXT    NOT NULL DEFAULT '{}',
        consented_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
    extraSQL: `
      CREATE INDEX IF NOT EXISTS idx_cp_consent_client ON cp_consent_records(client_id);
      CREATE INDEX IF NOT EXISTS idx_cp_consent_user   ON cp_consent_records(user_id);`,
  },

  {
    table: 'cp_document_categories',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_document_categories (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id    INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        name         TEXT    NOT NULL,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        UNIQUE(client_id, name)
      );`,
  },

  {
    table: 'cp_documents',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_documents (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id        INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        title            TEXT    NOT NULL,
        category         TEXT,
        doc_type         TEXT    NOT NULL DEFAULT 'other',
        file_path        TEXT    NOT NULL,
        file_name        TEXT    NOT NULL,
        file_size        INTEGER NOT NULL DEFAULT 0,
        mime_type        TEXT    NOT NULL,
        visible_to_json  TEXT    NOT NULL DEFAULT '[]',
        source           TEXT    NOT NULL DEFAULT 'manual',
        mims_ref_id      TEXT,
        is_active        INTEGER NOT NULL DEFAULT 1,
        created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
    extraSQL: `CREATE INDEX IF NOT EXISTS idx_cp_docs_client ON cp_documents(client_id);`,
  },

  {
    table: 'cp_news_posts',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_news_posts (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id        INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        title            TEXT    NOT NULL,
        body_html        TEXT    NOT NULL DEFAULT '',
        category         TEXT,
        thumbnail_path   TEXT,
        target_types_json TEXT   NOT NULL DEFAULT '[]',
        status           TEXT    NOT NULL DEFAULT 'draft',
        publish_at       TEXT    NOT NULL DEFAULT (datetime('now')),
        view_count       INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
    extraSQL: `
      CREATE INDEX IF NOT EXISTS idx_cp_news_client ON cp_news_posts(client_id);
      CREATE INDEX IF NOT EXISTS idx_cp_news_status ON cp_news_posts(status);`,
  },

  {
    table: 'cp_safety_alerts',
    expectedFKs: [{ from: 'client_id', table: 'cp_clients', on_delete: 'CASCADE' }],
    createSQL: `
      CREATE TABLE cp_safety_alerts (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id        INTEGER NOT NULL REFERENCES cp_clients(id) ON DELETE CASCADE,
        title            TEXT    NOT NULL,
        alert_type       TEXT    NOT NULL DEFAULT 'other',
        severity         TEXT    NOT NULL DEFAULT 'informational'
                         CHECK(severity IN ('critical','high','medium','informational')),
        product_name     TEXT,
        ref_number       TEXT,
        body_html        TEXT    NOT NULL DEFAULT '',
        effective_date   TEXT    NOT NULL DEFAULT (datetime('now')),
        target_types_json TEXT   NOT NULL DEFAULT '[]',
        attachment_path  TEXT,
        attachment_name  TEXT,
        status           TEXT    NOT NULL DEFAULT 'active'
                         CHECK(status IN ('active','resolved','archived')),
        view_count       INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
    extraSQL: `
      CREATE INDEX IF NOT EXISTS idx_cp_safety_client   ON cp_safety_alerts(client_id);
      CREATE INDEX IF NOT EXISTS idx_cp_safety_status   ON cp_safety_alerts(status);
      CREATE INDEX IF NOT EXISTS idx_cp_safety_severity ON cp_safety_alerts(severity);`,
  },

  {
    table: 'cp_audit_logs',
    expectedFKs: [{ from: 'admin_id', table: 'cp_admin_users', on_delete: 'SET NULL' }],
    createSQL: `
      CREATE TABLE cp_audit_logs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id     INTEGER REFERENCES cp_admin_users(id) ON DELETE SET NULL,
        admin_name   TEXT,
        action       TEXT    NOT NULL,
        entity       TEXT    NOT NULL,
        entity_id    INTEGER,
        details      TEXT,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );`,
    extraSQL: `CREATE INDEX IF NOT EXISTS idx_cp_audit_created ON cp_audit_logs(created_at);`,
  },

];

// ── Run migrations ─────────────────────────────────────────────────────────

console.log(`\n🔍  Checking ${migrations.length} tables for missing FK constraints…\n`);

const toMigrate = migrations.filter(m => needsMigration(m.table, m.expectedFKs));

if (toMigrate.length === 0) {
  console.log('✅  All FK constraints are already correct. Nothing to do.\n');
  process.exit(0);
}

console.log(`⚠️   ${toMigrate.length} table(s) need migration: ${toMigrate.map(m => m.table).join(', ')}\n`);

if (DRY_RUN) {
  console.log('[DRY-RUN] No changes made.\n');
  process.exit(0);
}

// Temporarily disable FK enforcement during rebuild, then run in a transaction
db.pragma('foreign_keys = OFF');

const runMigrations = db.transaction(() => {
  for (const m of toMigrate) {
    rebuildTable(m.table, m.createSQL, m.extraSQL);
  }
});

try {
  runMigrations();
  db.pragma('foreign_keys = ON');

  // Verify: integrity check
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (integrity.integrity_check !== 'ok') {
    throw new Error(`Integrity check failed: ${JSON.stringify(integrity)}`);
  }

  console.log('\n✅  Migration complete. All FK constraints applied. Integrity check passed.\n');
} catch (err) {
  db.pragma('foreign_keys = ON');
  console.error('\n❌  Migration failed:', err.message);
  console.error('    The database has NOT been modified (transaction rolled back).');
  console.error('    Restore from backup if needed.\n');
  process.exit(1);
}
