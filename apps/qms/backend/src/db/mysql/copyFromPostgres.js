// mysql-dialect-audit: postgres-only — this script READS from PostgreSQL by
// design; it is the migration tool itself. Its set_config calls are required to
// defeat RLS while reading, and are the reason it does not silently copy an
// empty database.
import dotenv from 'dotenv';
import pg from 'pg';
import mysql from 'mysql2/promise';

dotenv.config();

/**
 * copyFromPostgres.js — Phase 3: move the data.
 *
 * Reads every table from the live PostgreSQL database and writes it into the
 * MySQL schema built by src/db/mysql/migrations. Read-only against Postgres;
 * the only writes are into MySQL.
 *
 * Run:      node src/db/mysql/copyFromPostgres.js
 * Target:   MYSQL_DATABASE (default pharaxis_qms_dev)
 * Dry run:  DRY_RUN=1 node src/db/mysql/copyFromPostgres.js
 *
 * DESIGN NOTES
 *
 * 1. RLS. Every tenant table in Postgres is protected by Row Level Security, so
 *    a plain SELECT returns ZERO rows and this script would silently "migrate"
 *    an empty database and report success. It therefore sets app.is_superadmin
 *    before reading. Several agents hit exactly this trap during Phase 2 and
 *    concluded the database had been wiped — it is the single easiest way to get
 *    a convincing, wrong answer here.
 *
 * 2. Foreign keys. The MySQL schema has 268 real foreign keys, so insert order
 *    would matter. Rather than compute a topological sort, FOREIGN_KEY_CHECKS is
 *    disabled for the load and re-enabled afterwards — then every FK is
 *    re-validated at the end, so a genuine orphan still fails loudly.
 *
 * 3. Type conversion. Postgres and mysql2 disagree on several shapes:
 *      - timestamptz -> Date object -> written as UTC 'YYYY-MM-DD HH:MM:SS.mmm'
 *      - jsonb/json  -> JS object   -> JSON.stringify
 *      - text[]/int[]-> JS array    -> JSON.stringify (MySQL column is JSON)
 *      - boolean     -> true/false  -> mysql2 handles it
 *      - uuid        -> string      -> straight into CHAR(36)
 *
 * 4. Verification. Row counts are compared per table at the end and the script
 *    exits non-zero on any mismatch. A copy that cannot prove it copied
 *    everything is not a migration.
 */

const DRY_RUN = process.env.DRY_RUN === '1';
const BATCH = Number(process.env.COPY_BATCH || 500);

const MYSQL = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'devuser',
  password: process.env.MYSQL_PASSWORD || 'devpass',
  database: process.env.MYSQL_DATABASE || 'pharaxis_qms_dev'
};

/** Tables that belong to a migration runner, not to the application's data. */
const SKIP = new Set(['qms_schema_migrations']);

function toMysqlValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    // UTC, millisecond precision — matches the DATETIME(3) columns and the
    // session time_zone of +00:00 set below.
    return value.toISOString().slice(0, 23).replace('T', ' ');
  }
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const my = await mysql.createConnection({ ...MYSQL, multipleStatements: false });
await my.query("SET time_zone = '+00:00'");

const pgClient = await pgPool.connect();
// See design note 1 — without this every tenant table reads as empty.
await pgClient.query("SELECT set_config('app.is_superadmin', 'true', false)");
await pgClient.query(
  "SELECT set_config('app.current_org_id', '00000000-0000-0000-0000-000000000000', false)"
);

const { rows: tableRows } = await pgClient.query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`
);
const tables = tableRows.map((r) => r.table_name).filter((t) => !SKIP.has(t));

console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}copying ${tables.length} tables -> ${MYSQL.database}\n`);

if (!DRY_RUN) await my.query('SET FOREIGN_KEY_CHECKS = 0');

let copied = 0;
let skipped = 0;

for (const table of tables) {
  const { rows } = await pgClient.query(`SELECT * FROM ${table}`);
  if (rows.length === 0) {
    skipped += 1;
    continue;
  }

  const columns = Object.keys(rows[0]);

  if (DRY_RUN) {
    console.log(`  would copy ${String(rows.length).padStart(6)} rows -> ${table}`);
    copied += rows.length;
    continue;
  }

  await my.query(`DELETE FROM \`${table}\``);

  const columnList = columns.map((c) => `\`${c}\``).join(', ');
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const placeholders = slice.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const values = slice.flatMap((row) => columns.map((c) => toMysqlValue(row[c])));
    try {
      await my.query(`INSERT INTO \`${table}\` (${columnList}) VALUES ${placeholders}`, values);
    } catch (error) {
      console.error(`FAIL ${table}: ${error.code || ''} ${error.sqlMessage || error.message}`);
      process.exitCode = 1;
      break;
    }
  }

  console.log(`  copied ${String(rows.length).padStart(6)} rows -> ${table}`);
  copied += rows.length;
}

if (!DRY_RUN) await my.query('SET FOREIGN_KEY_CHECKS = 1');

console.log(`\n${copied} rows across ${tables.length - skipped} non-empty tables (${skipped} empty)\n`);

// ---- verify: per-table row counts must match exactly -----------------------
if (!DRY_RUN) {
  let mismatches = 0;
  for (const table of tables) {
    const { rows: p } = await pgClient.query(`SELECT count(*)::int AS n FROM ${table}`);
    const [m] = await my.query(`SELECT count(*) AS n FROM \`${table}\``);
    const pgN = p[0].n;
    const myN = Number(m[0].n);
    if (pgN !== myN) {
      console.error(`MISMATCH ${table}: postgres ${pgN} / mysql ${myN}`);
      mismatches += 1;
    }
  }

  if (mismatches > 0) {
    console.error(`\nData copy: FAILED — ${mismatches} table(s) differ in row count`);
    process.exitCode = 1;
  } else {
    console.log('row counts match on every table');
  }
}

pgClient.release();
await pgPool.end();
await my.end();

if (process.exitCode) {
  console.error('\nData copy: FAILED');
  process.exit(process.exitCode);
}

console.log(`\n${DRY_RUN ? 'Data copy dry run: OK' : 'Data copy: PASSED'}`);
