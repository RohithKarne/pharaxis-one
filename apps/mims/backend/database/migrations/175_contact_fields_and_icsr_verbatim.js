'use strict';

/**
 * Migration 175 — the contact classification decision, and a place for the
 * reporter's own words on an ICSR reaction (Rohith, 2026-10-13, on Saad's call).
 *
 * WHY
 * - Contact Type, Reporter Type and Qualification classify one person three
 *   ways. Reporter Type is the one in use: the New Case popup asks it on every
 *   case and the PV hand-off sends it. Contact Type repeats Role and Reporter
 *   Type; Qualification held no value on any case of the local copy. Rohith's
 *   decision: keep Reporter Type, hide the other two. Migration 174 had kept
 *   Contact Type and Reporter Type where cases held values, and hidden Reporter
 *   Type where they held none.
 * - E2B(R3) E.i.1.1a is the reaction as the reporter described it. The ICSR
 *   reaction had no column for it, so the file carried the coded term there.
 *
 * WHAT
 * 1. Contact / Requestor › Contact Type and Qualification: hidden and not
 *    required, for the platform defaults and every organisation. Values kept.
 * 2. Contact / Requestor › Reporter Type: shown, for the platform defaults and
 *    every organisation.
 * 3. icsr_reactions.reaction_verbatim, where missing.
 */

async function up(conn) {
  await conn.execute(
    `UPDATE field_setup SET is_hidden = 1, is_required = 0
      WHERE section_name = 'Contact / Requestor' AND field_name IN ('Contact Type', 'Qualification')`
  );
  await conn.execute(
    `UPDATE field_setup SET is_hidden = 0
      WHERE section_name = 'Contact / Requestor' AND field_name = 'Reporter Type'`
  );
  const [[exists]] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'icsr_reactions' AND COLUMN_NAME = 'reaction_verbatim'`
  );
  if (!exists.n) {
    await conn.execute('ALTER TABLE icsr_reactions ADD COLUMN reaction_verbatim TEXT NULL AFTER icsr_id');
  }
}

module.exports = { up };
