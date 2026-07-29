'use strict';

/**
 * Migration 102 — mark the platform ("core") fields in field_setup.
 *
 * Context: the case form renders its platform fields — Status, Owner, Priority,
 * Date Received, Description, Internal Notes — from hardcoded JSX, AND
 * field_setup separately defines the same fields, which DynamicFieldsSection
 * renders a second time. The result is two boxes for one field. There is proof
 * in the data: case 482695 stored the value "test" against BOTH field_setup
 * id 20 and id 1702, two rows both named "Description".
 *
 * `core_key` ties a field_setup row to the form control that already renders it.
 * With that link:
 *   - the wizard reads label / required / hidden from field_setup, so those
 *     fields are genuinely backend-controlled (Rohith's requirement, 2026-07-28)
 *   - DynamicFieldsSection skips any row that has a core_key, because the wizard
 *     has already drawn it — which is what kills the duplicate
 *
 * The rows are NOT deleted. Deleting them would drop the admin's ability to
 * relabel or hide a core field, which is the opposite of what was asked for.
 */

// field_setup.field_name → the form control that owns it.
// Names are matched case-insensitively and are stable platform labels.
const CORE_FIELD_MAP = {
  'case number':     'case_number',
  'case type':       'case_type',
  'case status':     'status_id',
  'status':          'status_id',
  'case owner':      'case_owner_id',
  'organisation':    'org_id',
  'organization':    'org_id',
  'intake channel':  'intake_channel',
  'priority':        'priority',
  'date received':   'date_received',
  'date of intake':  'date_of_intake',
  'awareness date':  'awareness_date',
  'description':     'description',
  'internal notes':  'internal_notes',
};

async function up(conn) {
  try {
    await conn.execute(
      `ALTER TABLE field_setup ADD COLUMN core_key VARCHAR(64) NULL AFTER field_name_normalized`
    );
  } catch (_) { /* already applied */ }

  try {
    await conn.execute(`CREATE INDEX idx_field_setup_core_key ON field_setup (core_key)`);
  } catch (_) { /* already applied */ }

  // Backfill for every org, including the org_id IS NULL platform defaults.
  for (const [fieldName, coreKey] of Object.entries(CORE_FIELD_MAP)) {
    await conn.execute(
      `UPDATE field_setup
          SET core_key = ?
        WHERE LOWER(TRIM(field_name)) = ?
          AND section_name = 'Case Information'
          AND (core_key IS NULL OR core_key = '')`,
      [coreKey, fieldName]
    );
  }

  // Fields the restructure retired (locked with Rohith 2026-07-28). They stay in
  // field_setup so the decision is visible and reversible by an admin, but they
  // are hidden by default rather than silently dropped:
  //   date_of_intake — merged into Date Received (they were duplicates)
  //   intake_channel — system-set now, shown in the header strip, not editable
  for (const coreKey of ['date_of_intake', 'intake_channel']) {
    await conn.execute(
      `UPDATE field_setup SET is_hidden = 1 WHERE core_key = ? AND is_hidden = 0`,
      [coreKey]
    );
  }
}

module.exports = { up, CORE_FIELD_MAP };
