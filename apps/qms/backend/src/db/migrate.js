// mysql-dialect-audit: postgres-only — this is the PostgreSQL migration runner.
// Its qms_schema_migrations bookkeeping DDL is Postgres-specific by design;
// the MySQL counterpart lives in src/db/mysql/migrate.js.
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDbPool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS qms_schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query('SELECT filename FROM qms_schema_migrations');
  return new Set(rows.map((row) => row.filename));
}

async function applyMigrations() {
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    for (const file of files) {
      if (applied.has(file)) continue;

      const fullPath = path.join(migrationsDir, file);
      const sql = await readFile(fullPath, 'utf8');

      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO qms_schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');

      console.log(`[qms-backend] migration applied: ${file}`);
    }

    console.log('[qms-backend] migrations complete');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigrations().catch((error) => {
  console.error('[qms-backend] migration failed', error);
  process.exit(1);
});
