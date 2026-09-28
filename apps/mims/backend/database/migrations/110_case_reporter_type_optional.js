'use strict';
// Migration 110 — a case reporter's type may be left unselected.
//
// WHY
// New Case now keeps the reporter typed at intake (360 walk M-49, 2026-09-28).
// Reporter Type is optional — no org's admin settings require it, and the QA
// rule already warns "Reporter type not selected" — but the column was
// NOT NULL DEFAULT 'HCP', and 'HCP' is not in any org's governed reporter-type
// list. An unselected type would have been stored as a qualification nobody chose.
//
// SAFETY
// Only relaxes NOT NULL. The default stays 'HCP', so a writer that omits the
// column behaves exactly as before. No rows change. Skipped when already nullable.

async function up(conn) {
  const [[col]] = await conn.execute(
    `SELECT IS_NULLABLE FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'case_reporter' AND column_name = 'reporter_type'`
  );
  if (!col || col.IS_NULLABLE === 'YES') return;
  await conn.execute(
    "ALTER TABLE case_reporter MODIFY reporter_type VARCHAR(50) COLLATE utf8mb4_unicode_ci NULL DEFAULT 'HCP'"
  );
}

module.exports = { up };
