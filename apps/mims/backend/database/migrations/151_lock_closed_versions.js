'use strict';

/**
 * Migration 151 — a closed AE or PC version is locked (MIPM-161).
 *
 * Closing a version only changed its status, so a closed version stayed editable
 * until the next version was started. The route now locks on close; this locks the
 * versions that were closed before that.
 */

async function up(conn) {
  for (const table of ['case_ae_versions', 'case_pc_versions']) {
    await conn.execute(`UPDATE ${table} SET is_locked = 1, locked_at = COALESCE(locked_at, NOW()) WHERE LOWER(status) = 'closed' AND is_locked = 0`);
  }
}

async function down(_conn) {}

module.exports = { up, down };
