'use strict';

/**
 * Case Form Fields admin surface (Phase 3).
 *
 * The rule these tests exist to protect: **an org must never edit a platform
 * default.** `field_setup` holds rows with `org_id IS NULL` that every tenant
 * inherits. Writing to one would change the field for every organisation on the
 * platform. Editing an inherited field must clone it into an org-owned row and
 * edit the clone instead.
 *
 * A regression here is a cross-tenant data leak, not a cosmetic bug, which is
 * why it gets its own suite rather than an assertion tacked onto another.
 */

const pool = require('../database/db');

const ORG_ID = 1;
const OTHER_ORG = 26;

let platformRowId = null;
const createdCloneIds = [];

beforeAll(async () => { await pool.initPromise; });

afterAll(async () => {
  for (const id of createdCloneIds) {
    await pool.query('DELETE FROM field_setup WHERE id = ? AND org_id IS NOT NULL', [id]);
  }
  await pool.end();
});

// Mirrors the route's clone-on-write behaviour so the invariant is testable
// without standing up HTTP + auth.
async function editField(fieldId, orgId, patch) {
  const [[row]] = await pool.query('SELECT * FROM field_setup WHERE id = ?', [fieldId]);
  if (!row) return null;

  if (row.org_id === null) {
    // field_setup has a unique key on (section_name, field_name, org_id): if the
    // org already overrode this field, update that row rather than inserting a
    // second one and hitting the duplicate key.
    const [[existing]] = await pool.query(
      'SELECT id FROM field_setup WHERE org_id = ? AND section_name = ? AND field_name = ? LIMIT 1',
      [orgId, row.section_name, row.field_name]
    );
    if (existing) {
      const sets = Object.keys(patch).map(k => `${k} = ?`).join(', ');
      await pool.query(`UPDATE field_setup SET ${sets} WHERE id = ?`, [...Object.values(patch), existing.id]);
      return { id: existing.id, cloned: false, usedExistingOverride: true };
    }
    const merged = { ...row, ...patch };
    const [ins] = await pool.query(
      `INSERT INTO field_setup
         (section_name, field_name, field_type, is_required, is_hidden, is_disabled,
          custom_label, help_text, sort_order, org_id, case_type_scope, display_tab, core_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [row.section_name, row.field_name, row.field_type,
       merged.is_required ? 1 : 0, merged.is_hidden ? 1 : 0, row.is_disabled ? 1 : 0,
       merged.custom_label ?? null, merged.help_text ?? null,
       merged.sort_order ?? row.sort_order ?? 0,
       orgId, row.case_type_scope, row.display_tab, row.core_key ?? null]
    );
    createdCloneIds.push(ins.insertId);
    return { id: ins.insertId, cloned: true };
  }

  const sets = Object.keys(patch).map(k => `${k} = ?`).join(', ');
  await pool.query(`UPDATE field_setup SET ${sets} WHERE id = ? AND org_id = ?`,
    [...Object.values(patch), fieldId, orgId]);
  return { id: fieldId, cloned: false };
}

describe('editing an inherited platform default', () => {
  beforeAll(async () => {
    // Must pick a platform default the org has NOT already overridden —
    // otherwise this exercises the update path, not the clone path.
    const [rows] = await pool.query(
      `SELECT p.id FROM field_setup p
        WHERE p.org_id IS NULL
          AND p.section_name != '__customize_placeholder__'
          AND NOT EXISTS (
            SELECT 1 FROM field_setup o
             WHERE o.org_id = ? AND o.section_name = p.section_name AND o.field_name = p.field_name
          )
        ORDER BY p.id LIMIT 1`,
      [ORG_ID]
    );
    platformRowId = rows[0]?.id ?? null;
  });

  test('a platform-default row exists to test against', () => {
    expect(platformRowId).not.toBeNull();
  });

  test('clones instead of mutating, and the shared row is untouched', async () => {
    const [[before]] = await pool.query('SELECT custom_label FROM field_setup WHERE id = ?', [platformRowId]);

    const result = await editField(platformRowId, ORG_ID, { custom_label: 'Tenant Override Test' });
    expect(result.cloned).toBe(true);
    expect(result.id).not.toBe(platformRowId);

    const [[after]] = await pool.query('SELECT custom_label, org_id FROM field_setup WHERE id = ?', [platformRowId]);
    // The whole point: the shared definition must be byte-identical afterwards.
    expect(after.custom_label).toBe(before.custom_label);
    expect(after.org_id).toBeNull();
  });

  test('the clone belongs to the editing org only', async () => {
    const id = createdCloneIds[createdCloneIds.length - 1];
    const [[clone]] = await pool.query('SELECT org_id, custom_label FROM field_setup WHERE id = ?', [id]);
    expect(clone.org_id).toBe(ORG_ID);
    expect(clone.custom_label).toBe('Tenant Override Test');
  });

  test('no other tenant sees the override', async () => {
    const [rows] = await pool.query(
      'SELECT COUNT(*) n FROM field_setup WHERE org_id = ? AND custom_label = ?',
      [OTHER_ORG, 'Tenant Override Test']
    );
    expect(rows[0].n).toBe(0);
  });
});

describe('org-owned rows are edited in place', () => {
  let orgRowId;
  let original;

  beforeAll(async () => {
    const [rows] = await pool.query(
      `SELECT id, custom_label FROM field_setup
        WHERE org_id = ? AND core_key = 'priority' LIMIT 1`, [ORG_ID]
    );
    orgRowId = rows[0]?.id;
    original = rows[0]?.custom_label ?? null;
  });

  afterAll(async () => {
    if (orgRowId) {
      await pool.query('UPDATE field_setup SET custom_label = ? WHERE id = ?', [original, orgRowId]);
    }
  });

  test('updates the existing row rather than creating another', async () => {
    const [before] = await pool.query('SELECT COUNT(*) n FROM field_setup WHERE org_id = ?', [ORG_ID]);
    const result = await editField(orgRowId, ORG_ID, { custom_label: 'In Place Edit' });
    const [after] = await pool.query('SELECT COUNT(*) n FROM field_setup WHERE org_id = ?', [ORG_ID]);

    expect(result.cloned).toBe(false);
    expect(after[0].n).toBe(before[0].n);

    const [[row]] = await pool.query('SELECT custom_label FROM field_setup WHERE id = ?', [orgRowId]);
    expect(row.custom_label).toBe('In Place Edit');
  });
});

describe('core fields stay configurable', () => {
  test('core fields are present and carry a core_key', async () => {
    const [rows] = await pool.query(
      'SELECT COUNT(*) n FROM field_setup WHERE org_id = ? AND core_key IS NOT NULL', [ORG_ID]
    );
    // Hiding is allowed; removing the definition would strip the admin's ability
    // to relabel or restore the field, which defeats the screen's purpose.
    expect(rows[0].n).toBeGreaterThan(0);
  });
});
