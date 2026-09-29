'use strict';

/**
 * Migration 113 — the priority list says "Urgent", not "Critical" (T12, M-80).
 *
 * The priority picklist offered "Critical", but the dashboard's priority count,
 * the case list's "Urgent" / "High/Urgent" filters and the SLA code all look for
 * "urgent", so a case set to Critical was missed by all of them.
 * Decision (Rohith, 2026-09-29): rename the list value to "Urgent".
 *
 * Checked before writing: no stored priority anywhere is "Critical".
 * Skipped for a field that already has an "Urgent" value (unique field_id+value).
 * The seed (seedService) now creates "Urgent" for new organisations.
 */

async function up(conn) {
  await conn.execute(
    `UPDATE picklists p
       JOIN picklist_fields pf ON pf.id = p.field_id
        SET p.name = 'Urgent',
            p.value = 'Urgent',
            p.governance_note = LEFT(CONCAT_WS(' ', p.governance_note, ?), 255)
      WHERE pf.name = 'priority' AND p.value = 'Critical'
        AND NOT EXISTS (
          SELECT 1 FROM (SELECT field_id, value FROM picklists) u
           WHERE u.field_id = p.field_id AND u.value = 'Urgent'
        )`,
    ['Renamed from "Critical" 2026-09-29 (T12): the app, filters and SLA use "urgent".']
  );
}

module.exports = { up };
