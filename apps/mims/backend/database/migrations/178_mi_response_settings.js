'use strict';

/**
 * Migration 178 — MI response settings, one row per organisation (MI response
 * review, Rohith 2026-10-14).
 *
 * WHY
 * The MI response screen had no settings of its own. What an organisation
 * decides about its answers lived nowhere, or in code:
 * - the off-label statement: an answer about an unapproved use carries a
 *   statement that the use is not approved, with the approved indication,
 *   the important safety information, the prescribing information and the
 *   references (FDA draft guidance on unsolicited requests, 2011);
 * - a closing statement printed on every answer;
 * - whether an off-label answer must enclose the prescribing information;
 * - how many working days a routine and an urgent question have.
 * A missing row means the defaults in services/miResponseSettings.js.
 */

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS mi_response_settings (
      org_id               INT          NOT NULL,
      offlabel_statement   TEXT         NULL,
      closing_statement    TEXT         NULL,
      require_pi_offlabel  TINYINT(1)   NOT NULL DEFAULT 1,
      routine_days         INT          NULL,
      urgent_days          INT          NULL,
      updated_by           INT          NULL,
      updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
