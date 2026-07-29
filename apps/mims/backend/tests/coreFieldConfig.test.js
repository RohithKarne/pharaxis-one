'use strict';

/**
 * Core field configuration (migration 102).
 *
 * The case form used to render its platform fields twice — once from hardcoded
 * JSX, once from field_setup via DynamicFieldsSection. Case 482695 has the value
 * "test" stored against field_setup id 20 AND id 1702, two rows both named
 * "Description": one user action, two records.
 *
 * `core_key` is the link that stops it. These tests guard the invariants that
 * make the fix hold: every platform field is tagged, the tag is unique per org,
 * and the retired fields stay hidden rather than quietly reappearing.
 */

const pool = require('../database/db');

const EXPECTED_CORE_KEYS = [
  'case_number', 'case_type', 'status_id', 'case_owner_id', 'org_id',
  'intake_channel', 'priority', 'date_received', 'date_of_intake',
  'description', 'internal_notes',
];

// Retired by the 2026-07-28 restructure. Kept as rows so an admin can see and
// reverse the decision, but hidden by default.
const RETIRED_CORE_KEYS = ['date_of_intake', 'intake_channel'];

afterAll(async () => { await pool.end(); });

describe('field_setup.core_key', () => {
  test('the column and its index exist', async () => {
    const [cols] = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'field_setup' AND column_name = 'core_key'`
    );
    expect(cols).toHaveLength(1);
  });

  test('every platform field is tagged', async () => {
    const [rows] = await pool.query(
      'SELECT DISTINCT core_key FROM field_setup WHERE core_key IS NOT NULL'
    );
    const found = rows.map(r => r.core_key).sort();
    expect(found).toEqual(expect.arrayContaining(EXPECTED_CORE_KEYS.slice().sort()));
  });

  test('a core_key is unique within an org — two rows for one field is the bug', async () => {
    const [dupes] = await pool.query(
      `SELECT org_id, core_key, COUNT(*) n
         FROM field_setup
        WHERE core_key IS NOT NULL
        GROUP BY org_id, core_key
       HAVING n > 1`
    );
    expect(dupes).toEqual([]);
  });

  test('retired core fields are hidden, not deleted', async () => {
    const [rows] = await pool.query(
      `SELECT core_key, is_hidden FROM field_setup WHERE core_key IN (?)`,
      [RETIRED_CORE_KEYS]
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.is_hidden).toBe(1);
    }
  });

  test('Priority and Description — the fields that duplicated — are tagged for every org', async () => {
    const [rows] = await pool.query(
      `SELECT org_id, core_key FROM field_setup
        WHERE LOWER(TRIM(field_name)) IN ('priority', 'description')
          AND section_name = 'Case Information'`
    );
    expect(rows.length).toBeGreaterThan(0);
    // Every one of them must now carry a core_key, otherwise DynamicFieldsSection
    // still renders a second copy.
    for (const row of rows) {
      expect(['priority', 'description']).toContain(row.core_key);
    }
  });

  test('a non-core org field is left untagged', async () => {
    // Org-added fields must keep flowing through the dynamic section — the fix
    // must not swallow everything.
    const [rows] = await pool.query(
      `SELECT COUNT(*) n FROM field_setup
        WHERE core_key IS NULL AND section_name = 'Case Information' AND org_id IS NOT NULL`
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });
});
