'use strict';

/**
 * Migration 150 — the built-in "Closed" state closes a case (MIPM-158).
 *
 * Migration 140 set workflow_states.is_closed from each state's name, but on a new
 * database the built-in states are created later, by the organisation bootstrap,
 * which did not set it. Every installation made since then has a "Closed" state that
 * MIMS treats as open: closing needs no close permission or password, and a closed
 * case can still be edited.
 *
 * Only the built-in global state named exactly "Closed" is marked; a state an
 * administrator created or renamed is left as they set it.
 */

async function up(conn) {
  await conn.execute("UPDATE workflow_states SET is_closed = 1 WHERE org_id IS NULL AND name = 'Closed' AND is_closed = 0");
}

async function down(_conn) {}

module.exports = { up, down };
