/**
 * migrate-timestamps-to-utc.js  (CP-13)
 *
 * One-time conversion of legacy DATETIME values from the old server-local
 * timezone (Asia/Calcutta, +05:30) to UTC.
 *
 * WHY: the DB server historically ran on IST, so CURRENT_TIMESTAMP / NOW()
 * stored IST wall-clock values. As of the mysql2 timezone:'Z' + session
 * time_zone '+00:00' change, NEW writes are UTC — but existing rows are still
 * IST and read 5h30m ahead. This shifts existing machine-timestamp values back
 * by 330 minutes so they become true UTC.
 *
 * SAFETY — read before running:
 *   - Dry-run by default. Pass --confirm to actually apply.
 *   - Idempotent: records completion in cp_data_migrations and refuses to
 *     run twice (prevents double-subtraction).
 *   - Only shifts INSTANT columns (DEFAULT CURRENT_TIMESTAMP / *_at / known
 *     audit fields). Admin-entered CALENDAR dates (event_date, effective_date,
 *     expires_at, publish_at, preferred_date, start/end dates) are NOT touched
 *     automatically — they are listed for manual review, because shifting a
 *     date-only value by -5:30 would move it to the previous day.
 *   - Wrapped in a single transaction; rolls back on any error.
 *
 * ⚠️ BACK UP THE DATABASE before running with --confirm.
 *
 * Usage:
 *   node scripts/migrate-timestamps-to-utc.js            # dry run (prints plan)
 *   node scripts/migrate-timestamps-to-utc.js --confirm  # apply
 */

require('dotenv').config();
const { pool } = require('../database/db');

const OFFSET_MINUTES = 330; // IST (+05:30) → UTC
const MIGRATION_KEY  = 'timestamps_ist_to_utc_2026_07';

// Columns that hold admin-entered calendar dates, not machine instants — never
// auto-shift these. They are surfaced in the dry run for manual review.
const REVIEW_ONLY = new Set([
  'event_date', 'start_date', 'end_date', 'effective_date', 'expiry_date',
  'expires_at', 'publish_at', 'preferred_date',
]);

function isInstantColumn(col) {
  if (REVIEW_ONLY.has(col.COLUMN_NAME)) return false;
  const def   = String(col.COLUMN_DEFAULT || '').toUpperCase();
  const extra = String(col.EXTRA || '').toUpperCase();
  if (def.includes('CURRENT_TIMESTAMP') || extra.includes('CURRENT_TIMESTAMP')) return true;
  return /_at$/.test(col.COLUMN_NAME); // created_at, updated_at, submitted_at, last_login_at, synced_at, ...
}

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cp_data_migrations (
      migration_key VARCHAR(191) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function alreadyApplied() {
  const [[row]] = await pool.execute(
    'SELECT migration_key FROM cp_data_migrations WHERE migration_key = ?',
    [MIGRATION_KEY]
  );
  return !!row;
}

// Never touch: other apps' tables sharing this DB (e.g. finapp_*) and our own
// migration/bootstrap tracking tables.
const EXCLUDE_TABLES = new Set(['cp_data_migrations', 'cp_schema_migrations', 'cp_schema_bootstrap_state']);

async function discoverColumns(dbName) {
  const [rows] = await pool.execute(`
    SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, EXTRA
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND DATA_TYPE IN ('datetime', 'timestamp')
      AND TABLE_NAME LIKE 'cp\\_%'
    ORDER BY TABLE_NAME, COLUMN_NAME
  `, [dbName]);
  // Scope strictly to CP Portal tables and drop framework/tracking tables.
  return rows.filter(r => r.TABLE_NAME.startsWith('cp_') && !EXCLUDE_TABLES.has(r.TABLE_NAME));
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const dbName  = process.env.MYSQL_DATABASE || 'pharaxis_cp_portal_dev';

  await ensureMigrationsTable();
  if (await alreadyApplied()) {
    console.log(`Migration '${MIGRATION_KEY}' already applied — nothing to do.`);
    return;
  }

  const cols   = await discoverColumns(dbName);
  const toShift = cols.filter(isInstantColumn);
  const review  = cols.filter(c => !isInstantColumn(c));

  console.log(`Found ${cols.length} DATETIME/TIMESTAMP columns.`);
  console.log(`  → ${toShift.length} instant columns will shift IST→UTC (−${OFFSET_MINUTES} min).`);
  console.log(`  → ${review.length} calendar-date columns left UNTOUCHED (manual review):`);
  review.forEach(c => console.log(`       ${c.TABLE_NAME}.${c.COLUMN_NAME}`));
  console.log('');

  if (!confirm) {
    console.log('DRY RUN — statements that WOULD run:');
    toShift.forEach(c => console.log(
      `  UPDATE \`${c.TABLE_NAME}\` SET \`${c.COLUMN_NAME}\` = DATE_SUB(\`${c.COLUMN_NAME}\`, INTERVAL ${OFFSET_MINUTES} MINUTE) WHERE \`${c.COLUMN_NAME}\` IS NOT NULL;`
    ));
    console.log('\nNothing changed. Re-run with --confirm to apply. BACK UP FIRST.');
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const c of toShift) {
      const [res] = await conn.query(
        `UPDATE \`${c.TABLE_NAME}\` SET \`${c.COLUMN_NAME}\` = DATE_SUB(\`${c.COLUMN_NAME}\`, INTERVAL ? MINUTE) WHERE \`${c.COLUMN_NAME}\` IS NOT NULL`,
        [OFFSET_MINUTES]
      );
      console.log(`  ${c.TABLE_NAME}.${c.COLUMN_NAME}: ${res.affectedRows} rows shifted`);
    }
    await conn.query('INSERT INTO cp_data_migrations (migration_key) VALUES (?)', [MIGRATION_KEY]);
    await conn.commit();
    console.log(`\n✅ Applied and recorded '${MIGRATION_KEY}'.`);
  } catch (err) {
    await conn.rollback();
    console.error('❌ Error — rolled back, no changes made:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
  }
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
