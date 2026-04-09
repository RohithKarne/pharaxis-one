'use strict';

const mysql = require('mysql2/promise');

process.env.MYSQL_HOST = 'localhost';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_USER = 'devuser';
process.env.MYSQL_PASSWORD = 'devpass';
process.env.MYSQL_DATABASE = 'pharaxis_mims_dev';

const { seedNewOrg } = require('../services/seedService');

const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'devuser',
  password: 'devpass',
  database: 'pharaxis_mims_dev',
};

const ORG_A_NAME = 'Seed Test Org Sprint10';
const ORG_B_NAME = 'Seed Test Org Sprint10 B';

const REQUIRED_SECTIONS = [
  'Contact / Requestor',
  'Case Information',
  'AE — General',
  'AE — Events & Seriousness',
  'PC — General',
  'MI — Category & Product',
];

const REQUIRED_FIELDS = [
  'Prefix',
  'Reporter Type',
  'Administration Route',
  'PC Classification',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function placeholders(count) {
  return Array(count).fill('?').join(', ');
}

async function cleanupOrgData(conn, orgIds) {
  if (!orgIds.length) return;
  const ph = placeholders(orgIds.length);

  await conn.execute(`DELETE FROM case_form_definition WHERE org_id IN (${ph})`, orgIds);
  await conn.execute(`DELETE FROM picklists WHERE org_id IN (${ph})`, orgIds);
  await conn.execute(`DELETE FROM picklist_fields WHERE org_id IN (${ph})`, orgIds);
  await conn.execute(`DELETE FROM picklist_categories WHERE org_id IN (${ph})`, orgIds);
  await conn.execute(`DELETE FROM field_setup WHERE org_id IN (${ph})`, orgIds);
  await conn.execute(`DELETE FROM organisations WHERE id IN (${ph})`, orgIds);
}

async function cleanupByOrgNames(conn, names) {
  if (!names.length) return;
  const ph = placeholders(names.length);
  const [rows] = await conn.execute(
    `SELECT id FROM organisations WHERE name IN (${ph})`,
    names
  );
  const ids = rows.map((row) => row.id);
  if (ids.length) {
    await cleanupOrgData(conn, ids);
  }
}

async function runTest(results, name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
    console.log(`PASS - ${name}${detail ? `: ${detail}` : ''}`);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    results.push({ name, ok: false, detail: message });
    console.log(`FAIL - ${name}: ${message}`);
  }
}

(async () => {
  const results = [];
  let conn;
  let testOrgId = null;
  let secondOrgId = null;
  let firstFieldSetupCount = null;

  try {
    conn = await mysql.createConnection(DB_CONFIG);

    // Pre-clean in case a previous run failed before cleanup.
    await cleanupByOrgNames(conn, [ORG_A_NAME, ORG_B_NAME]);

    await runTest(results, 'TEST 1 — seedNewOrg creates field_setup rows for new org', async () => {
      const [insertResult] = await conn.execute(
        'INSERT INTO organisations (name) VALUES (?)',
        [ORG_A_NAME]
      );
      testOrgId = insertResult.insertId;
      assert(testOrgId, 'Unable to insert test org');

      await seedNewOrg(testOrgId, 1);

      const [[row]] = await conn.execute(
        'SELECT COUNT(*) AS cnt FROM field_setup WHERE org_id = ?',
        [testOrgId]
      );
      firstFieldSetupCount = Number(row.cnt || 0);
      assert(firstFieldSetupCount >= 100, `Expected >= 100 field_setup rows, got ${firstFieldSetupCount}`);

      return `org_id=${testOrgId}, field_setup_count=${firstFieldSetupCount}`;
    });

    await runTest(results, 'TEST 2 — field_setup contains required sections', async () => {
      assert(testOrgId, 'testOrgId is not set');
      const [rows] = await conn.execute(
        'SELECT DISTINCT section_name FROM field_setup WHERE org_id = ?',
        [testOrgId]
      );
      const found = new Set(rows.map((row) => row.section_name));
      const missing = REQUIRED_SECTIONS.filter((section) => !found.has(section));
      assert(missing.length === 0, `Missing sections: ${missing.join(', ')}`);
      return `sections_found=${rows.length}`;
    });

    await runTest(results, 'TEST 3 — new fields seeded (Prefix, Reporter Type, Administration Route, PC Classification)', async () => {
      assert(testOrgId, 'testOrgId is not set');
      const [rows] = await conn.execute(
        'SELECT field_name FROM field_setup WHERE org_id = ?',
        [testOrgId]
      );
      const found = new Set(rows.map((row) => row.field_name));
      const missing = REQUIRED_FIELDS.filter((field) => !found.has(field));
      assert(missing.length === 0, `Missing fields: ${missing.join(', ')}`);
      return `fields_checked=${REQUIRED_FIELDS.length}`;
    });

    await runTest(results, 'TEST 4 — picklist_categories created for org', async () => {
      assert(testOrgId, 'testOrgId is not set');
      const [[row]] = await conn.execute(
        'SELECT COUNT(*) AS cnt FROM picklist_categories WHERE org_id = ?',
        [testOrgId]
      );
      const cnt = Number(row.cnt || 0);
      assert(cnt >= 8, `Expected >= 8 picklist_categories, got ${cnt}`);
      return `picklist_categories_count=${cnt}`;
    });

    await runTest(results, 'TEST 5 — picklist values seeded', async () => {
      assert(testOrgId, 'testOrgId is not set');
      const [[row]] = await conn.execute(
        'SELECT COUNT(*) AS cnt FROM picklists WHERE org_id = ?',
        [testOrgId]
      );
      const cnt = Number(row.cnt || 0);
      assert(cnt >= 100, `Expected >= 100 picklists, got ${cnt}`);
      return `picklists_count=${cnt}`;
    });

    await runTest(results, 'TEST 6 — case_form_definition seeded for all 3 case types', async () => {
      assert(testOrgId, 'testOrgId is not set');
      const [rows] = await conn.execute(
        'SELECT DISTINCT case_type FROM case_form_definition WHERE org_id = ?',
        [testOrgId]
      );
      const found = new Set(rows.map((row) => row.case_type));
      const requiredCaseTypes = ['MI', 'AE', 'PC'];
      const missing = requiredCaseTypes.filter((caseType) => !found.has(caseType));
      assert(missing.length === 0, `Missing case types: ${missing.join(', ')}`);
      return `case_types=${Array.from(found).sort().join(',')}`;
    });

    await runTest(results, 'TEST 7 — case_form_definition sections are all visible', async () => {
      assert(testOrgId, 'testOrgId is not set');
      const [[row]] = await conn.execute(
        'SELECT COUNT(*) AS cnt FROM case_form_definition WHERE org_id = ? AND is_visible = 0',
        [testOrgId]
      );
      const cnt = Number(row.cnt || 0);
      assert(cnt === 0, `Expected 0 hidden sections, got ${cnt}`);
      return 'all sections visible';
    });

    await runTest(results, 'TEST 8 — org isolation: seed second org, first org count unchanged', async () => {
      assert(testOrgId, 'testOrgId is not set');
      assert(firstFieldSetupCount !== null, 'Baseline field_setup count is not set');

      const [insertResult] = await conn.execute(
        'INSERT INTO organisations (name) VALUES (?)',
        [ORG_B_NAME]
      );
      secondOrgId = insertResult.insertId;
      assert(secondOrgId, 'Unable to insert second org');

      await seedNewOrg(secondOrgId, 1);

      const [[row]] = await conn.execute(
        'SELECT COUNT(*) AS cnt FROM field_setup WHERE org_id = ?',
        [testOrgId]
      );
      const cnt = Number(row.cnt || 0);
      assert(cnt === firstFieldSetupCount, `Expected ${firstFieldSetupCount}, got ${cnt}`);
      return `first_org_count_unchanged=${cnt}, second_org_id=${secondOrgId}`;
    });

    await runTest(results, 'TEST 9 — no duplicate entries on repeat seedNewOrg call', async () => {
      assert(testOrgId, 'testOrgId is not set');
      assert(firstFieldSetupCount !== null, 'Baseline field_setup count is not set');

      await seedNewOrg(testOrgId, 1);

      const [[row]] = await conn.execute(
        'SELECT COUNT(*) AS cnt FROM field_setup WHERE org_id = ?',
        [testOrgId]
      );
      const cnt = Number(row.cnt || 0);
      assert(cnt === firstFieldSetupCount, `Expected idempotent count ${firstFieldSetupCount}, got ${cnt}`);
      return `field_setup_count_after_reseed=${cnt}`;
    });
  } catch (err) {
    console.log(`FATAL - ${err && err.message ? err.message : String(err)}`);
    results.push({ name: 'FATAL', ok: false, detail: err && err.message ? err.message : String(err) });
  } finally {
    if (conn) {
      try {
        const orgIds = [testOrgId, secondOrgId].filter(Boolean);
        if (orgIds.length) {
          await cleanupOrgData(conn, orgIds);
        }
      } catch (cleanupErr) {
        console.log(`CLEANUP FAIL - ${cleanupErr && cleanupErr.message ? cleanupErr.message : String(cleanupErr)}`);
      }

      await conn.end();
    }

    const passCount = results.filter((row) => row.ok).length;
    const failCount = results.filter((row) => !row.ok).length;
    console.log(`\n${passCount} PASS | ${failCount} FAIL`);

    if (failCount > 0) {
      process.exitCode = 1;
    }
  }
})();
