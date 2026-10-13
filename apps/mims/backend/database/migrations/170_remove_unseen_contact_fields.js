'use strict';

/**
 * Migration 170 — remove the unseen Contact / Requestor settings
 * (case form clean-up PR 2, Rohith 2026-10-13).
 *
 * Twenty-three Contact / Requestor fields were seeded into every organisation
 * by the gap audit (Middle Name, Suffix, five address lines, Mobile Phone,
 * Fax Number, Alternate Email, NPI, DEA, two licence fields, HCP Master Record
 * ID, Department, Job Title, Time Zone, Best Time to Contact, Reporter
 * Anonymous, Reporter Relationship to Patient, Date of First Contact, Linked
 * Reporter). The Reporter & Patient screen draws a fixed set of contact
 * fields and never showed any of them, so an admin could set "required" on a
 * field nobody could fill. A row is deleted only when no case ever stored a
 * value against it; a row with a value is left as it is.
 */

const NAMES = [
  'Middle Name', 'Suffix', 'Address Line 1', 'Address Line 2', 'City', 'State / Province', 'Postal Code',
  'Mobile Phone', 'Fax Number', 'Alternate Email', 'NPI Number', 'DEA Number', 'State Medical License',
  'License State', 'HCP Master Record ID', 'Department within Institution', 'Job Title', 'Time Zone',
  'Best Time to Contact', 'Reporter Anonymous', 'Reporter Relationship to Patient', 'Date of First Contact',
  'Linked Reporter',
];

async function up(conn) {
  const marks = NAMES.map(() => '?').join(', ');
  await conn.execute(
    `DELETE FROM field_setup
      WHERE section_name = 'Contact / Requestor'
        AND field_name IN (${marks})
        AND NOT EXISTS (
          SELECT 1 FROM case_dynamic_field_values v
           WHERE v.field_id = field_setup.id AND v.field_value IS NOT NULL AND v.field_value <> ''
        )`,
    NAMES
  );
}

module.exports = { up };
