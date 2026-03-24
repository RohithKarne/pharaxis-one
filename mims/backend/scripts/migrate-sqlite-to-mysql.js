/**
 * MIMS: SQLite → MySQL Data Migration Script
 *
 * Reads all data from mims.db (SQLite) and inserts into mims_dev (MySQL).
 * Run AFTER the MySQL schema has been created (i.e. after the new db.js runs once).
 *
 * Usage:
 *   cd mims
 *   node backend/scripts/migrate-sqlite-to-mysql.js
 *
 * Prerequisites:
 *   - Docker running: docker-compose up -d
 *   - MySQL tables already created in mims_dev
 *   - mysql2 installed: npm install mysql2
 *   - better-sqlite3 still installed (used to read source data)
 */

'use strict';

const Database = require('better-sqlite3');
const mysql    = require('mysql2/promise');
const path     = require('path');

const SQLITE_PATH = path.join(__dirname, '../database/mims.db');

const MYSQL_CONFIG = {
  host:     process.env.MYSQL_HOST     || 'localhost',
  port:     process.env.MYSQL_PORT     || 3306,
  user:     process.env.MYSQL_USER     || 'devuser',
  password: process.env.MYSQL_PASSWORD || 'devpass',
  database: process.env.MYSQL_DATABASE || 'mims_dev',
  // Increase packet size limit for large TEXT/BLOB columns
  maxAllowedPacket: 16 * 1024 * 1024,
};

/**
 * Tables in dependency-safe order.
 * MIMS has no declared FOREIGN KEY constraints, so order is not critical.
 * Listing in logical dependency order anyway (users before audit_logs, etc.)
 * to match insert semantics.
 */
const TABLES = [
  'users',
  'sessions',
  'role_permissions',
  'organisations',
  'sites',
  'workflow_states',
  'source_types',
  'products',
  'email_accounts',
  'inquiries',
  'inquiry_attachments',
  'inquiry_notes',
  'reply_templates',
  'user_module_permissions',
  'login_audit',
  'audit_logs',
  'service_logs',
];

async function migrate() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  MIMS: SQLite → MySQL Migration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── Open SQLite ─────────────────────────────────────────────
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

  // ── Safety: disable FK checks during migration ───────────────────────────
  await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
  await conn.execute('SET unique_checks = 0');

  // ── Truncate all tables first (clear seed data from schema init) ──────────
  // db.js seeds users + role_permissions on first run. We truncate so SQLite
  // data is authoritative. FK checks are off so truncate order doesn't matter.
  console.log('🧹 Clearing MySQL tables before migration (removing seed data)...\n');
  for (const table of [...TABLES].reverse()) {
    try {
      await conn.execute(`TRUNCATE TABLE \`${table}\``);
    } catch (_) { /* table may not exist yet — safe to ignore */ }
  }

  const stats = { migrated: 0, skipped: 0, errors: 0 };

  // ── Helper: convert ISO 8601 datetime strings to MySQL DATETIME format ────
  // SQLite stores app-set timestamps as JS ISO strings (2026-03-23T17:11:18.285Z)
  // MySQL DATETIME requires (2026-03-23 17:11:18).
  function toMySQLValue(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        return d.toISOString().replace('T', ' ').substring(0, 19);
      }
    }
    return v;
  }

  // ── Migrate each table ────────────────────────────────────────
  for (const table of TABLES) {
    try {
      // Check table exists in SQLite
      const tableExists = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(table);

      if (!tableExists) {
        console.log(`⊘  ${table}: not found in SQLite — skipped`);
        stats.skipped++;
        continue;
      }

      // Read all rows from SQLite
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
          const values = columns.map(col => toMySQLValue(row[col]));
          await conn.execute(sql, values);
        }
        await conn.commit();
      } catch (insertErr) {
        await conn.rollback();
        throw insertErr;
      }

      // Reset AUTO_INCREMENT to max(id) + 1 so future inserts don't collide
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

  // ── Re-enable FK checks ───────────────────────────────────────
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

    const sqliteCount                 = sqlite.prepare(`SELECT COUNT(*) AS c FROM \`${table}\``).get().c;
    const [[{ c: mysqlCount }]] = await conn.execute(`SELECT COUNT(*) AS c FROM \`${table}\``);

    const match = sqliteCount === mysqlCount;
    if (!match) allMatch = false;
    console.log(`${match ? '✅' : '❌'} ${table.padEnd(30)} SQLite: ${String(sqliteCount).padStart(6)}  MySQL: ${mysqlCount}`);
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
