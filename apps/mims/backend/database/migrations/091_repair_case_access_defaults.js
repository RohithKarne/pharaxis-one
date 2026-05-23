'use strict';

/**
 * Migration 091 — Repair case.view / case.update default_allowed_roles.
 *
 * An earlier revision of migration 090 read the JSON column with a raw
 * JSON.parse. mysql2 returns JSON columns already parsed as arrays, so the
 * parse threw and the array was reset to ['reviewer'], dropping agent/manager/
 * admin. This restores the authoritative role set via a parse-safe union.
 * Idempotent and safe on databases that never hit the bug.
 */

const REQUIRED = {
  'case.view': ['agent', 'manager', 'admin', 'reviewer'],
  'case.update': ['admin', 'agent', 'reviewer'],
};

function parseRoles(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  if (typeof value === 'object') return [];
  try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch (_) { return []; }
}

async function up(conn) {
  for (const [key, required] of Object.entries(REQUIRED)) {
    const [[row]] = await conn.execute(
      'SELECT default_allowed_roles FROM access_activity_privileges WHERE privilege_key = ? AND org_id IS NULL LIMIT 1',
      [key]
    );
    if (!row) continue;

    const current = parseRoles(row.default_allowed_roles);
    const lowerCurrent = current.map((r) => String(r).toLowerCase());
    if (required.every((r) => lowerCurrent.includes(r.toLowerCase()))) continue;

    const merged = Array.from(new Set([...current, ...required].map((r) => String(r))));
    await conn.execute(
      'UPDATE access_activity_privileges SET default_allowed_roles = ? WHERE privilege_key = ? AND org_id IS NULL',
      [JSON.stringify(merged), key]
    );
  }
}

async function down(_conn) {}

module.exports = { up, down };
