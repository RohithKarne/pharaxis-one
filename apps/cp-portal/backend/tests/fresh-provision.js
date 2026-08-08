/**
 * Fresh-database provisioning — the migration runner against an empty database.
 *
 * Why this file exists: CP Portal could not provision a new database at all.
 * server.js runs runMigrations() before initializeDatabase(), but the 42
 * CREATE TABLEs lived only in db.js, so on an empty database the first
 * FK-bearing migration (0002 -> cp_clients) died with ER_FK_CANNOT_OPEN_PARENT
 * and startup exited 1. Reversing the two calls does not fix it either: db.js
 * had absorbed several later changes, so a bootstrapped schema then collides
 * with 0005 and 0009 on duplicate columns. 0000_baseline.sql resolves both by
 * carrying the whole schema and recording 0002-0012 as applied.
 *
 * The test that matters most is F3. The baseline records 0002-0012 from inside
 * its own SQL, so a runner that reads the applied-set once before the loop
 * cannot see those rows and will run 0002-0012 anyway — reintroducing the exact
 * duplicate-column failure the baseline exists to avoid. F3 fails against that
 * runner and passes against the per-file check.
 *
 * No database. migrate.js is exercised for real against a fake pool that models
 * cp_schema_migrations; the SQL itself is not executed, so this proves the
 * ordering and bookkeeping, NOT that the DDL is valid MySQL. Validating the DDL
 * needs a real server and is not covered here.
 *
 * Run: node tests/fresh-provision.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

let failures = 0;
const pending = [];
function check(name, fn) { pending.push({ name, fn }); }

const migrationsDir = path.resolve(__dirname, '../database/migrations');

function stub(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// ── Fake database ───────────────────────────────────────────────────────────
// Models exactly one table — cp_schema_migrations — and records every statement
// the runner executes so the tests can assert what actually ran.

function makeDb(preApplied = []) {
  const state = {
    applied   : new Set(preApplied),
    ran       : [],   // every statement executed inside a migration file
    ranByFile : {},   // filename -> statements, in order
    current   : null,
  };

  // splitSql keeps each statement's leading "--" comment block attached to it,
  // so the statement text does not start at the keyword. MySQL is happy with
  // that; these assertions are not, so comments are stripped before matching.
  const norm = sql => String(sql)
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Both pool.query and connection.query land here.
  function query(sql, params = []) {
    const text = norm(sql);

    // The runner's per-file guard.
    const guard = /SELECT 1 AS applied FROM cp_schema_migrations WHERE filename = \?/i;
    if (guard.test(text)) {
      return [state.applied.has(params[0]) ? [{ applied: 1 }] : [], []];
    }

    // The runner's own bookkeeping insert, one row, parameterised.
    if (/^INSERT INTO cp_schema_migrations/i.test(text)) {
      state.applied.add(params[0]);
      return [{ affectedRows: 1 }, []];
    }

    // A statement from inside a migration file.
    if (state.current) {
      state.ran.push({ file: state.current, sql: text });
      (state.ranByFile[state.current] ||= []).push(text);

      // The baseline records 0002-0012 as applied from within its own SQL.
      if (/^INSERT IGNORE INTO cp_schema_migrations/i.test(text)) {
        for (const [, name] of text.matchAll(/'(\d{4}_[^']+\.sql)'/g)) state.applied.add(name);
      }
    }
    return [[], []];
  }

  const connection = {
    beginTransaction: async () => {},
    commit          : async () => {},
    rollback        : async () => {},
    release         : () => {},
    query           : async (sql, params) => query(sql, params),
  };

  const pool = {
    query      : async (sql, params) => query(sql, params),
    getConnection: async () => connection,
  };

  return { state, pool, norm };
}

// migrate.js requires ../database/db for the pool. Stubbed before it is loaded
// so no real pool is ever created.
const db = makeDb();
stub('../database/db', { pool: db.pool, initializeDatabase: async () => {} });

const { runMigrations } = require('../database/migrate');

// The runner logs one line per file. Swapping in a recorder keeps the output
// readable and gives the tests the applied/skipped decision directly.
function silentLogger() {
  const lines = [];
  return { log: msg => lines.push(String(msg)), lines };
}

// migrate.js closes over the pool it imported at require time, so every run
// shares one fake. Reset its state between tests instead of re-requiring.
function reset(preApplied = []) {
  db.state.applied = new Set(preApplied);
  db.state.ran = [];
  db.state.ranByFile = {};
  db.state.current = null;
}

// The runner reads files itself, so wrap fs.readFileSync to know which file each
// statement belongs to.
const realReadFileSync = fs.readFileSync;
fs.readFileSync = function (file, ...rest) {
  const name = path.basename(String(file));
  if (String(file).startsWith(migrationsDir) && name.endsWith('.sql')) db.state.current = name;
  return realReadFileSync.call(this, file, ...rest);
};

const ALL_FILES = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
const SQUASHED  = ALL_FILES.filter(f => /^00(0[2-9]|1[0-2])_/.test(f));

// ── F1: the baseline is first ───────────────────────────────────────────────

check('F1  0000_baseline.sql sorts ahead of every other migration', () => {
  assert.strictEqual(ALL_FILES[0], '0000_baseline.sql',
    `baseline must run first, got ${ALL_FILES[0]}`);
});

// ── F2: an empty database provisions ────────────────────────────────────────

check('F2  a fresh database runs the baseline and nothing that needs a parent table', async () => {
  reset([]);
  const logger = silentLogger();
  await runMigrations({ logger });

  const filesRun = Object.keys(db.state.ranByFile).sort();
  assert.deepStrictEqual(filesRun, ['0000_baseline.sql', '0001_create_schema_migrations.sql'],
    `only the baseline and the migrations table should execute on an empty database, got ${filesRun.join(', ')}`);

  // Every table is present afterwards.
  assert.ok(db.state.ranByFile['0000_baseline.sql'].some(s => /CREATE TABLE IF NOT EXISTS cp_clients/i.test(s)),
    'baseline must create cp_clients — the parent 0002 could not open');
});

// ── F3: the regression guard ────────────────────────────────────────────────
// This is the one that fails against a runner that snapshots the applied-set
// before the loop.

check('F3  the squashed migrations never execute on a fresh database', async () => {
  reset([]);
  await runMigrations({ logger: silentLogger() });

  for (const file of SQUASHED) {
    assert.ok(!db.state.ranByFile[file],
      `${file} ran on a fresh database — its columns are already in the baseline, so this is the duplicate-column failure the baseline exists to prevent`);
  }

  // Stated directly: no ADD COLUMN reaches the database on a fresh install.
  const addColumn = db.state.ran.find(r => /ADD COLUMN/i.test(r.sql));
  assert.strictEqual(addColumn, undefined,
    `no ADD COLUMN should run on a fresh database, but ${addColumn?.file} issued one`);

  // And they are recorded, so a later run still skips them.
  for (const file of SQUASHED) {
    assert.ok(db.state.applied.has(file), `${file} should be recorded as applied by the baseline`);
  }
});

// ── F4: existing databases are untouched ────────────────────────────────────

check('F4  an existing database applies only the baseline, as a no-op', async () => {
  // An already-provisioned environment: 0001-0012 recorded, 0000 is new.
  reset(ALL_FILES.filter(f => f !== '0000_baseline.sql'));
  await runMigrations({ logger: silentLogger() });

  const filesRun = Object.keys(db.state.ranByFile);
  assert.deepStrictEqual(filesRun, ['0000_baseline.sql'],
    `only the baseline should run against an existing database, got ${filesRun.join(', ')}`);

  // Every statement it runs must be incapable of changing an existing schema.
  for (const sql of db.state.ranByFile['0000_baseline.sql']) {
    const safe = /^CREATE TABLE IF NOT EXISTS/i.test(sql)
              || /^INSERT IGNORE INTO cp_schema_migrations/i.test(sql);
    assert.ok(safe, `baseline statement is not a no-op on an existing database: ${sql.slice(0, 90)}`);
  }
});

// ── F5: the baseline is complete ────────────────────────────────────────────
// It marks 0002-0012 as applied, so anything they create must be in it.

check('F5  the baseline creates every table the squashed migrations create', () => {
  const baseline = realReadFileSync(path.join(migrationsDir, '0000_baseline.sql'), 'utf8');
  const created  = new Set(
    [...baseline.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)].map(m => m[1].toLowerCase())
  );

  const missing = [];
  for (const file of SQUASHED) {
    const body = realReadFileSync(path.join(migrationsDir, file), 'utf8');
    for (const [, table] of body.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)) {
      if (!created.has(table.toLowerCase())) missing.push(`${table} (${file})`);
    }
  }
  assert.deepStrictEqual(missing, [],
    `these tables are skipped by the baseline's bookkeeping but never created by it: ${missing.join(', ')}`);
});

check('F5b the baseline records exactly the migrations it squashes', () => {
  const baseline = realReadFileSync(path.join(migrationsDir, '0000_baseline.sql'), 'utf8');
  const recorded = [...baseline.matchAll(/'(\d{4}_[^']+\.sql)'/g)].map(m => m[1]).sort();
  assert.deepStrictEqual(recorded, SQUASHED,
    'the baseline must record 0002-0012 and nothing else');
});

// ── F6: the baseline stays idempotent ───────────────────────────────────────

check('F6  the baseline contains no statement that would fail on a second run', () => {
  const baseline = realReadFileSync(path.join(migrationsDir, '0000_baseline.sql'), 'utf8');
  const code = baseline
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  assert.ok(!/\bALTER TABLE\b/i.test(code),
    'ALTER TABLE in the baseline would fail on any database that already has the change');
  // MySQL has no CREATE INDEX IF NOT EXISTS — a bare one errors with 1061 on an
  // existing database. Indexes belong inline in the CREATE TABLE.
  assert.ok(!/\bCREATE INDEX\b/i.test(code),
    'CREATE INDEX in the baseline would fail on an existing database — declare it as an inline KEY');
  assert.ok(!/\bDROP\b/i.test(code), 'the baseline must never drop anything');
});

// ── Run ─────────────────────────────────────────────────────────────────────

(async () => {
  for (const { name, fn } of pending) {
    try {
      await fn();
      console.log(`  ok   ${name}`);
    } catch (err) {
      failures += 1;
      console.error(`  FAIL ${name}`);
      console.error(`       ${err.message}`);
    }
  }
  fs.readFileSync = realReadFileSync;
  console.log(failures === 0
    ? `\n${pending.length} checks passed.`
    : `\n${failures} of ${pending.length} checks FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();
