'use strict';

/**
 * inspectorExportService.js — pure helpers for the inspector audit export.
 *
 * PAUD-4 item 3 (approved by Rohith 2026-08-03). Kept free of any database
 * dependency so the rules below can be tested without standing up MySQL.
 */

/**
 * audit_logs.entity_id is only a case id for these entity types. Everything else
 * (case_number_config, case_form_definition, user, site, …) stores its OWN row id
 * there, so matching on entity_id alone pulled unrelated records into a case's
 * inspector pack.
 *
 * Add to this list only when the entity genuinely keys entity_id to a case id.
 */
const CASE_SCOPED_AUDIT_ENTITIES = ['case'];

/**
 * The chronology is printed in full. It previously stopped at 34 rows while the
 * e-signature was computed over the whole payload — the signature attested to
 * something the reader could not see, which is worse than no signature.
 *
 * The column names matter here. `case_audit_trail` stores `timestamp`,
 * `action_type` and `field_name`; the original line-builder looked for
 * `changed_at`/`action`/`change_type`, none of which exist, so every printed
 * line was "  field_1" — no date, no action. An inspector cannot use that.
 * The alternate names are kept as fallbacks for other row shapes.
 */
function buildChronologyLines(auditRows = []) {
  return (auditRows || []).map((row) => {
    const when   = row.timestamp   || row.changed_at || row.created_at || '';
    const what   = row.action_type || row.action     || row.change_type || '';
    const field  = row.field_name  || row.field      || '';
    return `${when} ${what} ${field}`.trim();
  });
}

module.exports = { CASE_SCOPED_AUDIT_ENTITIES, buildChronologyLines };
