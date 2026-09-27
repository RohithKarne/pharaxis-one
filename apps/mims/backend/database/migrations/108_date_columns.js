'use strict';

/**
 * Migration 108 — three date columns stop being text.
 *
 *   inquiries.received_at  VARCHAR(100) 'YYYY-MM-DD HH:MM:SS' (UTC, from the poller) -> DATETIME NULL
 *   inquiries.due_date     VARCHAR(100) 'YYYY-MM-DD' (the date picker)               -> DATE NULL
 *   sessions.expires_at    VARCHAR(100) 'YYYY-MM-DD HH:MM:SS' (UTC, the JWT exp)      -> DATETIME NOT NULL
 *
 * As text these were compared and sorted as strings, and read back in JS as bare
 * timestamps that the server parses in its own timezone (the parseInquiryDate 'Z' fix).
 * As DATETIME the pool (timezone '+00:00') hands JS a real UTC Date.
 *
 * Bad values are dealt with before the type change, never by it:
 *   - blank text in an inquiry column becomes NULL — it held no date, nothing is lost;
 *   - a session whose expiry is blank or unreadable is deleted — that user signs in again;
 *   - any other inquiry value that is not exactly the expected format stops the migration,
 *     and so the server start, with a count and sample ids — no date is dropped silently.
 * A value passes only if formatting it back gives the identical string, so down() can
 * restore it byte for byte.
 *
 * Measured on pharaxis_mims_dev, 2026-09-27: 482,405 received_at, every one
 * 'YYYY-MM-DD HH:MM:SS'; due_date 267,959 'YYYY-MM-DD' and 214,446 NULL; no blanks; sessions empty.
 *
 * down() turns the columns back into VARCHAR(100). MySQL writes a DATETIME as
 * 'YYYY-MM-DD HH:MM:SS' and a DATE as 'YYYY-MM-DD' — the formats they held. A blank that
 * up() turned into NULL comes back as NULL, and a deleted session does not come back.
 */

const TEXT = 'VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';

const COLUMNS = [
  { table: 'inquiries', column: 'received_at', format: '%Y-%m-%d %H:%i:%s', type: 'DATETIME NULL DEFAULT NULL', text: `${TEXT} NULL DEFAULT NULL` },
  { table: 'inquiries', column: 'due_date', format: '%Y-%m-%d', type: 'DATE NULL DEFAULT NULL', text: `${TEXT} NULL DEFAULT NULL` },
  { table: 'sessions', column: 'expires_at', format: '%Y-%m-%d %H:%i:%s', type: 'DATETIME NOT NULL', text: `${TEXT} NOT NULL` },
];

// True when the text is exactly one date in the column's format. Compared as bytes, so a
// trailing space (equal under the column's PAD SPACE collation) does not pass.
// SELECT only: under strict mode STR_TO_DATE on a bad value is an error inside UPDATE/DELETE.
function readableSql({ column, format }) {
  const parsed = `STR_TO_DATE(${column}, '${format}')`;
  return `(${parsed} IS NOT NULL AND CAST(DATE_FORMAT(${parsed}, '${format}') AS BINARY) = CAST(${column} AS BINARY))`;
}

async function dataType(conn, table, column) {
  const [[row]] = await conn.execute(
    `SELECT DATA_TYPE AS t FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return row ? String(row.t).toLowerCase() : null;
}

async function up(conn) {
  const pending = [];
  for (const col of COLUMNS) {
    if (await dataType(conn, col.table, col.column) === 'varchar') pending.push(col);
  }
  const inquiryCols = pending.filter((c) => c.table === 'inquiries');
  const sessionCols = pending.filter((c) => c.table === 'sessions');

  // 1. Refuse unreadable inquiry dates before changing anything.
  for (const col of inquiryCols) {
    const bad = `${col.column} IS NOT NULL AND TRIM(${col.column}) <> '' AND NOT ${readableSql(col)}`;
    const [[{ n }]] = await conn.execute(`SELECT COUNT(*) AS n FROM inquiries WHERE ${bad}`);
    if (Number(n) > 0) {
      const [sample] = await conn.execute(`SELECT id FROM inquiries WHERE ${bad} ORDER BY id LIMIT 10`);
      throw new Error(
        `108: ${n} inquiries.${col.column} value(s) are not '${col.format}' — fix or clear them first. ` +
        `Sample ids: ${sample.map((r) => r.id).join(', ')}`
      );
    }
  }

  // 2. Blank inquiry dates become NULL, then one table rebuild converts both columns.
  for (const col of inquiryCols) {
    const [res] = await conn.execute(
      `UPDATE inquiries SET ${col.column} = NULL WHERE ${col.column} IS NOT NULL AND TRIM(${col.column}) = ''`
    );
    console.log(`[DB] 108: inquiries.${col.column} — ${res.affectedRows} blank value(s) set to NULL`);
  }
  if (inquiryCols.length) {
    await conn.execute(
      `ALTER TABLE inquiries ${inquiryCols.map((c) => `MODIFY COLUMN ${c.column} ${c.type}`).join(', ')}`
    );
  }

  // 3. Sessions with an unreadable expiry are ended, then the column converts.
  for (const col of sessionCols) {
    const [bad] = await conn.execute(`SELECT id FROM sessions WHERE NOT ${readableSql(col)}`);
    if (bad.length) {
      await conn.query(`DELETE FROM sessions WHERE id IN (${bad.map((r) => Number(r.id)).join(', ')})`);
    }
    console.log(`[DB] 108: sessions — ${bad.length} session(s) with an unreadable expires_at deleted`);
    await conn.execute(`ALTER TABLE sessions MODIFY COLUMN ${col.column} ${col.type}`);
  }
}

async function down(conn) {
  for (const table of ['inquiries', 'sessions']) {
    const cols = [];
    for (const col of COLUMNS.filter((c) => c.table === table)) {
      if (['datetime', 'date'].includes(await dataType(conn, col.table, col.column))) cols.push(col);
    }
    if (cols.length) {
      await conn.execute(`ALTER TABLE ${table} ${cols.map((c) => `MODIFY COLUMN ${c.column} ${c.text}`).join(', ')}`);
    }
  }
}

module.exports = { up, down };
