'use strict';
// Migration 129 — two-step sign-in records may belong to no organisation (MIPM-98).
//
// WHY
// A platform admin signed in with a password only: two-step sign-in was stored per
// organisation (org_id NOT NULL), and a platform admin works across organisations,
// so there was nowhere to keep theirs. Their settings, codes, backup codes and
// remembered devices are now kept with org_id NULL — "the platform" — and the sign-in
// code matches it with a NULL-safe comparison.
//
// SAFETY
// Only relaxes NOT NULL on four columns. The foreign keys to organisations stay
// (a NULL value is not checked against them). No row changes. Skipped per column when
// it is already nullable.

const TABLES = ['user_2fa_settings', 'user_2fa_challenges', 'user_2fa_backup_codes', 'user_2fa_trusted_devices'];

async function up(conn) {
  for (const table of TABLES) {
    const [[col]] = await conn.execute(
      `SELECT IS_NULLABLE FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'org_id'`,
      [table]
    );
    if (!col || col.IS_NULLABLE === 'YES') continue;
    await conn.execute(`ALTER TABLE \`${table}\` MODIFY org_id INT NULL`);
  }
}

module.exports = { up };
