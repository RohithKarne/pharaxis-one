#!/usr/bin/env node
'use strict';

/**
 * seed-e2e.js — deterministic test data for the CP Portal E2E suite.
 *
 * The negative tests post to /api/portal/submit/novartis/... and expect a 400
 * for an invalid form type. Without a `novartis` client that route returns 404
 * instead, so the test fails for the wrong reason. This creates the fixtures
 * those tests assume.
 *
 * Safety: refuses to run against any database whose name does not end in
 * `_test`. It deletes and recreates its own rows and must never touch dev.
 *
 * Usage:
 *   MYSQL_DATABASE=pharaxis_cp_portal_test node backend/tests/seed-e2e.js
 */

const bcrypt = require('bcrypt');
const mysql  = require('mysql2/promise');

const DB       = process.env.MYSQL_DATABASE || '';
const HOST     = process.env.MYSQL_HOST     || 'localhost';
const PORT     = parseInt(process.env.MYSQL_PORT || '3306', 10);
const USER     = process.env.MYSQL_USER     || 'devuser';
const PASSWORD = process.env.MYSQL_PASSWORD || 'devpass';

const ADMIN_EMAIL    = process.env.E2E_CP_ADMIN_EMAIL    || 'cpadmin';
const ADMIN_PASSWORD = process.env.E2E_CP_ADMIN_PASSWORD || 'Test@1234';

// `novartis` is referenced directly by e2e/negative.spec.js.
const CLIENTS = [
  { name: 'Novartis',        code: 'novartis', active: 1 },
  { name: 'E2E Test Client', code: 'e2etest',  active: 1 },
  { name: 'Inactive Client', code: 'inactive', active: 0 },
];

function guardDatabaseName(name) {
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to seed "${name}". This script only runs against a database ` +
      `whose name ends in "_test" — it deletes rows, and must never touch dev data. ` +
      `Set MYSQL_DATABASE=pharaxis_cp_portal_test.`
    );
  }
}

async function upsertClients(conn) {
  const ids = {};
  for (const c of CLIENTS) {
    const [existing] = await conn.query('SELECT id FROM cp_clients WHERE code = ?', [c.code]);
    if (existing.length) {
      await conn.query('UPDATE cp_clients SET name = ?, is_active = ? WHERE id = ?',
        [c.name, c.active, existing[0].id]);
      ids[c.code] = existing[0].id;
      continue;
    }
    const [res] = await conn.query(
      'INSERT INTO cp_clients (name, code, is_active) VALUES (?, ?, ?)',
      [c.name, c.code, c.active]
    );
    ids[c.code] = res.insertId;
  }
  return ids;
}

async function upsertSuperadmin(conn) {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const [existing] = await conn.query('SELECT id FROM cp_admin_users WHERE email = ?', [ADMIN_EMAIL]);
  if (existing.length) {
    // Reset the password each run so a changed hash can never fail the suite
    // for a reason unrelated to the code under test.
    await conn.query(
      `UPDATE cp_admin_users SET password = ?, role = 'superadmin', is_active = 1,
              client_id = NULL WHERE id = ?`,
      [hash, existing[0].id]
    );
    return existing[0].id;
  }
  const [res] = await conn.query(
    `INSERT INTO cp_admin_users (name, email, password, role, is_active, client_id)
     VALUES (?, ?, ?, 'superadmin', 1, NULL)`,
    ['CP Superadmin', ADMIN_EMAIL, hash]
  );
  return res.insertId;
}

async function main() {
  guardDatabaseName(DB);

  const conn = await mysql.createConnection({
    host: HOST, port: PORT, user: USER, password: PASSWORD, database: DB,
  });

  try {
    console.log(`[seed-e2e:cp-portal] target database: ${DB}`);

    const clientIds = await upsertClients(conn);
    console.log(`[seed-e2e:cp-portal] clients: ${Object.entries(clientIds).map(([c, id]) => `${c}=${id}`).join(' ')}`);

    const adminId = await upsertSuperadmin(conn);
    console.log(`[seed-e2e:cp-portal] superadmin=${adminId} (${ADMIN_EMAIL})`);

    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM cp_clients');
    console.log(`[seed-e2e:cp-portal] done — ${n} clients present`);
  } finally {
    await conn.end();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(`[seed-e2e:cp-portal] FAILED: ${err.message}`);
  process.exit(1);
});
