/**
 * mysql-schema-check.mjs — does the converted MySQL schema actually apply, and
 * does it match the PostgreSQL schema it was converted from?
 *
 * Phase 1 of the PostgreSQL -> MySQL migration. This is the gate: a converted
 * .sql file that has never been executed is not evidence of anything.
 *
 * What it does
 *   1. Drops and recreates a scratch database, so every run is from zero.
 *   2. Applies every file in src/db/mysql/migrations in filename order, and
 *      reports the exact file that fails.
 *   3. Compares the result against the PostgreSQL schema of record:
 *        - missing tables / extra tables      -> FAIL
 *        - missing columns / extra columns    -> FAIL
 *        - nullability mismatch               -> FAIL
 *        - foreign-key shortfall per table    -> FAIL
 *        - type differences                   -> reported, not failed
 *          (uuid -> char(36), timestamptz -> datetime(3) etc. are intentional)
 *
 * THE POSTGRES SIDE IS A FROZEN SNAPSHOT, NOT A LIVE CONNECTION.
 * tests/fixtures/postgres-schema-snapshot.json was captured from the live
 * qms_dev database on 2026-08-04, immediately before it was decommissioned. It
 * carries exactly the three things this check ever asked Postgres for —
 * information_schema.columns, the per-table FOREIGN KEY counts, and the
 * org_id-bearing table list — so every assertion below is unchanged; only the
 * source of the expected values moved. This is what makes the legacy database
 * disposable.
 *
 * The snapshot is the schema AS AT THE CUTOVER. It is deliberately not
 * self-updating: any future divergence is a real change to the converted
 * schema and must be reviewed, then the snapshot regenerated from a PostgreSQL
 * instance of record — not silently absorbed.
 *
 * Run: node tests/mysql-schema-check.mjs
 */

import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

dotenv.config();

const MIGRATIONS_DIR = 'src/db/mysql/migrations';
const SNAPSHOT_FILE = 'tests/fixtures/postgres-schema-snapshot.json';
const SCRATCH_DB = process.env.QMS_MYSQL_SCRATCH_DB || 'pharaxis_qms_schemacheck';

const MYSQL = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'devuser',
  password: process.env.MYSQL_PASSWORD || 'devpass',
  multipleStatements: true
};

let failures = 0;
function fail(message) {
  console.error(`FAIL ${message}`);
  failures += 1;
}

// ---- 1. apply the converted migrations to a clean scratch database ----------

let files;
try {
  files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
} catch {
  console.error(`No migrations directory at ${MIGRATIONS_DIR}/ — nothing converted yet.`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`${MIGRATIONS_DIR}/ is empty — nothing converted yet.`);
  process.exit(1);
}

console.log(`applying ${files.length} MySQL migration(s) to ${SCRATCH_DB}\n`);

const admin = await mysql.createConnection(MYSQL);
await admin.query(`DROP DATABASE IF EXISTS \`${SCRATCH_DB}\``);
await admin.query(
  `CREATE DATABASE \`${SCRATCH_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
);
await admin.end();

const my = await mysql.createConnection({ ...MYSQL, database: SCRATCH_DB });
await my.query("SET time_zone = '+00:00'");

let applied = 0;
for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').trim();
  if (!sql) continue;
  try {
    await my.query(sql);
    console.log(`  ok   ${file}`);
    applied += 1;
  } catch (error) {
    fail(`${file} — ${error.code || ''} ${error.sqlMessage || error.message}`);
    console.error(`       (migrations after this one were skipped)`);
    break;
  }
}

console.log(`\napplied ${applied}/${files.length} migration(s)\n`);

// ---- 2. compare against the PostgreSQL schema snapshot ---------------------

/**
 * Load the frozen Postgres schema. An unreadable or truncated snapshot must
 * ABORT, never degrade to "nothing to compare, therefore PASSED" — a parity
 * gate that silently compares against an empty expectation is worse than no
 * gate, because it still prints PASSED.
 */
let snapshot;
try {
  snapshot = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
} catch (error) {
  console.error(`FAIL cannot read ${SNAPSHOT_FILE} — ${error.message}`);
  console.error('       this file is the PostgreSQL schema of record; the check cannot run without it.');
  await my.end();
  process.exit(1);
}

const pgCols = snapshot.columns;
const pgFkByTable = snapshot.foreignKeysByTable;
if (!Array.isArray(pgCols) || pgCols.length === 0 || !pgFkByTable || typeof pgFkByTable !== 'object') {
  console.error(`FAIL ${SNAPSHOT_FILE} is missing 'columns' or 'foreignKeysByTable'`);
  await my.end();
  process.exit(1);
}

console.log(
  `postgres side: snapshot ${SNAPSHOT_FILE} captured ${snapshot.capturedAt} from ${snapshot.source}\n`
);

/**
 * MySQL 8 returns information_schema column labels UPPERCASED (TABLE_NAME, not
 * table_name), while pg returns them lowercased. Reading r.table_name straight
 * off a MySQL row yields undefined and silently collapses every table to the
 * string "undefined" — the check then reports "all tables missing" regardless of
 * how correct the conversion is. Normalise the keys before comparing anything.
 */
const lowerKeys = (row) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));

const [myColsRaw] = await my.query(
  `SELECT table_name, column_name, is_nullable, data_type
     FROM information_schema.columns
    WHERE table_schema = ?
    ORDER BY table_name, column_name`,
  [SCRATCH_DB]
);
const myCols = myColsRaw.map(lowerKeys);

// Bookkeeping table created by the migration RUNNER, not by any migration file.
// It exists in Postgres because migrate.js has already run there; it appears in
// MySQL only after src/db/mysql/migrate.js runs. The scratch database is built
// by applying files directly, so it is legitimately absent and must not count
// as a parity failure.
const RUNNER_TABLES = new Set(['qms_schema_migrations']);
const pgColsCompared = pgCols.filter((r) => !RUNNER_TABLES.has(r.table_name.toLowerCase()));

const key = (r) => `${String(r.table_name).toLowerCase()}.${String(r.column_name).toLowerCase()}`;
const pgMap = new Map(pgColsCompared.map((r) => [key(r), r]));
const myMap = new Map(myCols.map((r) => [key(r), r]));

const pgTables = new Set(pgColsCompared.map((r) => r.table_name.toLowerCase()));
const myTables = new Set(myCols.map((r) => String(r.table_name).toLowerCase()));

const missingTables = [...pgTables].filter((t) => !myTables.has(t));
const extraTables = [...myTables].filter((t) => !pgTables.has(t));

console.log(`tables: postgres ${pgTables.size} | mysql ${myTables.size}`);
console.log(`columns: postgres ${pgMap.size} | mysql ${myMap.size}\n`);

if (missingTables.length) {
  fail(`${missingTables.length} table(s) missing in MySQL`);
  console.error(`       ${missingTables.slice(0, 25).join(', ')}${missingTables.length > 25 ? ' …' : ''}`);
}
if (extraTables.length) {
  fail(`${extraTables.length} table(s) in MySQL that Postgres does not have`);
  console.error(`       ${extraTables.slice(0, 25).join(', ')}`);
}

const missingCols = [...pgMap.keys()].filter(
  (k) => !myMap.has(k) && !missingTables.includes(k.split('.')[0])
);
if (missingCols.length) {
  fail(`${missingCols.length} column(s) missing in MySQL`);
  console.error(`       ${missingCols.slice(0, 30).join(', ')}${missingCols.length > 30 ? ' …' : ''}`);
}

const nullabilityMismatch = [];
for (const [k, pgCol] of pgMap) {
  const myCol = myMap.get(k);
  if (!myCol) continue;
  if (String(pgCol.is_nullable).toUpperCase() !== String(myCol.is_nullable).toUpperCase()) {
    nullabilityMismatch.push(`${k} (pg ${pgCol.is_nullable} / my ${myCol.is_nullable})`);
  }
}
if (nullabilityMismatch.length) {
  fail(`${nullabilityMismatch.length} column(s) differ in NULLability`);
  console.error(`       ${nullabilityMismatch.slice(0, 20).join(', ')}`);
}

// ---- foreign keys -----------------------------------------------------------
// MySQL/InnoDB PARSES inline column-level `REFERENCES t(id)` and then silently
// discards it — no constraint is created and orphan rows are accepted. Only a
// table-level `FOREIGN KEY (col) REFERENCES ...` clause produces a real key.
// Without this check a conversion can drop every FK in the schema and still
// pass on tables, columns, and nullability.
// The snapshot stores this as { table_name: count } — the same GROUP BY result
// the live query returned, one row per table that has at least one FOREIGN KEY.
const pgFk = Object.entries(pgFkByTable).map(([table_name, n]) => ({ table_name, n }));

const [myFkRaw] = await my.query(
  `SELECT tc.table_name, count(*) AS n
     FROM information_schema.table_constraints tc
    WHERE tc.table_schema = ? AND tc.constraint_type = 'FOREIGN KEY'
    GROUP BY tc.table_name`,
  [SCRATCH_DB]
);
const myFk = myFkRaw.map(lowerKeys);

const pgFkMap = new Map(pgFk.map((r) => [r.table_name.toLowerCase(), Number(r.n)]));
const myFkMap = new Map(myFk.map((r) => [String(r.table_name).toLowerCase(), Number(r.n)]));

const pgFkTotal = [...pgFkMap.values()].reduce((a, b) => a + b, 0);
const myFkTotal = [...myFkMap.values()].reduce((a, b) => a + b, 0);
console.log(`foreign keys: postgres ${pgFkTotal} | mysql ${myFkTotal}\n`);

const fkShortfall = [];
for (const [table, n] of pgFkMap) {
  if (missingTables.includes(table)) continue;
  const got = myFkMap.get(table) || 0;
  if (got < n) fkShortfall.push(`${table} (pg ${n} / my ${got})`);
}
if (fkShortfall.length) {
  fail(`${fkShortfall.length} table(s) have fewer foreign keys in MySQL than in Postgres`);
  console.error(
    '       likely cause: inline column-level REFERENCES, which InnoDB ignores.\n' +
      '       use a table-level FOREIGN KEY (col) REFERENCES t(id) clause instead.'
  );
  console.error(`       ${fkShortfall.slice(0, 25).join(', ')}${fkShortfall.length > 25 ? ' …' : ''}`);
}

// Type differences are expected by design — report the mapping, do not fail.
const typeMap = new Map();
for (const [k, pgCol] of pgMap) {
  const myCol = myMap.get(k);
  if (!myCol) continue;
  const pair = `${pgCol.data_type} -> ${myCol.data_type}`;
  typeMap.set(pair, (typeMap.get(pair) || 0) + 1);
}
if (typeMap.size) {
  console.log('type mapping actually produced (informational):');
  for (const [pair, n] of [...typeMap.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${pair}`);
  }
  console.log('');
}

await my.end();

if (failures > 0) {
  console.error(`MySQL schema check: FAILED (${failures} problem group(s))`);
  process.exit(1);
}

console.log('MySQL schema check: PASSED');
