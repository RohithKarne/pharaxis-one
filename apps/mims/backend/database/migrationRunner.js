'use strict';

/**
 * migrationRunner.js
 *
 * Runs numbered migration files in database/migrations/ in order.
 * Tracks applied migrations in `schema_migrations` table.
 *
 * Bootstrap logic:
 *   - If `users` table exists but schema_migrations is empty → DB was initialized
 *     by old monolithic db.js.  Mark ALL migration files as applied so existing
 *     data is not disturbed, then run only genuinely new migrations.
 *   - If `users` table does NOT exist → fresh DB. Run all migrations in order.
 */

const path = require('path');
const fs   = require('fs');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations(conn, dbName) {
  // ── 1. Ensure tracking table exists ──────────────────────────────────────
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INT          NOT NULL AUTO_INCREMENT,
      filename    VARCHAR(255) NOT NULL,
      applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_migration_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ── 2. Collect migration files ────────────────────────────────────────────
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{3}_.*\.js$/.test(f))
    .sort();

  if (files.length === 0) {
    console.log('[DB] No migration files found.');
    return;
  }

  // ── 3. Bootstrap detection — existing DB pre-migration-runner ────────────
  // Presence of `users` alone is NOT sufficient evidence of a legacy database.
  // A migration that fails partway (e.g. 001 creates `users`, then throws on a
  // missing bootstrap password) leaves `users` behind on an otherwise empty
  // schema. Treating that as "legacy" stamps every migration as applied, and
  // the database is then permanently stuck with almost no tables while
  // reporting itself fully migrated. Require a populated schema instead.
  const [tableCount] = await conn.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
      WHERE table_schema = ? AND table_name <> 'schema_migrations'`,
    [dbName]
  );
  const [usersCheck] = await conn.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
      WHERE table_schema = ? AND table_name = 'users'
      LIMIT 1`,
    [dbName]
  );

  const LEGACY_MIN_TABLES = 20;
  const hasUsers    = usersCheck[0].cnt > 0;
  const tablesFound = tableCount[0].cnt;
  const dbAlreadyExists = hasUsers && tablesFound >= LEGACY_MIN_TABLES;

  if (hasUsers && !dbAlreadyExists) {
    console.log(
      `[DB] "${dbName}" has a users table but only ${tablesFound} tables — treating as a ` +
      `partially-migrated database and running all migrations, not stamping them as applied.`
    );
  }

  const [appliedRows] = await conn.execute(
    'SELECT filename FROM schema_migrations'
  );
  const appliedSet = new Set(appliedRows.map(r => r.filename));

  if (dbAlreadyExists && appliedSet.size === 0) {
    // Old monolithic db.js initialized this DB — stamp all migrations except
    // the very last one (which may contain genuinely new Sprint 21 tables).
    // Strategy: stamp all BUT the highest-numbered file as applied, then let
    // the runner execute the last file normally (it's all idempotent anyway).
    const toStamp = files.slice(0, -1);
    for (const f of toStamp) {
      await conn.execute(
        'INSERT IGNORE INTO schema_migrations (filename) VALUES (?)',
        [f]
      );
      appliedSet.add(f);
    }
    console.log(`[DB] Bootstrapped ${toStamp.length} migrations for existing database.`);
  }

  // ── 4. Run pending migrations ─────────────────────────────────────────────
  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;
    try {
      const migration = require(path.join(MIGRATIONS_DIR, file));
      await migration.up(conn);
      await conn.execute(
        'INSERT INTO schema_migrations (filename) VALUES (?)',
        [file]
      );
      console.log(`[DB] ✅ Applied migration: ${file}`);
      ran++;
    } catch (err) {
      console.error(`[DB] ❌ Migration failed: ${file} — ${err.message}`);
      throw err;
    }
  }

  if (ran === 0) {
    console.log('[DB] All migrations already applied — nothing to run.');
  }
}

module.exports = { runMigrations };
