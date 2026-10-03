'use strict';

/**
 * Migration 148 — saved views can be shared with the owner's organisation.
 *
 * Saved views (user_preferences) were personal to each user. A team lead can now
 * tick "Share with my organisation" so everyone in that organisation sees the view;
 * only its owner can change or delete it.
 *
 * Adds two columns and an index; no data changes, so every existing view stays
 * personal. Each step is skipped only when it is already applied.
 */

async function up(conn) {
  const steps = [
    ['ALTER TABLE user_preferences ADD COLUMN is_shared TINYINT(1) NOT NULL DEFAULT 0', 'ER_DUP_FIELDNAME'],
    ['ALTER TABLE user_preferences ADD COLUMN org_id INT NULL', 'ER_DUP_FIELDNAME'],
    ['ALTER TABLE user_preferences ADD INDEX idx_user_preferences_shared (org_id, screen_key, is_shared)', 'ER_DUP_KEYNAME'],
  ];
  for (const [sql, alreadyApplied] of steps) {
    try {
      await conn.execute(sql);
    } catch (err) {
      if (err && err.code === alreadyApplied) continue;
      throw err;
    }
  }
}

module.exports = { up };
