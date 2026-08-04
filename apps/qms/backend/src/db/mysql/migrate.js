import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

/**
 * MySQL migration runner — the counterpart to src/db/migrate.js.
 *
 * IMPORTANT DIFFERENCE FROM POSTGRES: MySQL DDL is not transactional. Every
 * CREATE/ALTER implicitly commits, so the BEGIN/ROLLBACK protection the
 * Postgres runner relies on does not exist here. A migration that fails halfway
 * leaves the database partly migrated and CANNOT be rolled back automatically.
 *
 * Consequences, deliberately chosen rather than papered over:
 *   - a failed file is NOT recorded in qms_schema_migrations, so a re-run will
 *     retry it from the start; a partly-applied file will then fail again on the
 *     statements that already succeeded
 *   - therefore the schema is validated against a scratch database first by
 *     tests/mysql-schema-check.mjs, which builds from empty on every run
 *
 * Run: node src/db/mysql/migrate.js
 */

function connectionConfig() {
  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'devuser',
    password: process.env.MYSQL_PASSWORD || 'devpass',
    database: process.env.MYSQL_DATABASE || 'pharaxis_qms_dev',
    multipleStatements: true
  };
}

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS qms_schema_migrations (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    )
  `);
}

async function getAppliedMigrations(conn) {
  const [rows] = await conn.query('SELECT filename FROM qms_schema_migrations');
  return new Set(rows.map((row) => row.filename));
}

async function applyMigrations() {
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const conn = await mysql.createConnection(connectionConfig());
  await conn.query("SET time_zone = '+00:00'");

  try {
    await ensureMigrationsTable(conn);
    const applied = await getAppliedMigrations(conn);

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = (await readFile(path.join(migrationsDir, file), 'utf8')).trim();
      if (!sql) continue;

      try {
        await conn.query(sql);
      } catch (error) {
        console.error(
          `[qms-backend] migration FAILED partway: ${file}\n` +
            `  ${error.code || ''} ${error.sqlMessage || error.message}\n` +
            '  MySQL cannot roll back DDL — inspect the database before re-running.'
        );
        throw error;
      }

      await conn.query('INSERT INTO qms_schema_migrations (filename) VALUES (?)', [file]);
      console.log(`[qms-backend] migration applied: ${file}`);
    }

    console.log('[qms-backend] mysql migrations complete');
  } finally {
    await conn.end();
  }
}

applyMigrations().catch((error) => {
  console.error('[qms-backend] mysql migration failed', error.message);
  process.exit(1);
});
