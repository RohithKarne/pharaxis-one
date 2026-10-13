'use strict';

/**
 * Migration 172 — re-link the MI panel's MI Status and Literature Reference
 * (case form clean-up PR 2, Rohith 2026-10-13).
 *
 * WHY
 * Same defect as migration 171, for the MI panel. Migration 108 keys the eleven
 * fields the MI panel draws itself, but a database initialised from the schema
 * file records 108 as applied without running it. Nine of the eleven have a
 * platform row and were keyed from it; MI Status and Literature Reference have
 * none, so they stayed unkeyed in every organisation: the panel could not read
 * the admin's settings for them and the configured block drew them again.
 *
 * WHAT
 * Migration 108's statement again, from its own list: core_key only where empty,
 * for every organisation and the platform defaults. Nothing inserted or deleted.
 */

const { up: link108 } = require('./108_link_mi_core_fields');

async function up(conn) {
  await link108(conn);
}

module.exports = { up };
