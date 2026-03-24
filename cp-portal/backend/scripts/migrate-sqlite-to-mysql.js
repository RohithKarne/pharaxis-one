/**
 * CP Portal: SQLite → MySQL Data Migration Script
 *
 * Reads all data from cp-portal.db (SQLite) and inserts into cp_portal_dev (MySQL).
 * Run AFTER the MySQL schema has been created (i.e. after the new db.js runs once).
 *
 * Usage:
 *   cd cp-portal
 *   node backend/scripts/migrate-sqlite-to-mysql.js
 *
 * Prerequisites:
 *   - Docker running: docker-compose up -d
 *   - MySQL tables already created in cp_portal_dev
 *   - mysql2 installed: npm install mysql2
 *   - better-sqlite3 still installed (used to read source data)
 */

'use strict';

const Database = require('better-sqlite3');
const mysql    = require('mysql2/promise');
const path     = require('path');

const SQLITE_PATH = path.join(__dirname, '../database/cp-portal.db');

const MYSQL_CONFIG = {
  host:     process.env.MYSQL_HOST     || 'localhost',
  port:     process.env.MYSQL_PORT     || 3306,
  user:     process.env.MYSQL_USER     || 'devuser',
  password: process.env.MYSQL_PASSWORD || 'devpass',
  database: process.env.MYSQL_DATABASE || 'cp_portal_dev',
  maxAllowedPacket: 16 * 1024 * 1024,
};

/**
 * Tables in FK-dependency order (parents before children).
 *
 * Dependency map (from db.js REFERENCES audit):
 *   cp_clients             — root parent (most tables depend on this)
 *   cp_therapeutic_areas   — parent of cp_drugs
 *   cp_admin_users         — parent of cp_audit_logs
 *   cp_portal_users        — parent of cp_consent_records, cp_feedback, cp_saved_items
 *   cp_integration_config  — parent of cp_field_mapping
 *
 * Tables with no outbound FKs come first, then their children.
 */
const TABLES = [
  // ── Tier 1: Root tables (no FK dependencies) ──────────────────
  'cp_clients',
  'cp_therapeutic_areas',
  'cp_admin_users',
  'cp_features',

  // ── Tier 2: Depends only on cp_clients ────────────────────────
  'cp_branding',
  'cp_form_config',
  'cp_integration_config',
  'cp_email_config',
  'cp_compliance_config',
  'cp_chatbox_config',
  'cp_templates',
  'cp_gate_config',
  'cp_feature_access',
  'cp_resources',
  'cp_news_posts',
  'cp_safety_alerts',
  'cp_custom_reports',
  'cp_faq_items',
  'cp_document_categories',

  // ── Tier 3: Depends on cp_clients + cp_therapeutic_areas ──────
  'cp_drugs',

  // ── Tier 4: Depends on cp_clients (portal users) ──────────────
  'cp_portal_users',

  // ── Tier 5: Depends on cp_clients + cp_integration_config ─────
  'cp_field_mapping',

  // ── Tier 6: Depends on cp_clients + cp_portal_users ───────────
  'cp_submissions',
  'cp_events',
  'cp_msls',
  'cp_gate_user_types',
  'cp_consent_records',
  'cp_feedback',
  'cp_saved_items',
  'cp_notifications',
  'cp_documents',
  'cp_msl_bookings',
  'cp_process_logs',

  // ── Tier 7: Depends on cp_admin_users ─────────────────────────
  'cp_audit_logs',
];

async function migrate() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  CP Portal: SQLite → MySQL Migration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── Open SQLite (read-only — never modify source) ────────────
  let sqlite;
  try {
    sqlite = new Database(SQLITE_PATH, { readonly: true });
    console.log(`✅ SQLite opened (read-only): ${SQLITE_PATH}`);
  } catch (err) {
    console.error(`❌ Cannot open SQLite: ${err.message}`);
    process.exit(1);
  }

  // ── Connect to MySQL ─────────────────────────────────────────
  let conn;
  try {
    conn = await mysql.createConnection(MYSQL_CONFIG);
    console.log(`✅ MySQL connected: ${MYSQL_CONFIG.database}@${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}\n`);
  } catch (err) {
    console.error(`❌ Cannot connect to MySQL: ${err.message}`);
    sqlite.close();
    process.exit(1);
  }

  /**
   * CRITICAL: Disable FK checks BEFORE truncation and migration.
   * MySQL blocks TRUNCATE if any FK constraint references the table, even
   * if the child table is empty. Disabling FK checks first is required.
   */
  await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
  await conn.execute('SET unique_checks = 0');

  // ── Truncate all tables first (clear seed data from schema init) ──────────
  console.log('🧹 Clearing MySQL tables before migration (removing seed data)...\n');
  for (const table of [...TABLES].reverse()) {
    try {
      await conn.execute(`TRUNCATE TABLE \`${table}\``);
    } catch (_) { /* ignore — table may not exist yet */ }
  }

  // ── Helper: convert ISO 8601 datetime strings to MySQL DATETIME format ────
  function toMySQLValue(v, col) {
    if (v === undefined || v === null) return null;
    // Sanitize INT columns: if value is a non-numeric string, return NULL
    if (col === 'entity_id' && typeof v === 'string' && !/^\d+$/.test(v)) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        return d.toISOString().replace('T', ' ').substring(0, 19);
      }
    }
    return v;
  }

  const stats = { migrated: 0, skipped: 0, errors: 0 };

  // ── Migrate each table ────────────────────────────────────────
  for (const table of TABLES) {
    try {
      // Verify table exists in SQLite
      const tableExists = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(table);

      if (!tableExists) {
        console.log(`⊘  ${table}: not found in SQLite — skipped`);
        stats.skipped++;
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM \`${table}\``).all();

      if (rows.length === 0) {
        console.log(`⊘  ${table}: 0 rows`);
        stats.skipped++;
        continue;
      }

      const columns      = Object.keys(rows[0]);
      const colList      = columns.map(c => `\`${c}\``).join(', ');
      const placeholders = columns.map(() => '?').join(', ');
      const sql          = `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders})`;

      // Insert per-table in a transaction for atomicity
      await conn.beginTransaction();
      try {
        for (const row of rows) {
          const values = columns.map(col => toMySQLValue(row[col], col));
          await conn.execute(sql, values);
        }
        await conn.commit();
      } catch (insertErr) {
        await conn.rollback();
        throw insertErr;
      }

      // Reset AUTO_INCREMENT so future inserts don't collide with migrated IDs
      const hasId = columns.includes('id');
      if (hasId) {
        const maxRow = sqlite.prepare(`SELECT MAX(id) AS maxId FROM \`${table}\``).get();
        const maxId  = maxRow.maxId || 0;
        await conn.execute(`ALTER TABLE \`${table}\` AUTO_INCREMENT = ${maxId + 1}`);
      }

      stats.migrated++;
      console.log(`✅ ${table}: ${rows.length} rows migrated`);

    } catch (err) {
      stats.errors++;
      console.error(`❌ ${table}: ${err.message}`);
    }
  }

  // ── Re-enable FK checks immediately ──────────────────────────
  await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
  await conn.execute('SET unique_checks = 1');

  // ── Verification pass ─────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Row Count Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let allMatch = true;

  for (const table of TABLES) {
    const tableExists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(table);
    if (!tableExists) continue;

    const sqliteCount            = sqlite.prepare(`SELECT COUNT(*) AS c FROM \`${table}\``).get().c;
    const [[{ c: mysqlCount }]] = await conn.execute(`SELECT COUNT(*) AS c FROM \`${table}\``);

    const match = sqliteCount === mysqlCount;
    if (!match) allMatch = false;
    console.log(`${match ? '✅' : '❌'} ${table.padEnd(35)} SQLite: ${String(sqliteCount).padStart(6)}  MySQL: ${mysqlCount}`);
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Tables migrated : ${stats.migrated}`);
  console.log(`  Tables skipped  : ${stats.skipped}`);
  console.log(`  Errors          : ${stats.errors}`);
  console.log(`  Verification    : ${allMatch ? '✅ ALL ROW COUNTS MATCH' : '❌ MISMATCH — check above'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  sqlite.close();
  await conn.end();

  if (stats.errors > 0 || !allMatch) process.exit(1);
}

migrate().catch(err => {
  console.error(`\n❌ Fatal: ${err.message}`);
  process.exit(1);
});
