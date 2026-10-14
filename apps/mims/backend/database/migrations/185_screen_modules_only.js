'use strict';

/**
 * Migration 185 — only modules that open a screen (access review, Saad
 * 2026-10-14).
 *
 * WHY
 * Six module keys — case management, case query, utilities, analytics, user
 * management and data visualisation — were granted to roles and people but
 * open no screen and are checked nowhere.
 *
 * WHAT
 * Removes them from each role's defaults and from each person's grants.
 */

const DEAD = ['case_mgmt', 'case_query', 'utilities', 'analytics', 'user_mgmt', 'data_visualization'];

async function up(conn) {
  const marks = DEAD.map(() => '?').join(',');
  await conn.execute(`DELETE FROM role_permissions WHERE module IN (${marks})`, DEAD);
  await conn.execute(`DELETE FROM user_module_permissions WHERE module IN (${marks})`, DEAD);
}

module.exports = { up };
