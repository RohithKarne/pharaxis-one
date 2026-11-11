'use strict';

/**
 * Migration 190 — help topics for two screens that no longer exist are switched
 * off (full audit, 2026-11-11).
 *
 * WHY
 * The Policy Graph and Content Intelligence screens were cut, and the policy
 * graph routes went with the audit. Their help topics still showed in the help
 * list and counted in the help coverage check, describing screens nobody can open.
 * The rows are kept and marked inactive, so an organisation's own edits are not lost.
 */

const RETIRED = ['admin.policy_graph', 'admin.content_intelligence'];

async function up(conn) {
  await conn.execute(
    `UPDATE help_articles SET is_active = 0 WHERE feature_key IN (${RETIRED.map(() => '?').join(',')})`,
    RETIRED
  );
}

async function down(_conn) {}

module.exports = { up, down };
