'use strict';

/**
 * Migration 123 — the dosing frequency list gets its own name (M-111).
 *
 * WHY
 * Each organisation has two picklists named "frequency": one under Adverse
 * Event (how often an event occurred: Single Occurrence, Multiple Occurrences,
 * Continuous, Intermittent) and one under Product (dosing: QD, BID, TID …).
 * The case form groups options by list name, so the AE event Frequency box
 * offered both lists merged — dosing choices for an event, and "Continuous"
 * twice. Decision (Rohith, 2026-09-29): tie each field to its own list.
 *
 * WHAT
 * The Product-category list is renamed "dosing_frequency" (picklist_fields
 * name and legacy_field_type, and its values' field_type), for every
 * organisation. Nothing reads the Product list by the name "frequency": the
 * only dropdown on it is the event box (field_setup picklist_type =
 * 'frequency'); product-info Frequency is free text. seedService seeds the new
 * name for new organisations. Values, ids and records are unchanged.
 *
 * Idempotent: only lists still named "frequency" under Product are touched.
 */

async function up(conn) {
  await conn.execute(
    `UPDATE picklists p
       JOIN picklist_fields pf ON pf.id = p.field_id
       JOIN picklist_categories c ON c.id = pf.category_id
        SET p.field_type = 'dosing_frequency'
      WHERE pf.name = 'frequency' AND c.name = 'Product'`
  );
  await conn.execute(
    `UPDATE picklist_fields pf
       JOIN picklist_categories c ON c.id = pf.category_id
        SET pf.name = 'dosing_frequency', pf.legacy_field_type = 'dosing_frequency'
      WHERE pf.name = 'frequency' AND c.name = 'Product'`
  );
}

module.exports = { up };
