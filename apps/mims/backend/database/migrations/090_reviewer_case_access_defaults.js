'use strict';

/**
 * Migration 090 — Restore reviewer access to cases.
 *
 * Sprint work newly gated GET/PUT case routes behind requireScopedCapability
 * ('case.view' / 'case.update'). Those base keys' default_allowed_roles
 * (migrations 019 + 085) never included 'reviewer', so once the gate exists a
 * reviewer with no explicit group grant resolves to scope 'none' → 403 on the
 * whole case list and every case detail. Reviewers could view + edit cases
 * before the gate (the routes were open), so this is a zero-regression fix.
 *
 * default_allowed_roles is a JSON column — mysql2 returns it already parsed as
 * an array. parseRoles handles both that and legacy string values. We union the
 * required roles in rather than overwrite, so existing roles are preserved.
 * Idempotent.
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
    const merged = Array.from(new Set([...current, ...required].map((r) => String(r))));
    const lowerCurrent = current.map((r) => String(r).toLowerCase());
    if (required.every((r) => lowerCurrent.includes(r.toLowerCase()))) continue;

    await conn.execute(
      'UPDATE access_activity_privileges SET default_allowed_roles = ? WHERE privilege_key = ? AND org_id IS NULL',
      [JSON.stringify(merged), key]
    );
  }
}

async function down(_conn) {}

module.exports = { up, down };
