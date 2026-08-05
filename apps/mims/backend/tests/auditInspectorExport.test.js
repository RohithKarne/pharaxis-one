'use strict';

/**
 * PAUD-4 item 3 — inspector audit export defects.
 *
 * Two independent bugs, both proven here before the fix:
 *   1. audit_logs was matched on entity_id alone, so rows belonging to a user,
 *      site or any other entity with the same numeric id landed in a case's pack.
 *   2. The signed PDF truncated the chronology to 34 rows while the signature
 *      was computed over the full payload — we signed one thing and printed
 *      another.
 */

const {
  CASE_SCOPED_AUDIT_ENTITIES,
  buildChronologyLines,
} = require('../services/inspectorExportService');

describe('inspector audit export — chronology completeness', () => {
  test('prints every audit row, not the first 34', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      changed_at: `2026-08-03T10:00:${String(i).padStart(2, '0')}Z`,
      action: 'UPDATE',
      field_name: `field_${i}`,
    }));

    const lines = buildChronologyLines(rows);

    expect(lines).toHaveLength(100);
    expect(lines[99]).toContain('field_99');
  });

  test('an empty trail produces no chronology lines rather than throwing', () => {
    expect(buildChronologyLines([])).toEqual([]);
  });

  test('tolerates rows using the alternate column names', () => {
    const lines = buildChronologyLines([
      { created_at: '2026-08-03T10:00:00Z', change_type: 'CREATE', field: 'status' },
    ]);
    expect(lines[0]).toContain('CREATE');
    expect(lines[0]).toContain('status');
  });

  // The real case_audit_trail columns. The original builder looked for
  // changed_at/action/change_type — none of which exist — so every line printed
  // as "  field_1": no date, no action. Caught during browser verification.
  test('prints the date and action from the ACTUAL case_audit_trail columns', () => {
    const lines = buildChronologyLines([
      { timestamp: '2026-08-05T09:15:00Z', action_type: 'UPDATE', field_name: 'priority' },
    ]);
    expect(lines[0]).toContain('2026-08-05T09:15:00Z');
    expect(lines[0]).toContain('UPDATE');
    expect(lines[0]).toContain('priority');
  });

  test('a row with only a field name does not render as leading whitespace', () => {
    expect(buildChronologyLines([{ field_name: 'status' }])[0]).toBe('status');
  });
});

describe('inspector audit export — record-type scoping', () => {
  test('declares the entity types that are genuinely keyed by case id', () => {
    expect(CASE_SCOPED_AUDIT_ENTITIES).toContain('case');
  });

  test('excludes entities whose entity_id is not a case id', () => {
    // `case_number_config`, `case_form_definition` etc. store their OWN row id in
    // entity_id. Including them would pull unrelated records into a case pack —
    // the original defect.
    expect(CASE_SCOPED_AUDIT_ENTITIES).not.toContain('case_number_config');
    expect(CASE_SCOPED_AUDIT_ENTITIES).not.toContain('case_form_definition');
    expect(CASE_SCOPED_AUDIT_ENTITIES).not.toContain('user');
  });
});
