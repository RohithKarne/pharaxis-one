// mysql-dialect-audit: postgres-only — this script READS from PostgreSQL by
// design. It is the decommissioning archive tool.
import dotenv from 'dotenv';
import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

dotenv.config();

/**
 * archivePostgres.js — produce a verifiable archive of the legacy PostgreSQL
 * database before it is decommissioned.
 *
 * WHY NOT pg_dump
 * pg_dump fails outright on this database:
 *
 *   pg_dump: error: query would be affected by row-level security policy
 *            for table "ai_quality_insights_cache"
 *
 * Every table is FORCE ROW LEVEL SECURITY, so even the owning role (qms_app) is
 * filtered, and pg_dump aborts at the first table. It still writes 93 CREATE
 * TABLE statements before dying, which is the dangerous part: the file looks
 * like a backup and contains almost no data.
 *
 * The alternative would be ALTER TABLE ... NO FORCE ROW LEVEL SECURITY across
 * 92 tables, i.e. weakening the security posture of the database we are about
 * to archive as evidence. This script instead sets app.is_superadmin, which the
 * policies themselves honour via qms_is_superadmin() — the same mechanism
 * copyFromPostgres.js uses to read everything successfully. Nothing in the
 * source database is modified.
 *
 * OUTPUT
 *   archive/qms_dev_postgres_archive_<date>.json  — every row of every table
 *   archive/qms_dev_postgres_archive_<date>.sha256
 *
 * The manifest records per-table row counts and a SHA-256 over the payload, so
 * the archive can be shown to be complete and unaltered later.
 *
 * Run: node src/db/mysql/archivePostgres.js
 */

const OUT_DIR = '../archive';
const STAMP = process.env.ARCHIVE_DATE || '2026-08-04';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

// The policies short-circuit on qms_is_superadmin(); without this every tenant
// table reads as empty and the archive would be silently, convincingly wrong.
await client.query("SELECT set_config('app.is_superadmin', 'true', false)");
await client.query(
  "SELECT set_config('app.current_org_id', '00000000-0000-0000-0000-000000000000', false)"
);

const { rows: tableRows } = await client.query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`
);

const data = {};
const counts = {};
let total = 0;

for (const { table_name: table } of tableRows) {
  const { rows } = await client.query(`SELECT * FROM ${table}`);
  data[table] = rows;
  counts[table] = rows.length;
  total += rows.length;
}

const payload = {
  _comment: [
    'Archive of the legacy PostgreSQL database qms_dev, taken at decommissioning.',
    'Produced by src/db/mysql/archivePostgres.js because pg_dump cannot read this',
    'database: every table is FORCE ROW LEVEL SECURITY and pg_dump aborts at the',
    'first table while still emitting a plausible-looking schema-only file.',
    'This is the source-of-record for the PostgreSQL -> MySQL migration and is',
    'retained as validation evidence. See QMS_CSV_IMPACT_POSTGRES_TO_MYSQL_2026-08-04.md'
  ],
  capturedAt: STAMP,
  source: 'postgresql qms_dev',
  tableCount: tableRows.length,
  rowCount: total,
  rowsPerTable: counts,
  data
};

mkdirSync(OUT_DIR, { recursive: true });
const file = `${OUT_DIR}/qms_dev_postgres_archive_${STAMP}.json`;

// Hash EXACTLY the bytes written to disk, including the trailing newline.
// Hashing the JSON body separately produces a digest that `shasum -c` rejects,
// which makes a perfectly good archive look corrupt — the opposite of what a
// validation artifact is for.
const contents = JSON.stringify(payload, null, 1) + '\n';
writeFileSync(file, contents);

const digest = createHash('sha256').update(contents).digest('hex');
writeFileSync(`${file}.sha256`, `${digest}  ${file.split('/').pop()}\n`);

const nonEmpty = Object.values(counts).filter((n) => n > 0).length;
console.log(`archived ${total} rows across ${nonEmpty} non-empty tables (${tableRows.length} total)`);
console.log(`sha256 ${digest.slice(0, 32)}...`);
console.log(`-> ${file}`);

client.release();
await pool.end();
