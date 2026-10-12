'use strict';

/**
 * Migration 168 — two-step sign-in for platform administrators (Rohith's
 * Tier 1 sign-in decisions, 2026-10-12; MIPM-98).
 *
 * Two-step sign-in was set per organisation, and a platform administrator
 * has none, so the most powerful account signed in with a password only. The
 * four two-step tables keyed every row by an organisation and refused any
 * other value through a foreign key. The platform scope now uses org_id 0:
 * the foreign key to organisations is dropped on those four tables (the user
 * foreign key stays, so rows still go with their user) and a system setting
 * switches the requirement on, on by default.
 */

const TWO_FACTOR_TABLES = ['user_2fa_settings', 'user_2fa_backup_codes', 'user_2fa_trusted_devices', 'user_2fa_challenges'];

async function up(conn) {
  for (const table of TWO_FACTOR_TABLES) {
    const [rows] = await conn.execute(
      `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'org_id' AND REFERENCED_TABLE_NAME = 'organisations'`,
      [table]
    );
    for (const { name } of rows) {
      await conn.execute(`ALTER TABLE ${table} DROP FOREIGN KEY \`${name}\``);
    }
  }
  await conn.execute(
    `INSERT INTO system_config (config_key, config_value)
     SELECT 'platform_admin_two_factor_required', '1' FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM system_config WHERE config_key = 'platform_admin_two_factor_required')`
  );
}

async function down() {
  // The dropped foreign keys are not put back: rows with org_id 0 would refuse them.
}

module.exports = { up, down };
