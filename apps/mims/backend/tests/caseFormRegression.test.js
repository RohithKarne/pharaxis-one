'use strict';

/**
 * Two demo-breaking defects found during the 2026-07-29 pre-demo sweep.
 * Both were live in the running app; both are the kind that quietly return.
 *
 * 1. Empty optional strings were rejected.
 *    `str()` is Joi.string(), and Joi disallows '' by default, so
 *    `description: str(5000).optional()` meant "you may omit it, but you may not
 *    clear it". The case form sends every field including empty ones, and the
 *    app's own New Case flow creates a case with NO description — so a freshly
 *    created case could not be saved at all:
 *      "Save failed — description: description is not allowed to be empty"
 *
 * 2. field_setup returned every field twice.
 *    Rows exist both as a platform default (org_id IS NULL) and as the org's own
 *    row, and the query `org_id = ? OR org_id IS NULL` returned both — so the
 *    case form rendered two Priority boxes, two Descriptions, and so on. Case
 *    482695 has "test" stored against field_setup id 20 AND id 1702 from a
 *    single user action.
 */

const pool = require('../database/db');
const { schemas } = require('../middleware/validate');

// db.js kicks off an async initialization on require. Without waiting for it,
// afterAll can close the pool mid-init and the suite dies with
// "Can't add new command when connection is in closed state".
beforeAll(async () => { await pool.initPromise; });
afterAll(async () => { await pool.end(); });

describe('case validation — optional text fields accept empty', () => {
  // The form posts the whole shape every time, empty strings included.
  const FORM_SHAPED_PAYLOAD = {
    description: '',
    subject: '',
    priority: '',
    status: '',
    internal_notes: '',
    intake_channel: '',
    date_received: '',
    awareness_date: '',
  };

  test('updateCase accepts the payload a brand-new case actually sends', () => {
    const { error } = schemas.updateCase.validate(FORM_SHAPED_PAYLOAD);
    expect(error).toBeUndefined();
  });

  test.each(['description', 'subject', 'priority', 'status'])(
    'updateCase accepts an empty %s',
    (field) => {
      const { error } = schemas.updateCase.validate({ [field]: '' });
      expect(error).toBeUndefined();
    }
  );

  test('createCase accepts an empty description — New Case does not collect one', () => {
    const { error } = schemas.createCase.validate({ case_type: 'MI', description: '', priority: '' });
    expect(error).toBeUndefined();
  });

  test('still rejects a value that is genuinely invalid', () => {
    // The fix must not turn validation off.
    const tooLong = 'x'.repeat(5001);
    expect(schemas.updateCase.validate({ description: tooLong }).error).toBeDefined();
    expect(schemas.createCase.validate({ case_type: 'NOPE' }).error).toBeDefined();
  });
});

describe('field_setup resolution — one row per field, org wins', () => {
  const ORG_ID = 1;

  // Mirrors the resolution the form-config route performs.
  function resolve(rows) {
    const byKey = new Map();
    for (const row of rows) {
      const key = `${row.section_name}::${String(row.field_name).trim().toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing || (existing.org_id === null && row.org_id !== null)) byKey.set(key, row);
    }
    return [...byKey.values()];
  }

  test('the raw query really does return duplicates — the bug is real, not theoretical', async () => {
    const [rows] = await pool.query(
      `SELECT org_id, section_name, field_name FROM field_setup
        WHERE (org_id = ? OR org_id IS NULL) AND is_hidden = 0 AND is_disabled = 0
          AND section_name = 'Case Information'`,
      [ORG_ID]
    );
    const names = rows.map(r => r.field_name.toLowerCase());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes.length).toBeGreaterThan(0);
  });

  test('resolution collapses them to one row per field', async () => {
    const [rows] = await pool.query(
      `SELECT id, org_id, section_name, field_name FROM field_setup
        WHERE (org_id = ? OR org_id IS NULL) AND is_hidden = 0 AND is_disabled = 0
          AND section_name = 'Case Information'`,
      [ORG_ID]
    );
    const resolved = resolve(rows);
    const names = resolved.map(r => r.field_name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  test("the org's own row wins over the platform default", async () => {
    const [rows] = await pool.query(
      `SELECT id, org_id, section_name, field_name FROM field_setup
        WHERE (org_id = ? OR org_id IS NULL) AND section_name = 'Case Information'
          AND LOWER(field_name) = 'priority'`,
      [ORG_ID]
    );
    // Both rows must exist for this test to mean anything.
    expect(rows.some(r => r.org_id === null)).toBe(true);
    expect(rows.some(r => r.org_id === ORG_ID)).toBe(true);

    const [winner] = resolve(rows);
    expect(winner.org_id).toBe(ORG_ID);
  });

  test('resolution keeps a field the org has not overridden', () => {
    const rows = [
      { id: 1, org_id: null, section_name: 'Case Information', field_name: 'Platform Only' },
      { id: 2, org_id: 1, section_name: 'Case Information', field_name: 'Org Field' },
    ];
    const resolved = resolve(rows);
    expect(resolved.map(r => r.field_name).sort()).toEqual(['Org Field', 'Platform Only']);
  });
});
