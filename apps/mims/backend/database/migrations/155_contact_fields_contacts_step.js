'use strict';

/**
 * Migration 155 — Contact / Requestor fields belong to the Contacts step (MIPM-194).
 *
 * Organisations' copies were seeded without a step, so the case page drew the
 * whole section on the Details and Response steps as an empty duplicate of the
 * contact card, with required stars nothing enforced.
 */

async function up(conn) {
  await conn.execute(
    "UPDATE field_setup SET display_tab = 'contacts' WHERE section_name = 'Contact / Requestor' AND display_tab IS NULL AND org_id IS NOT NULL"
  );
}

async function down(_conn) {}

module.exports = { up, down };
